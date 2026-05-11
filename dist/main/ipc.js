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
exports.registerIpcHandlers = registerIpcHandlers;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const db_1 = require("./db");
const parseFeed_1 = require("./feeds/parseFeed");
const scrapeArticle_1 = require("./articles/scrapeArticle");
const deduplicateTitles_1 = require("./ai/deduplicateTitles");
const translateArticle_1 = require("./ai/translateArticle");
const translations_1 = require("./db/translations");
const settingsStore_1 = require("./settings/settingsStore");
const aiProviderFactory_1 = require("./ai/aiProviderFactory");
const modelDownloader_1 = require("./ai/modelDownloader");
const localLlamaProvider_1 = require("./ai/localLlamaProvider");
let activeDownloader = null;
function sendToAllWindows(channel, ...args) {
    electron_1.BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) {
            win.webContents.send(channel, ...args);
        }
    });
}
function registerIpcHandlers() {
    // Categories
    electron_1.ipcMain.handle('db:getCategories', () => (0, db_1.getCategories)());
    electron_1.ipcMain.handle('db:createCategory', async (_event, input) => (0, db_1.createCategory)(input));
    electron_1.ipcMain.handle('db:updateCategory', async (_event, input) => (0, db_1.updateCategory)(input));
    electron_1.ipcMain.handle('db:deleteCategory', async (_event, id) => (0, db_1.deleteCategory)(id));
    electron_1.ipcMain.handle('db:reorderCategories', async (_event, orderedIds) => (0, db_1.reorderCategories)(orderedIds));
    // Feeds
    electron_1.ipcMain.handle('db:getFeeds', () => (0, db_1.getFeeds)());
    electron_1.ipcMain.handle('db:getFeedsByCategory', (_event, categoryId) => (0, db_1.getFeedsByCategory)(categoryId));
    electron_1.ipcMain.handle('db:getFeedCategories', (_event, feedId) => (0, db_1.getFeedCategories)(feedId));
    electron_1.ipcMain.handle('db:createFeed', async (_event, input) => (0, db_1.createFeed)(input));
    electron_1.ipcMain.handle('db:updateFeed', async (_event, input) => (0, db_1.updateFeed)(input));
    electron_1.ipcMain.handle('db:deleteFeed', async (_event, id) => (0, db_1.deleteFeed)(id));
    electron_1.ipcMain.handle('db:reorderFeedsInCategory', async (_event, categoryId, orderedFeedIds) => (0, db_1.reorderFeedsInCategory)(categoryId, orderedFeedIds));
    // Articles
    electron_1.ipcMain.handle('db:getArticles', (_event, categoryId, options) => (0, db_1.getArticlesByCategory)(categoryId, options));
    electron_1.ipcMain.handle('db:getArticleById', (_event, id) => (0, db_1.getArticleById)(id));
    // Helper to trigger background translation after feed fetch
    async function triggerBackgroundTranslation(newArticleIds) {
        if (newArticleIds.length === 0)
            return;
        try {
            const settings = await (0, settingsStore_1.loadSettings)();
            if (settings.aiTranslationEnabled && settings.selectedTranslationLanguage) {
                console.log(`[triggerBackgroundTranslation] Starting batch translation for ${newArticleIds.length} new articles`);
                (0, translateArticle_1.batchTranslateArticleList)(newArticleIds, settings.selectedTranslationLanguage, settings, false)
                    .then(() => {
                    console.log('[triggerBackgroundTranslation] Batch translation complete, sending event');
                    sendToAllWindows('ai:batchTranslationComplete', { articleIds: newArticleIds });
                })
                    .catch((err) => {
                    console.error('Background batch translation failed:', err);
                });
            }
        }
        catch (err) {
            console.error('Failed to check settings for background translation:', err);
        }
    }
    // Feed fetching
    electron_1.ipcMain.handle('feeds:fetchFeed', async (_event, feedId) => {
        const feeds = await (0, db_1.getFeeds)();
        const feed = feeds.find((f) => f.id === feedId);
        if (!feed)
            throw new Error('Feed not found');
        const result = await (0, parseFeed_1.fetchAndParseFeed)(feed);
        const newArticleIds = result.articles.map((a) => a.id);
        triggerBackgroundTranslation(newArticleIds);
        return result;
    });
    electron_1.ipcMain.handle('feeds:fetchAllFeeds', async () => {
        const feeds = await (0, db_1.getFeeds)();
        const results = [];
        const allNewArticleIds = [];
        for (const feed of feeds) {
            try {
                const result = await (0, parseFeed_1.fetchAndParseFeed)(feed);
                results.push({ feedId: feed.id, newArticles: result.articles.length });
                allNewArticleIds.push(...result.articles.map((a) => a.id));
            }
            catch (err) {
                results.push({ feedId: feed.id, newArticles: 0, error: err instanceof Error ? err.message : String(err) });
            }
        }
        triggerBackgroundTranslation(allNewArticleIds);
        return results;
    });
    // Article scraping
    electron_1.ipcMain.handle('articles:scrape', async (_event, articleId) => (0, scrapeArticle_1.scrapeArticle)(articleId));
    // AI deduplication
    electron_1.ipcMain.handle('ai:deduplicateCategory', async (_event, categoryId) => {
        const settings = await (0, settingsStore_1.loadSettings)();
        return (0, deduplicateTitles_1.deduplicateCategory)(categoryId, settings);
    });
    // AI translation
    electron_1.ipcMain.handle('ai:translateArticle', async (_event, articleId, targetLanguage) => {
        console.log('[ipc ai:translateArticle] called. articleId:', articleId, 'targetLanguage:', targetLanguage);
        const settings = await (0, settingsStore_1.loadSettings)();
        console.log('[ipc ai:translateArticle] settings loaded. aiTranslationEnabled:', settings.aiTranslationEnabled, 'selectedTranslationLanguage:', settings.selectedTranslationLanguage);
        return (0, translateArticle_1.translateAndSummarizeArticle)(articleId, targetLanguage, settings);
    });
    electron_1.ipcMain.handle('ai:batchTranslateArticles', async (_event, articleIds, targetLanguage, force = false) => {
        const settings = await (0, settingsStore_1.loadSettings)();
        if (!settings.aiTranslationEnabled || !targetLanguage)
            return { success: false };
        try {
            await (0, translateArticle_1.batchTranslateArticleList)(articleIds, targetLanguage, settings, force, (articleId, title, description) => {
                sendToAllWindows('ai:translationProgress', { articleId, translatedTitle: title, translatedDescription: description });
            });
            return { success: true };
        }
        catch (err) {
            console.error('Batch translation failed:', err);
            return { success: false, error: err instanceof Error ? err.message : String(err) };
        }
    });
    electron_1.ipcMain.handle('ai:getTranslations', async (_event, articleIds, targetLanguage) => {
        return (0, translations_1.getTranslationsForArticles)(articleIds, targetLanguage);
    });
    // Local model download
    electron_1.ipcMain.handle('ai:downloadModel', async () => {
        if (activeDownloader?.running) {
            throw new Error('Download already in progress');
        }
        const destPath = (0, localLlamaProvider_1.getDefaultModelPath)();
        if (fs_1.default.existsSync(destPath)) {
            sendToAllWindows('ai:downloadComplete');
            return { success: true };
        }
        activeDownloader = new modelDownloader_1.ModelDownloader();
        activeDownloader.on('progress', (progress) => {
            sendToAllWindows('ai:downloadProgress', progress);
        });
        activeDownloader.on('complete', () => {
            sendToAllWindows('ai:downloadComplete');
            activeDownloader = null;
        });
        activeDownloader.on('error', (err) => {
            sendToAllWindows('ai:downloadError', err.message);
            activeDownloader = null;
        });
        try {
            await activeDownloader.start((0, localLlamaProvider_1.getModelDownloadUrl)(), destPath);
            return { success: true };
        }
        catch (err) {
            activeDownloader = null;
            throw err;
        }
    });
    electron_1.ipcMain.handle('ai:cancelDownload', () => {
        if (activeDownloader) {
            activeDownloader.cancel();
            activeDownloader = null;
        }
        return { success: true };
    });
    electron_1.ipcMain.handle('ai:getLocalModelStatus', () => {
        const destPath = (0, localLlamaProvider_1.getDefaultModelPath)();
        return {
            exists: fs_1.default.existsSync(destPath),
            path: destPath,
        };
    });
    electron_1.ipcMain.handle('ai:testLocalConnection', async (_event, settings) => {
        try {
            const provider = await (0, aiProviderFactory_1.getProvider)(settings);
            const result = await provider.healthCheck();
            return result;
        }
        catch (err) {
            return {
                ok: false,
                message: `Local connection failed: ${err instanceof Error ? err.message : String(err)}`,
            };
        }
    });
    // Settings
    electron_1.ipcMain.handle('settings:get', () => (0, settingsStore_1.loadSettings)());
    electron_1.ipcMain.handle('settings:set', async (_event, settings) => {
        const oldSettings = await (0, settingsStore_1.loadSettings)();
        await (0, settingsStore_1.saveSettings)(settings);
        // If provider type changed, re-initialize or dispose accordingly
        if (settings.aiProviderType !== oldSettings.aiProviderType) {
            if (settings.aiProviderType === 'local') {
                console.log('[IPC] Provider switched to local. Warming up...');
                (0, aiProviderFactory_1.warmupProvider)(settings).catch((err) => {
                    console.error('[IPC] Local warmup after settings change failed:', err);
                });
            }
            else {
                console.log('[IPC] Provider switched to openai. Disposing local server...');
                await (0, aiProviderFactory_1.disposeCurrentProvider)();
            }
        }
    });
    electron_1.ipcMain.handle('settings:testAiConnection', async (_event, settings) => {
        try {
            const provider = await (0, aiProviderFactory_1.getProvider)(settings);
            const result = await provider.healthCheck();
            return { success: result.ok, message: result.message };
        }
        catch (err) {
            return { success: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    });
    // App
    electron_1.ipcMain.handle('app:openExternal', (_event, url) => electron_1.shell.openExternal(url));
}
//# sourceMappingURL=ipc.js.map