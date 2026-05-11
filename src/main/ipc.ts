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

import { ipcMain, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  getFeeds,
  getFeedsByCategory,
  getFeedCategories,
  createFeed,
  updateFeed,
  deleteFeed,
  reorderFeedsInCategory,
  getArticlesByCategory,
  getArticleById,
} from './db';
import { fetchAndParseFeed } from './feeds/parseFeed';
import { scrapeArticle } from './articles/scrapeArticle';
import { deduplicateCategory } from './ai/deduplicateTitles';
import { translateAndSummarizeArticle, batchTranslateArticleList } from './ai/translateArticle';
import { getTranslationsForArticles } from './db/translations';
import { loadSettings, saveSettings } from './settings/settingsStore';
import { getProvider, disposeCurrentProvider, warmupProvider } from './ai/aiProviderFactory';
import { ModelDownloader } from './ai/modelDownloader';
import { getDefaultModelPath, getModelDownloadUrl } from './ai/localLlamaProvider';
import type { AppSettings, CreateCategoryInput, UpdateCategoryInput, CreateFeedInput, UpdateFeedInput } from '../shared/types';

let activeDownloader: ModelDownloader | null = null;

function sendToAllWindows(channel: string, ...args: unknown[]): void {
  BrowserWindow.getAllWindows().forEach((win) => {
    if (!win.isDestroyed()) {
      win.webContents.send(channel, ...args);
    }
  });
}

