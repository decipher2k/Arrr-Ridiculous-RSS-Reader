"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const electron_1 = require("electron");
const path_1 = __importDefault(require("path"));
const db_1 = require("./db");
const ipc_1 = require("./ipc");
const settingsStore_1 = require("./settings/settingsStore");
const parseFeed_1 = require("./feeds/parseFeed");
const deduplicateTitles_1 = require("./ai/deduplicateTitles");
const translateArticle_1 = require("./ai/translateArticle");
const db_2 = require("./db");
const aiProviderFactory_1 = require("./ai/aiProviderFactory");
let mainWindow = null;
let autoFetchInterval = null;
let isAutoFetchRunning = false;
function createWindow() {
    mainWindow = new electron_1.BrowserWindow({
        width: 1400,
        height: 900,
        title: 'Arrr - Advanced Robot RSS Reader',
        autoHideMenuBar: true,
        webPreferences: {
            preload: path_1.default.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
        },
    });
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    }
    else {
        mainWindow.loadFile(path_1.default.join(__dirname, '../renderer/index.html'));
    }
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        electron_1.shell.openExternal(url);
        return { action: 'deny' };
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}
async function setupAutoFetch() {
    if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        autoFetchInterval = null;
    }
    const settings = await (0, settingsStore_1.loadSettings)();
    if (!settings.autoFetchEnabled || settings.autoFetchIntervalMinutes < 1)
        return;
    const intervalMs = settings.autoFetchIntervalMinutes * 60 * 1000;
    autoFetchInterval = setInterval(async () => {
        if (isAutoFetchRunning) {
            console.log('[AutoFetch] Previous run still in progress, skipping this interval.');
            return;
        }
        isAutoFetchRunning = true;
        try {
            const currentSettings = await (0, settingsStore_1.loadSettings)();
            const feeds = await (0, db_2.getFeeds)();
            let totalNew = 0;
            const allNewArticleIds = [];
            for (const feed of feeds) {
                try {
                    const result = await (0, parseFeed_1.fetchAndParseFeed)(feed);
                    totalNew += result.articles.length;
                    allNewArticleIds.push(...result.articles.map((a) => a.id));
                }
                catch (err) {
                    console.error(`Auto-fetch failed for feed ${feed.id}:`, err);
                }
            }
            // Background translation for new articles
            if (allNewArticleIds.length > 0 && currentSettings.aiTranslationEnabled && currentSettings.selectedTranslationLanguage) {
                (0, translateArticle_1.batchTranslateArticleList)(allNewArticleIds, currentSettings.selectedTranslationLanguage, currentSettings, false)
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
                const categories = await (0, db_2.getCategories)();
                for (const category of categories) {
                    try {
                        await (0, deduplicateTitles_1.deduplicateCategory)(category.id, currentSettings);
                    }
                    catch (err) {
                        console.error(`Auto-dedup failed for category ${category.id}:`, err);
                    }
                }
            }
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('feeds:autoFetchComplete', { totalNew });
            }
        }
        catch (err) {
            console.error('Auto-fetch interval error:', err);
        }
        finally {
            isAutoFetchRunning = false;
        }
    }, intervalMs);
}
electron_1.app.whenReady().then(async () => {
    await (0, db_1.initDatabase)();
    (0, ipc_1.registerIpcHandlers)();
    createWindow();
    setupAutoFetch();
    // Eagerly initialize local LLM provider on startup so the model stays loaded in VRAM
    const settings = await (0, settingsStore_1.loadSettings)();
    if (settings.aiProviderType === 'local') {
        console.log('[Main] Local LLM provider selected. Warming up model eagerly...');
        (0, aiProviderFactory_1.warmupProvider)(settings).then(() => {
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
    electron_1.app.on('activate', () => {
        if (electron_1.BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});
electron_1.app.on('window-all-closed', () => {
    if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        autoFetchInterval = null;
    }
    if (process.platform !== 'darwin') {
        electron_1.app.quit();
    }
});
electron_1.app.on('before-quit', async () => {
    if (autoFetchInterval) {
        clearInterval(autoFetchInterval);
        autoFetchInterval = null;
    }
    await (0, aiProviderFactory_1.disposeCurrentProvider)();
});
//# sourceMappingURL=main.js.map