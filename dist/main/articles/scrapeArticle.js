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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeArticle = scrapeArticle;
const contentExtractor_1 = require("./contentExtractor");
const db_1 = require("../db");
const imageExtractor_1 = require("../feeds/imageExtractor");
async function scrapeArticle(articleId) {
    const article = await (0, db_1.getArticleById)(articleId);
    if (!article)
        return null;
    const feeds = await (0, db_1.getFeeds)();
    const feed = feeds.find((f) => f.id === article.feedId);
    // For feed content mode, use the content from the RSS/Atom feed itself
    if (feed?.contentMode === 'feed') {
        const feedContentHtml = article.contentHtml || article.description || '';
        if (feedContentHtml) {
            const text = feedContentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            await (0, db_1.updateArticleContent)(articleId, feedContentHtml, text);
            return {
                contentHtml: feedContentHtml,
                contentText: text,
                teaserImageUrl: article.teaserImageUrl || article.imageUrl,
            };
        }
    }
    // Return cached scraped content if available
    if (article.contentHtml && article.contentText) {
        return {
            contentHtml: article.contentHtml,
            contentText: article.contentText,
            teaserImageUrl: article.teaserImageUrl,
        };
    }
    if (!article.link)
        return null;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        const response = await fetch(article.link, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            },
        });
        clearTimeout(timeout);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const html = await response.text();
        const extracted = (0, contentExtractor_1.extractArticleContent)(html, article.link || undefined);
        // Try to fetch teaser image if not found in page
        let teaserImageUrl = extracted.teaserImageUrl;
        if (!teaserImageUrl && !article.imageUrl) {
            teaserImageUrl = await (0, imageExtractor_1.fetchArticleImageFromUrl)(article.link);
        }
        await (0, db_1.updateArticleContent)(articleId, extracted.html, extracted.text);
        // Update teaser image if found
        if (teaserImageUrl) {
            const { updateArticleTeaserImage } = await Promise.resolve().then(() => __importStar(require('../db')));
            await updateArticleTeaserImage(articleId, teaserImageUrl);
        }
        return {
            contentHtml: extracted.html,
            contentText: extracted.text,
            teaserImageUrl: teaserImageUrl || article.imageUrl,
        };
    }
    catch (err) {
        console.error(`Failed to scrape article ${articleId}:`, err);
        return null;
    }
}
//# sourceMappingURL=scrapeArticle.js.map