export function registerIpcHandlers(): void {
  // Categories
  ipcMain.handle('db:getCategories', () => getCategories());
  ipcMain.handle('db:createCategory', async (_event, input: CreateCategoryInput) => createCategory(input));
  ipcMain.handle('db:updateCategory', async (_event, input: UpdateCategoryInput) => updateCategory(input));
  ipcMain.handle('db:deleteCategory', async (_event, id: string) => deleteCategory(id));
  ipcMain.handle('db:reorderCategories', async (_event, orderedIds: string[]) => reorderCategories(orderedIds));

  // Feeds
  ipcMain.handle('db:getFeeds', () => getFeeds());
  ipcMain.handle('db:getFeedsByCategory', (_event, categoryId: string) => getFeedsByCategory(categoryId));
  ipcMain.handle('db:getFeedCategories', (_event, feedId: string) => getFeedCategories(feedId));
  ipcMain.handle('db:createFeed', async (_event, input: CreateFeedInput) => createFeed(input));
  ipcMain.handle('db:updateFeed', async (_event, input: UpdateFeedInput) => updateFeed(input));
  ipcMain.handle('db:deleteFeed', async (_event, id: string) => deleteFeed(id));
  ipcMain.handle('db:reorderFeedsInCategory', async (_event, categoryId: string, orderedFeedIds: string[]) =>
    reorderFeedsInCategory(categoryId, orderedFeedIds)
  );

  // Articles
  ipcMain.handle('db:getArticles', (_event, categoryId: string, options?: { includeHiddenDuplicates?: boolean }) =>
    getArticlesByCategory(categoryId, options)
  );
  ipcMain.handle('db:getArticleById', (_event, id: string) => getArticleById(id));

  // Helper to trigger background translation after feed fetch
  async function triggerBackgroundTranslation(newArticleIds: string[]) {
    if (newArticleIds.length === 0) return;
    try {
      const settings = await loadSettings();
      if (settings.aiTranslationEnabled && settings.selectedTranslationLanguage) {
        console.log(`[triggerBackgroundTranslation] Starting batch translation for ${newArticleIds.length} new articles`);
        batchTranslateArticleList(newArticleIds, settings.selectedTranslationLanguage, settings, false)
          .then(() => {
            console.log('[triggerBackgroundTranslation] Batch translation complete, sending event');
            sendToAllWindows('ai:batchTranslationComplete', { articleIds: newArticleIds });
          })
          .catch((err) => {
            console.error('Background batch translation failed:', err);
          });
      }
    } catch (err) {
      console.error('Failed to check settings for background translation:', err);
    }
  }

  // Feed fetching
  ipcMain.handle('feeds:fetchFeed', async (_event, feedId: string) => {
    const feeds = await getFeeds();
    const feed = feeds.find((f) => f.id === feedId);
    if (!feed) throw new Error('Feed not found');
    const result = await fetchAndParseFeed(feed);
    const newArticleIds = result.articles.map((a) => a.id);
    triggerBackgroundTranslation(newArticleIds);
    return result;
  });

  ipcMain.handle('feeds:fetchAllFeeds', async () => {
    const feeds = await getFeeds();
    const results: { feedId: string; newArticles: number; error?: string }[] = [];
    const allNewArticleIds: string[] = [];
    for (const feed of feeds) {
      try {
        const result = await fetchAndParseFeed(feed);
        results.push({ feedId: feed.id, newArticles: result.articles.length });
        allNewArticleIds.push(...result.articles.map((a) => a.id));
      } catch (err) {
        results.push({ feedId: feed.id, newArticles: 0, error: err instanceof Error ? err.message : String(err) });
      }
    }
    triggerBackgroundTranslation(allNewArticleIds);
    return results;
  });

  // Article scraping
  ipcMain.handle('articles:scrape', async (_event, articleId: string) => scrapeArticle(articleId));

  // AI deduplication
  ipcMain.handle('ai:deduplicateCategory', async (_event, categoryId: string) => {
    const settings = await loadSettings();
    return deduplicateCategory(categoryId, settings);
  });

  // AI translation
  ipcMain.handle('ai:translateArticle', async (_event, articleId: string, targetLanguage: string) => {
    console.log('[ipc ai:translateArticle] called. articleId:', articleId, 'targetLanguage:', targetLanguage);
    const settings = await loadSettings();
    console.log('[ipc ai:translateArticle] settings loaded. aiTranslationEnabled:', settings.aiTranslationEnabled, 'selectedTranslationLanguage:', settings.selectedTranslationLanguage);
    return translateAndSummarizeArticle(articleId, targetLanguage, settings);
  });

  ipcMain.handle('ai:batchTranslateArticles', async (_event, articleIds: string[], targetLanguage: string, force = false) => {
    const settings = await loadSettings();
    if (!settings.aiTranslationEnabled || !targetLanguage) return { success: false };
    try {
      await batchTranslateArticleList(articleIds, targetLanguage, settings, force, (articleId, title, description) => {
        sendToAllWindows('ai:translationProgress', { articleId, translatedTitle: title, translatedDescription: description });
      });
      return { success: true };
    } catch (err) {
      console.error('Batch translation failed:', err);
      return { success: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  ipcMain.handle('ai:getTranslations', async (_event, articleIds: string[], targetLanguage: string) => {
    return getTranslationsForArticles(articleIds, targetLanguage);
  });

  // Local model download
  ipcMain.handle('ai:downloadModel', async () => {
    if (activeDownloader?.running) {
      throw new Error('Download already in progress');
    }

    const destPath = getDefaultModelPath();
    if (fs.existsSync(destPath)) {
      sendToAllWindows('ai:downloadComplete');
      return { success: true };
    }

    activeDownloader = new ModelDownloader();

    activeDownloader.on('progress', (progress) => {
      sendToAllWindows('ai:downloadProgress', progress);
    });

    activeDownloader.on('complete', () => {
      sendToAllWindows('ai:downloadComplete');
      activeDownloader = null;
    });

    activeDownloader.on('error', (err: Error) => {
      sendToAllWindows('ai:downloadError', err.message);
      activeDownloader = null;
    });

    try {
      await activeDownloader.start(getModelDownloadUrl(), destPath);
      return { success: true };
    } catch (err) {
      activeDownloader = null;
      throw err;
    }
  });

  ipcMain.handle('ai:cancelDownload', () => {
    if (activeDownloader) {
      activeDownloader.cancel();
      activeDownloader = null;
    }
    return { success: true };
  });

  ipcMain.handle('ai:getLocalModelStatus', () => {
    const destPath = getDefaultModelPath();
    return {
      exists: fs.existsSync(destPath),
      path: destPath,
    };
  });

  ipcMain.handle('ai:testLocalConnection', async (_event, settings: AppSettings) => {
    try {
      const provider = await getProvider(settings);
      const result = await provider.healthCheck();
      return result;
    } catch (err) {
      return {
        ok: false,
        message: `Local connection failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  });

  // Settings
  ipcMain.handle('settings:get', () => loadSettings());
  ipcMain.handle('settings:set', async (_event, settings: AppSettings) => {
    const oldSettings = await loadSettings();
    await saveSettings(settings);

    // If provider type changed, re-initialize or dispose accordingly
    if (settings.aiProviderType !== oldSettings.aiProviderType) {
      if (settings.aiProviderType === 'local') {
        console.log('[IPC] Provider switched to local. Warming up...');
        warmupProvider(settings).catch((err) => {
          console.error('[IPC] Local warmup after settings change failed:', err);
        });
      } else {
        console.log('[IPC] Provider switched to openai. Disposing local server...');
        await disposeCurrentProvider();
      }
    }
  });
  ipcMain.handle('settings:testAiConnection', async (_event, settings: AppSettings) => {
    try {
      const provider = await getProvider(settings);
      const result = await provider.healthCheck();
      return { success: result.ok, message: result.message };
    } catch (err) {
      return { success: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  });

  // App
  ipcMain.handle('app:openExternal', (_event, url: string) => shell.openExternal(url));
}
