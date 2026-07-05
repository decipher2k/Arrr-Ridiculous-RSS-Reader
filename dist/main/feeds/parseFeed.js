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
exports.fetchAndParseFeed = fetchAndParseFeed;
const rss_parser_1 = __importDefault(require("rss-parser"));
const db_1 = require("../db");
const imageExtractor_1 = require("./imageExtractor");
const parser = new rss_parser_1.default({
    customFields: {
        item: [
            ['media:content', 'mediaContent'],
            ['media:thumbnail', 'mediaThumbnail'],
            ['enclosure', 'enclosure'],
            ['content:encoded', 'contentEncoded'],
            ['summary', 'summary'],
        ],
    },
});
async function fetchAndParseFeed(feed) {
    const parsedRaw = await parser.parseURL(feed.url);
    const parsed = parsedRaw;
    // Update feed metadata
    const siteUrl = parsed.link ?? feed.siteUrl;
    const imageUrl = (0, imageExtractor_1.extractFeedImage)(parsedRaw) ?? feed.imageUrl;
    const title = parsed.title ?? feed.title;
    if (siteUrl || imageUrl || title) {
        await (0, db_1.updateFeedMeta)(feed.id, {
            title: title || undefined,
            siteUrl: siteUrl || undefined,
            imageUrl: imageUrl || undefined,
        });
    }
    const articles = [];
    for (const rawItem of parsed.items) {
        const item = rawItem;
        const guid = item.guid ?? item.id ?? item.link;
        const title = item.title;
        if (!guid || !title)
            continue;
        const normalizedTitle = title.toLowerCase().trim();
        const link = item.link || '';
        const existing = await (0, db_1.findExistingArticle)(feed.id, guid, link, normalizedTitle);
        if (existing)
            continue;
        const articleId = guid || crypto.randomUUID();
        const pubDate = item.pubDate;
        const publishedAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
        const description = item.summary || item.contentSnippet || item.content || null;
        const contentHtml = feed.contentMode === 'feed'
            ? (item.contentEncoded || item.content || null)
            : null;
        const contentText = contentHtml ? sanitizeDescription(contentHtml) : null;
        const imageUrl = (0, imageExtractor_1.extractArticleImageFromFeedItem)(item) || null;
        const article = {
            id: articleId,
            feedId: feed.id,
            title,
            description: sanitizeDescription(description),
            link,
            imageUrl,
            teaserImageUrl: null,
            publishedAt,
            fetchedAt: new Date().toISOString(),
            contentHtml,
            contentText,
            contentSource: contentHtml ? 'feed' : null,
            duplicateGroupId: null,
            isHiddenDuplicate: 0,
        };
        articles.push(article);
    }
    // Batch insert all new articles at once (reduces writes from N to 1 per feed)
    if (articles.length > 0) {
        await (0, db_1.batchInsertArticles)(articles);
    }
    // Cleanup old articles for each category this feed belongs to
    const categoryIds = await (0, db_1.getFeedCategories)(feed.id);
    for (const categoryId of categoryIds) {
        await (0, db_1.cleanupOldArticlesForCategory)(categoryId);
    }
    return { feed: parsed, articles };
}
function sanitizeDescription(input) {
    if (!input)
        return null;
    return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
//# sourceMappingURL=parseFeed.js.map