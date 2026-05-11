// Copyright 2026 Dennis Michael Heine
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { app, BrowserWindow, shell } from 'electron';
import path from 'path';
import { initDatabase } from './db';
import { registerIpcHandlers } from './ipc';
import { loadSettings } from './settings/settingsStore';
import { fetchAndParseFeed } from './feeds/parseFeed';
import { deduplicateCategory } from './ai/deduplicateTitles';
import { batchTranslateArticleList } from './ai/translateArticle';
import { getFeeds, getCategories } from './db';
import { disposeCurrentProvider, warmupProvider } from './ai/aiProviderFactory';

let mainWindow: BrowserWindow | null = null;
let autoFetchInterval: NodeJS.Timeout | null = null;
let isAutoFetchRunning = false;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    title: 'Arrr - Advanced Robot RSS Reader',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function setupAutoFetch(): Promise<void> {
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
    autoFetchInterval = null;
  }

  const settings = await loadSettings();
  if (!settings.autoFetchEnabled || settings.autoFetchIntervalMinutes < 1) return;

  const intervalMs = settings.autoFetchIntervalMinutes * 60 * 1000;

  autoFetchInterval = setInterval(async () => {
    if (isAutoFetchRunning) {
      console.log('[AutoFetch] Previous run still in progress, skipping this interval.');
      return;
    }
    isAutoFetchRunning = true;
    try {
      const currentSettings = await loadSettings();
      const feeds = await getFeeds();
      let totalNew = 0;
      const allNewArticleIds: string[] = [];
      for (const feed of feeds) {
        try {
          const result = await fetchAndParseFeed(feed);
          totalNew += result.articles.length;
          allNewArticleIds.push(...result.articles.map((a) => a.id));
        } catch (err) {
          console.error(`Auto-fetch failed for feed ${feed.id}:`, err);
        }
      }

      // Background translation for new articles
      if (allNewArticleIds.length > 0 && currentSettings.aiTranslationEnabled && currentSettings.selectedTranslationLanguage) {
        batchTranslateArticleList(allNewArticleIds, currentSettings.selectedTranslationLanguage, currentSettings, false)
          .then(() => {
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('ai:batchTranslationComplete', { articleIds: allNewArticleIds });
            }
          })
          .catch((err) => {
            console.error('Auto-fetch background translation failed:', err);
          });
      }

      if (totalNew > 0 && currentSettings.aiDeduplicationEnabled) {
        // Deduplicate per category
        const categories = await getCategories();
        for (const category of categories) {
          try {
            await deduplicateCategory(category.id, currentSettings);
          } catch (err) {
            console.error(`Auto-dedup failed for category ${category.id}:`, err);
          }
        }
      }

      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('feeds:autoFetchComplete', { totalNew });
      }
    } catch (err) {
      console.error('Auto-fetch interval error:', err);
    } finally {
      isAutoFetchRunning = false;
    }
  }, intervalMs);
}

app.whenReady().then(async () => {
  await initDatabase();
  registerIpcHandlers();
  createWindow();
  setupAutoFetch();

  // Eagerly initialize local LLM provider on startup so the model stays loaded in VRAM
  const settings = await loadSettings();
  if (settings.aiProviderType === 'local') {
    console.log('[Main] Local LLM provider selected. Warming up model eagerly...');
    warmupProvider(settings).then(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:providerReady', { provider: 'local' });
      }
    }).catch((err) => {
      console.error('[Main] Eager warmup failed:', err);
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('ai:providerError', { error: err instanceof Error ? err.message : String(err) });
      }
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
    autoFetchInterval = null;
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  if (autoFetchInterval) {
    clearInterval(autoFetchInterval);
    autoFetchInterval = null;
  }
  await disposeCurrentProvider();
});
