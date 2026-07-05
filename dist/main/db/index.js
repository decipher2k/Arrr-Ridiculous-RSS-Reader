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
exports.initDatabase = initDatabase;
exports.getDatabase = getDatabase;
exports.getCategories = getCategories;
exports.createCategory = createCategory;
exports.updateCategory = updateCategory;
exports.deleteCategory = deleteCategory;
exports.reorderCategories = reorderCategories;
exports.getFeeds = getFeeds;
exports.getFeedsByCategory = getFeedsByCategory;
exports.getFeedCategories = getFeedCategories;
exports.createFeed = createFeed;
exports.updateFeed = updateFeed;
exports.deleteFeed = deleteFeed;
exports.reorderFeedsInCategory = reorderFeedsInCategory;
exports.getArticlesByCategory = getArticlesByCategory;
exports.getArticleById = getArticleById;
exports.insertOrUpdateArticle = insertOrUpdateArticle;
exports.batchInsertArticles = batchInsertArticles;
exports.findExistingArticle = findExistingArticle;
exports.updateArticleContent = updateArticleContent;
exports.updateArticleTeaserImage = updateArticleTeaserImage;
exports.markDuplicateGroup = markDuplicateGroup;
exports.resetDuplicateFlagsForCategory = resetDuplicateFlagsForCategory;
exports.deleteOldArticles = deleteOldArticles;
exports.cleanupOldArticlesForCategory = cleanupOldArticlesForCategory;
exports.getArticlesForDedup = getArticlesForDedup;
exports.updateFeedMeta = updateFeedMeta;
exports.insertAiDuplicateRun = insertAiDuplicateRun;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const electron_1 = require("electron");
const sqlite3_1 = __importDefault(require("sqlite3"));
const schema_1 = require("./schema");
const translations_1 = require("./translations");
const DB_DIR = 'rss-reader-db';
const DB_FILE = 'database.sqlite';
let db = null;
function getDbDir() {
    const userData = electron_1.app.getPath('userData');
    const dir = path_1.default.join(userData, DB_DIR);
    if (!fs_1.default.existsSync(dir)) {
        fs_1.default.mkdirSync(dir, { recursive: true });
    }
    return dir;
}
function getDbPath() {
    return path_1.default.join(getDbDir(), DB_FILE);
}
// Promise wrappers for sqlite3
function runSql(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db)
            return reject(new Error('Database not initialized'));
        db.run(sql, params, function (err) {
            if (err)
                reject(err);
            else
                resolve(this);
        });
    });
}
function getRow(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db)
            return reject(new Error('Database not initialized'));
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
}
function getAll(sql, params = []) {
    return new Promise((resolve, reject) => {
        if (!db)
            return reject(new Error('Database not initialized'));
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
}
async function initDatabase() {
    const dbPath = getDbPath();
    db = new sqlite3_1.default.Database(dbPath, sqlite3_1.default.OPEN_READWRITE | sqlite3_1.default.OPEN_CREATE);
    // Enable WAL mode and foreign keys
    await new Promise((resolve, reject) => {
        db.run('PRAGMA journal_mode = WAL', (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    await new Promise((resolve, reject) => {
        db.run('PRAGMA foreign_keys = ON', (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    // Create schema
    await new Promise((resolve, reject) => {
        db.exec(schema_1.schemaSql, (err) => {
            if (err)
                reject(err);
            else
                resolve();
        });
    });
    try {
        await runMigrations();
    }
    catch (migrationErr) {
        console.error('Migration failed:', migrationErr);
    }
}
function getDatabase() {
    if (!db)
        throw new Error('Database not initialized');
    return db;
}
async function runMigrations() {
    await ensureArticleContentSourceColumn();
    await backfillArticleContentSource();
    const migrationDone = await getRow("SELECT value FROM app_metadata WHERE key = 'json_migration_done'");
    if (migrationDone?.value !== '1') {
        const dir = getDbDir();
        const jsonFiles = ['categories.json', 'feeds.json', 'feedCategories.json', 'articles.json', 'aiDuplicateRuns.json'];
        const hasJson = jsonFiles.some((f) => fs_1.default.existsSync(path_1.default.join(dir, f)));
        if (hasJson) {
            console.log('[DB] Migrating JSON data to SQLite...');
            await migrateJsonData();
            console.log('[DB] JSON migration complete.');
        }
        await runSql("INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('json_migration_done', '1')");
    }
}
async function ensureArticleContentSourceColumn() {
    const columns = await getAll('PRAGMA table_info(articles)');
    if (!columns.some((column) => column.name === 'contentSource')) {
        await runSql('ALTER TABLE articles ADD COLUMN contentSource TEXT');
    }
}
async function backfillArticleContentSource() {
    await runSql(`
    UPDATE articles
    SET contentSource = CASE
      WHEN COALESCE((SELECT contentMode FROM feeds WHERE feeds.id = articles.feedId), 'scraped') = 'feed'
        THEN 'feed'
      ELSE 'scraped'
    END
    WHERE contentSource IS NULL
      AND contentHtml IS NOT NULL
      AND TRIM(contentHtml) <> ''
      AND contentText IS NOT NULL
      AND TRIM(contentText) <> ''
  `);
}
async function migrateJsonData() {
    const dir = getDbDir();
    function readJsonFile(filename) {
        const fp = path_1.default.join(dir, filename);
        if (!fs_1.default.existsSync(fp))
            return [];
        try {
            const data = fs_1.default.readFileSync(fp, 'utf-8');
            return JSON.parse(data);
        }
        catch {
            return [];
        }
    }
    function renameJson(filename) {
        const fp = path_1.default.join(dir, filename);
        if (fs_1.default.existsSync(fp)) {
            fs_1.default.renameSync(fp, fp + '.migrated');
        }
    }
    await runSql('BEGIN TRANSACTION');
    try {
        const categories = readJsonFile('categories.json');
        for (const c of categories) {
            await runSql('INSERT OR IGNORE INTO categories (id, name, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [c.id, c.name, c.sortOrder, c.createdAt, c.updatedAt]);
        }
        renameJson('categories.json');
        const feeds = readJsonFile('feeds.json');
        for (const f of feeds) {
            await runSql('INSERT OR IGNORE INTO feeds (id, title, url, siteUrl, imageUrl, contentMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [f.id, f.title, f.url, f.siteUrl ?? null, f.imageUrl ?? null, f.contentMode ?? 'scraped', f.createdAt, f.updatedAt]);
        }
        renameJson('feeds.json');
        const fcs = readJsonFile('feedCategories.json');
        for (const fc of fcs) {
            await runSql('INSERT OR IGNORE INTO feed_categories (feedId, categoryId, sortOrder) VALUES (?, ?, ?)', [fc.feedId, fc.categoryId, fc.sortOrder ?? 0]);
        }
        renameJson('feedCategories.json');
        const articles = readJsonFile('articles.json');
        for (const a of articles) {
            await runSql('INSERT OR IGNORE INTO articles (id, feedId, title, description, link, imageUrl, teaserImageUrl, publishedAt, fetchedAt, contentHtml, contentText, contentSource, duplicateGroupId, isHiddenDuplicate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)', [
                a.id,
                a.feedId,
                a.title,
                a.description ?? null,
                a.link,
                a.imageUrl ?? null,
                a.teaserImageUrl ?? null,
                a.publishedAt ?? null,
                a.fetchedAt,
                a.contentHtml ?? null,
                a.contentText ?? null,
                a.contentSource ?? null,
                a.duplicateGroupId ?? null,
                a.isHiddenDuplicate ?? 0,
            ]);
        }
        renameJson('articles.json');
        const runs = readJsonFile('aiDuplicateRuns.json');
        for (const r of runs) {
            await runSql('INSERT OR IGNORE INTO ai_duplicate_runs (id, categoryId, createdAt, model, inputHash, resultJson) VALUES (?, ?, ?, ?, ?, ?)', [r.id, r.categoryId, r.createdAt, r.model, r.inputHash, r.resultJson]);
        }
        renameJson('aiDuplicateRuns.json');
        const translations = readJsonFile('translations.json');
        for (const t of translations) {
            await runSql('INSERT OR IGNORE INTO article_translations (articleId, targetLanguage, translatedTitle, translatedDescription, translatedHtml, wordCount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [t.articleId, t.targetLanguage, t.translatedTitle, t.translatedDescription, t.translatedHtml, t.wordCount, t.createdAt]);
        }
        renameJson('translations.json');
        await runSql('COMMIT');
    }
    catch (err) {
        await runSql('ROLLBACK');
        throw err;
    }
}
// Categories
async function getCategories() {
    return getAll('SELECT * FROM categories ORDER BY sortOrder, createdAt');
}
async function createCategory(input) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const maxSort = await getRow('SELECT COALESCE(MAX(sortOrder), -1) as maxSort FROM categories');
    const sortOrder = (maxSort?.maxSort ?? -1) + 1;
    const category = {
        id,
        name: input.name.trim(),
        sortOrder,
        createdAt: now,
        updatedAt: now,
    };
    await runSql('INSERT INTO categories (id, name, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)', [category.id, category.name, category.sortOrder, category.createdAt, category.updatedAt]);
    return category;
}
async function updateCategory(input) {
    const now = new Date().toISOString();
    await runSql('UPDATE categories SET name = COALESCE(?, name), sortOrder = COALESCE(?, sortOrder), updatedAt = ? WHERE id = ?', [input.name?.trim(), input.sortOrder, now, input.id]);
    const updated = await getRow('SELECT * FROM categories WHERE id = ?', [input.id]);
    if (!updated)
        throw new Error('Category not found');
    return updated;
}
async function deleteCategory(id) {
    await runSql('DELETE FROM categories WHERE id = ?', [id]);
}
async function reorderCategories(orderedIds) {
    await runSql('BEGIN TRANSACTION');
    try {
        for (let i = 0; i < orderedIds.length; i++) {
            await runSql('UPDATE categories SET sortOrder = ? WHERE id = ?', [i, orderedIds[i]]);
        }
        await runSql('COMMIT');
    }
    catch (err) {
        await runSql('ROLLBACK');
        throw err;
    }
}
// Feeds
async function getFeeds() {
    const rows = await getAll('SELECT * FROM feeds');
    return rows.map((f) => ({
        ...f,
        contentMode: f.contentMode ?? 'scraped',
    }));
}
async function getFeedsByCategory(categoryId) {
    const sql = `
    SELECT f.*, fc.sortOrder
    FROM feeds f
    JOIN feed_categories fc ON f.id = fc.feedId
    WHERE fc.categoryId = ?
    ORDER BY fc.sortOrder
  `;
    const rows = await getAll(sql, [categoryId]);
    return rows.map((f) => ({
        ...f,
        contentMode: f.contentMode ?? 'scraped',
    }));
}
async function getFeedCategories(feedId) {
    const rows = await getAll('SELECT categoryId FROM feed_categories WHERE feedId = ?', [feedId]);
    return rows.map((r) => r.categoryId);
}
async function createFeed(input) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const feed = {
        id,
        title: input.title.trim(),
        url: input.url.trim(),
        siteUrl: input.siteUrl?.trim() ?? null,
        imageUrl: null,
        contentMode: input.contentMode ?? 'scraped',
        createdAt: now,
        updatedAt: now,
    };
    await runSql('BEGIN TRANSACTION');
    try {
        await runSql('INSERT INTO feeds (id, title, url, siteUrl, imageUrl, contentMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [feed.id, feed.title, feed.url, feed.siteUrl, feed.imageUrl, feed.contentMode, feed.createdAt, feed.updatedAt]);
        for (const catId of input.categoryIds) {
            const maxSort = await getRow('SELECT COALESCE(MAX(sortOrder), -1) as maxSort FROM feed_categories WHERE categoryId = ?', [catId]);
            await runSql('INSERT INTO feed_categories (feedId, categoryId, sortOrder) VALUES (?, ?, ?)', [feed.id, catId, (maxSort?.maxSort ?? -1) + 1]);
        }
        await runSql('COMMIT');
    }
    catch (err) {
        await runSql('ROLLBACK');
        throw err;
    }
    return feed;
}
async function updateFeed(input) {
    const now = new Date().toISOString();
    await runSql('BEGIN TRANSACTION');
    try {
        await runSql('UPDATE feeds SET title = COALESCE(?, title), url = COALESCE(?, url), siteUrl = COALESCE(?, siteUrl), contentMode = COALESCE(?, contentMode), updatedAt = ? WHERE id = ?', [input.title?.trim(), input.url?.trim(), input.siteUrl?.trim(), input.contentMode, now, input.id]);
        if (input.categoryIds) {
            await runSql('DELETE FROM feed_categories WHERE feedId = ?', [input.id]);
            for (const catId of input.categoryIds) {
                const maxSort = await getRow('SELECT COALESCE(MAX(sortOrder), -1) as maxSort FROM feed_categories WHERE categoryId = ?', [catId]);
                await runSql('INSERT INTO feed_categories (feedId, categoryId, sortOrder) VALUES (?, ?, ?)', [input.id, catId, (maxSort?.maxSort ?? -1) + 1]);
            }
        }
        await runSql('COMMIT');
    }
    catch (err) {
        await runSql('ROLLBACK');
        throw err;
    }
    const updated = await getRow('SELECT * FROM feeds WHERE id = ?', [input.id]);
    if (!updated)
        throw new Error('Feed not found');
    return { ...updated, contentMode: updated.contentMode ?? 'scraped' };
}
async function deleteFeed(id) {
    await runSql('DELETE FROM feeds WHERE id = ?', [id]);
    // Cascades handle articles, feed_categories, translations
}
async function reorderFeedsInCategory(categoryId, orderedFeedIds) {
    await runSql('BEGIN TRANSACTION');
    try {
        for (let i = 0; i < orderedFeedIds.length; i++) {
            await runSql('UPDATE feed_categories SET sortOrder = ? WHERE feedId = ? AND categoryId = ?', [i, orderedFeedIds[i], categoryId]);
        }
        await runSql('COMMIT');
    }
    catch (err) {
        await runSql('ROLLBACK');
        throw err;
    }
}
// Articles
async function getArticlesByCategory(categoryId, options = {}) {
    const limit = options.limit ?? 100;
    const offset = options.offset ?? 0;
    const showHidden = options.includeHiddenDuplicates ?? false;
    let sql = `
    SELECT a.*, f.title as feedTitle
    FROM articles a
    JOIN feed_categories fc ON a.feedId = fc.feedId
    JOIN feeds f ON a.feedId = f.id
    WHERE fc.categoryId = ?
  `;
    const params = [categoryId];
    if (!showHidden) {
        sql += ' AND a.isHiddenDuplicate = 0';
    }
    sql += ' ORDER BY a.publishedAt DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);
    return getAll(sql, params);
}
async function getArticleById(id) {
    const article = await getRow('SELECT a.*, f.title as feedTitle FROM articles a JOIN feeds f ON a.feedId = f.id WHERE a.id = ?', [id]);
    console.log('[getArticleById] id:', id, 'found:', !!article);
    return article;
}
async function insertOrUpdateArticle(article) {
    const now = new Date().toISOString();
    await runSql(`INSERT INTO articles (id, feedId, title, description, link, imageUrl, teaserImageUrl, publishedAt, fetchedAt, contentHtml, contentText, contentSource, duplicateGroupId, isHiddenDuplicate)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
     ON CONFLICT(id) DO UPDATE SET
       feedId = excluded.feedId,
       title = excluded.title,
       description = excluded.description,
       link = excluded.link,
       imageUrl = excluded.imageUrl,
       teaserImageUrl = excluded.teaserImageUrl,
       publishedAt = excluded.publishedAt,
       fetchedAt = excluded.fetchedAt,
       contentHtml = CASE WHEN excluded.contentSource IS NULL THEN articles.contentHtml ELSE excluded.contentHtml END,
       contentText = CASE WHEN excluded.contentSource IS NULL THEN articles.contentText ELSE excluded.contentText END,
       contentSource = COALESCE(excluded.contentSource, articles.contentSource),
       duplicateGroupId = NULL,
       isHiddenDuplicate = 0`, [
        article.id,
        article.feedId,
        article.title,
        article.description,
        article.link,
        article.imageUrl,
        article.teaserImageUrl,
        article.publishedAt,
        now,
        article.contentHtml,
        article.contentText,
        article.contentSource ?? null,
    ]);
}
async function batchInsertArticles(newArticles) {
    const now = new Date().toISOString();
    await runSql('BEGIN TRANSACTION');
    try {
        for (const article of newArticles) {
            await runSql(`INSERT INTO articles (id, feedId, title, description, link, imageUrl, teaserImageUrl, publishedAt, fetchedAt, contentHtml, contentText, contentSource, duplicateGroupId, isHiddenDuplicate)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
         ON CONFLICT(id) DO UPDATE SET
           feedId = excluded.feedId,
           title = excluded.title,
           description = excluded.description,
           link = excluded.link,
           imageUrl = excluded.imageUrl,
           teaserImageUrl = excluded.teaserImageUrl,
           publishedAt = excluded.publishedAt,
           fetchedAt = excluded.fetchedAt,
           contentHtml = CASE WHEN excluded.contentSource IS NULL THEN articles.contentHtml ELSE excluded.contentHtml END,
           contentText = CASE WHEN excluded.contentSource IS NULL THEN articles.contentText ELSE excluded.contentText END,
           contentSource = COALESCE(excluded.contentSource, articles.contentSource),
           duplicateGroupId = NULL,
           isHiddenDuplicate = 0`, [
                article.id,
                article.feedId,
                article.title,
                article.description,
                article.link,
                article.imageUrl,
                article.teaserImageUrl,
                article.publishedAt,
                now,
                article.contentHtml,
                article.contentText,
                article.contentSource ?? null,
            ]);
        }
        await runSql('COMMIT');
    }
    catch (err) {
        await runSql('ROLLBACK');
        throw err;
    }
}
async function findExistingArticle(feedId, guid, link, normalizedTitle) {
    if (guid) {
        const byGuid = await getRow('SELECT * FROM articles WHERE feedId = ? AND id = ?', [feedId, guid]);
        if (byGuid)
            return byGuid;
    }
    const byLink = await getRow('SELECT * FROM articles WHERE feedId = ? AND link = ?', [feedId, link]);
    if (byLink)
        return byLink;
    const byTitle = await getRow('SELECT * FROM articles WHERE feedId = ? AND LOWER(TRIM(title)) = ?', [feedId, normalizedTitle]);
    return byTitle;
}
async function updateArticleContent(id, contentHtml, contentText, contentSource) {
    await runSql('UPDATE articles SET contentHtml = ?, contentText = ?, contentSource = ? WHERE id = ?', [contentHtml, contentText, contentSource, id]);
}
async function updateArticleTeaserImage(id, teaserImageUrl) {
    await runSql('UPDATE articles SET teaserImageUrl = ? WHERE id = ?', [teaserImageUrl, id]);
}
async function markDuplicateGroup(groupId, canonicalId, duplicateIds) {
    const placeholders = duplicateIds.map(() => '?').join(',');
    const allIds = [canonicalId, ...duplicateIds];
    await runSql(`UPDATE articles SET duplicateGroupId = ?, isHiddenDuplicate = CASE WHEN id = ? THEN 0 ELSE 1 END WHERE id IN (${placeholders})`, [groupId, canonicalId, ...allIds]);
}
async function resetDuplicateFlagsForCategory(categoryId) {
    await runSql(`UPDATE articles SET duplicateGroupId = NULL, isHiddenDuplicate = 0
     WHERE feedId IN (SELECT feedId FROM feed_categories WHERE categoryId = ?)`, [categoryId]);
}
async function deleteOldArticles(olderThanDays) {
    const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
    await runSql('DELETE FROM articles WHERE publishedAt IS NOT NULL AND publishedAt < ?', [cutoff]);
}
const MAX_ARTICLES_PER_CATEGORY = 100;
async function cleanupOldArticlesForCategory(categoryId) {
    const toDelete = await getAll(`SELECT a.id FROM articles a
     JOIN feed_categories fc ON a.feedId = fc.feedId
     WHERE fc.categoryId = ?
       AND a.id NOT IN (
         SELECT id FROM articles a2
         JOIN feed_categories fc2 ON a2.feedId = fc2.feedId
         WHERE fc2.categoryId = ?
         ORDER BY a2.publishedAt DESC
         LIMIT ?
       )`, [categoryId, categoryId, MAX_ARTICLES_PER_CATEGORY]);
    if (toDelete.length === 0)
        return;
    const ids = toDelete.map((d) => d.id);
    const placeholders = ids.map(() => '?').join(',');
    await runSql(`DELETE FROM articles WHERE id IN (${placeholders})`, ids);
    await (0, translations_1.deleteTranslationsForArticles)(ids);
    console.log(`[DB] Cleaned up ${ids.length} old articles for category ${categoryId}.`);
}
async function getArticlesForDedup(categoryId, _daysBack = 7) {
    // Using ROW_NUMBER window function (requires SQLite >= 3.25)
    const sql = `
    SELECT * FROM (
      SELECT a.*, f.title as feedTitle,
        ROW_NUMBER() OVER (PARTITION BY a.feedId ORDER BY a.publishedAt DESC) as rn
      FROM articles a
      JOIN feed_categories fc ON a.feedId = fc.feedId
      JOIN feeds f ON a.feedId = f.id
      WHERE fc.categoryId = ?
    ) WHERE rn <= 10
  `;
    return getAll(sql, [categoryId]);
}
async function updateFeedMeta(feedId, updates) {
    const now = new Date().toISOString();
    await runSql('UPDATE feeds SET title = COALESCE(?, title), siteUrl = COALESCE(?, siteUrl), imageUrl = COALESCE(?, imageUrl), updatedAt = ? WHERE id = ?', [updates.title, updates.siteUrl, updates.imageUrl, now, feedId]);
}
async function insertAiDuplicateRun(run) {
    await runSql('INSERT INTO ai_duplicate_runs (id, categoryId, createdAt, model, inputHash, resultJson) VALUES (?, ?, ?, ?, ?, ?)', [run.id, run.categoryId, run.createdAt, run.model, run.inputHash, run.resultJson]);
}
//# sourceMappingURL=index.js.map