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

import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import sqlite3 from 'sqlite3';
import type {
  Category,
  Feed,
  Article,
  CreateCategoryInput,
  UpdateCategoryInput,
  CreateFeedInput,
  UpdateFeedInput,
} from '../../shared/types';
import { schemaSql } from './schema';
import { deleteTranslationsForArticles } from './translations';

const DB_DIR = 'rss-reader-db';
const DB_FILE = 'database.sqlite';

let db: sqlite3.Database | null = null;

function getDbDir(): string {
  const userData = app.getPath('userData');
  const dir = path.join(userData, DB_DIR);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function getDbPath(): string {
  return path.join(getDbDir(), DB_FILE);
}

// Promise wrappers for sqlite3
function runSql(sql: string, params: unknown[] = []): Promise<sqlite3.RunResult> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function getRow<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
}

function getAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    if (!db) return reject(new Error('Database not initialized'));
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export async function initDatabase(): Promise<void> {
  const dbPath = getDbPath();
  db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE | sqlite3.OPEN_CREATE);

  // Enable WAL mode and foreign keys
  await new Promise<void>((resolve, reject) => {
    db!.run('PRAGMA journal_mode = WAL', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });
  await new Promise<void>((resolve, reject) => {
    db!.run('PRAGMA foreign_keys = ON', (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  // Create schema
  await new Promise<void>((resolve, reject) => {
    db!.exec(schemaSql, (err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  try {
    await runMigrations();
  } catch (migrationErr) {
    console.error('Migration failed:', migrationErr);
  }
}

export function getDatabase(): sqlite3.Database {
  if (!db) throw new Error('Database not initialized');
  return db;
}

async function runMigrations(): Promise<void> {
  await ensureArticleContentSourceColumn();
  await backfillArticleContentSource();

  const migrationDone = await getRow<{ value: string }>(
    "SELECT value FROM app_metadata WHERE key = 'json_migration_done'"
  );
  if (migrationDone?.value !== '1') {
    const dir = getDbDir();
    const jsonFiles = ['categories.json', 'feeds.json', 'feedCategories.json', 'articles.json', 'aiDuplicateRuns.json'];
    const hasJson = jsonFiles.some((f) => fs.existsSync(path.join(dir, f)));

    if (hasJson) {
      console.log('[DB] Migrating JSON data to SQLite...');
      await migrateJsonData();
      console.log('[DB] JSON migration complete.');
    }

    await runSql("INSERT OR REPLACE INTO app_metadata (key, value) VALUES ('json_migration_done', '1')");
  }

}

async function ensureArticleContentSourceColumn(): Promise<void> {
  const columns = await getAll<{ name: string }>('PRAGMA table_info(articles)');
  if (!columns.some((column) => column.name === 'contentSource')) {
    await runSql('ALTER TABLE articles ADD COLUMN contentSource TEXT');
  }
}

async function backfillArticleContentSource(): Promise<void> {
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

async function migrateJsonData(): Promise<void> {
  const dir = getDbDir();

  function readJsonFile<T>(filename: string): T[] {
    const fp = path.join(dir, filename);
    if (!fs.existsSync(fp)) return [];
    try {
      const data = fs.readFileSync(fp, 'utf-8');
      return JSON.parse(data) as T[];
    } catch {
      return [];
    }
  }

  function renameJson(filename: string): void {
    const fp = path.join(dir, filename);
    if (fs.existsSync(fp)) {
      fs.renameSync(fp, fp + '.migrated');
    }
  }

  await runSql('BEGIN TRANSACTION');

  try {
    const categories = readJsonFile<Category>('categories.json');
    for (const c of categories) {
      await runSql(
        'INSERT OR IGNORE INTO categories (id, name, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
        [c.id, c.name, c.sortOrder, c.createdAt, c.updatedAt]
      );
    }
    renameJson('categories.json');

    const feeds = readJsonFile<Feed>('feeds.json');
    for (const f of feeds) {
      await runSql(
        'INSERT OR IGNORE INTO feeds (id, title, url, siteUrl, imageUrl, contentMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [f.id, f.title, f.url, f.siteUrl ?? null, f.imageUrl ?? null, f.contentMode ?? 'scraped', f.createdAt, f.updatedAt]
      );
    }
    renameJson('feeds.json');

    const fcs = readJsonFile<{ feedId: string; categoryId: string; sortOrder: number }>('feedCategories.json');
    for (const fc of fcs) {
      await runSql(
        'INSERT OR IGNORE INTO feed_categories (feedId, categoryId, sortOrder) VALUES (?, ?, ?)',
        [fc.feedId, fc.categoryId, fc.sortOrder ?? 0]
      );
    }
    renameJson('feedCategories.json');

    const articles = readJsonFile<Article>('articles.json');
    for (const a of articles) {
      await runSql(
        'INSERT OR IGNORE INTO articles (id, feedId, title, description, link, imageUrl, teaserImageUrl, publishedAt, fetchedAt, contentHtml, contentText, contentSource, duplicateGroupId, isHiddenDuplicate) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
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
        ]
      );
    }
    renameJson('articles.json');

    const runs = readJsonFile<{ id: string; categoryId: string; createdAt: string; model: string; inputHash: string; resultJson: string }>('aiDuplicateRuns.json');
    for (const r of runs) {
      await runSql(
        'INSERT OR IGNORE INTO ai_duplicate_runs (id, categoryId, createdAt, model, inputHash, resultJson) VALUES (?, ?, ?, ?, ?, ?)',
        [r.id, r.categoryId, r.createdAt, r.model, r.inputHash, r.resultJson]
      );
    }
    renameJson('aiDuplicateRuns.json');

    const translations = readJsonFile<{
      articleId: string;
      targetLanguage: string;
      translatedTitle: string;
      translatedDescription: string;
      translatedHtml: string;
      wordCount: number;
      createdAt: string;
    }>('translations.json');
    for (const t of translations) {
      await runSql(
        'INSERT OR IGNORE INTO article_translations (articleId, targetLanguage, translatedTitle, translatedDescription, translatedHtml, wordCount, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [t.articleId, t.targetLanguage, t.translatedTitle, t.translatedDescription, t.translatedHtml, t.wordCount, t.createdAt]
      );
    }
    renameJson('translations.json');

    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK');
    throw err;
  }
}

// Categories
export async function getCategories(): Promise<Category[]> {
  return getAll<Category>('SELECT * FROM categories ORDER BY sortOrder, createdAt');
}

export async function createCategory(input: CreateCategoryInput): Promise<Category> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const maxSort = await getRow<{ maxSort: number }>('SELECT COALESCE(MAX(sortOrder), -1) as maxSort FROM categories');
  const sortOrder = (maxSort?.maxSort ?? -1) + 1;
  const category: Category = {
    id,
    name: input.name.trim(),
    sortOrder,
    createdAt: now,
    updatedAt: now,
  };
  await runSql(
    'INSERT INTO categories (id, name, sortOrder, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)',
    [category.id, category.name, category.sortOrder, category.createdAt, category.updatedAt]
  );
  return category;
}

export async function updateCategory(input: UpdateCategoryInput): Promise<Category> {
  const now = new Date().toISOString();
  await runSql(
    'UPDATE categories SET name = COALESCE(?, name), sortOrder = COALESCE(?, sortOrder), updatedAt = ? WHERE id = ?',
    [input.name?.trim(), input.sortOrder, now, input.id]
  );
  const updated = await getRow<Category>('SELECT * FROM categories WHERE id = ?', [input.id]);
  if (!updated) throw new Error('Category not found');
  return updated;
}

export async function deleteCategory(id: string): Promise<void> {
  await runSql('DELETE FROM categories WHERE id = ?', [id]);
}

export async function reorderCategories(orderedIds: string[]): Promise<void> {
  await runSql('BEGIN TRANSACTION');
  try {
    for (let i = 0; i < orderedIds.length; i++) {
      await runSql('UPDATE categories SET sortOrder = ? WHERE id = ?', [i, orderedIds[i]]);
    }
    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK');
    throw err;
  }
}

// Feeds
export async function getFeeds(): Promise<Feed[]> {
  const rows = await getAll<Feed>('SELECT * FROM feeds');
  return rows.map((f) => ({
    ...f,
    contentMode: f.contentMode ?? 'scraped',
  }));
}

export async function getFeedsByCategory(categoryId: string): Promise<(Feed & { sortOrder: number })[]> {
  const sql = `
    SELECT f.*, fc.sortOrder
    FROM feeds f
    JOIN feed_categories fc ON f.id = fc.feedId
    WHERE fc.categoryId = ?
    ORDER BY fc.sortOrder
  `;
  const rows = await getAll<Feed & { sortOrder: number }>(sql, [categoryId]);
  return rows.map((f) => ({
    ...f,
    contentMode: f.contentMode ?? 'scraped',
  }));
}

export async function getFeedCategories(feedId: string): Promise<string[]> {
  const rows = await getAll<{ categoryId: string }>('SELECT categoryId FROM feed_categories WHERE feedId = ?', [feedId]);
  return rows.map((r) => r.categoryId);
}

export async function createFeed(input: CreateFeedInput): Promise<Feed> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const feed: Feed = {
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
    await runSql(
      'INSERT INTO feeds (id, title, url, siteUrl, imageUrl, contentMode, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [feed.id, feed.title, feed.url, feed.siteUrl, feed.imageUrl, feed.contentMode, feed.createdAt, feed.updatedAt]
    );

    for (const catId of input.categoryIds) {
      const maxSort = await getRow<{ maxSort: number }>(
        'SELECT COALESCE(MAX(sortOrder), -1) as maxSort FROM feed_categories WHERE categoryId = ?',
        [catId]
      );
      await runSql(
        'INSERT INTO feed_categories (feedId, categoryId, sortOrder) VALUES (?, ?, ?)',
        [feed.id, catId, (maxSort?.maxSort ?? -1) + 1]
      );
    }

    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK');
    throw err;
  }

  return feed;
}

export async function updateFeed(input: UpdateFeedInput): Promise<Feed> {
  const now = new Date().toISOString();

  await runSql('BEGIN TRANSACTION');
  try {
    await runSql(
      'UPDATE feeds SET title = COALESCE(?, title), url = COALESCE(?, url), siteUrl = COALESCE(?, siteUrl), contentMode = COALESCE(?, contentMode), updatedAt = ? WHERE id = ?',
      [input.title?.trim(), input.url?.trim(), input.siteUrl?.trim(), input.contentMode, now, input.id]
    );

    if (input.categoryIds) {
      await runSql('DELETE FROM feed_categories WHERE feedId = ?', [input.id]);
      for (const catId of input.categoryIds) {
        const maxSort = await getRow<{ maxSort: number }>(
          'SELECT COALESCE(MAX(sortOrder), -1) as maxSort FROM feed_categories WHERE categoryId = ?',
          [catId]
        );
        await runSql(
          'INSERT INTO feed_categories (feedId, categoryId, sortOrder) VALUES (?, ?, ?)',
          [input.id, catId, (maxSort?.maxSort ?? -1) + 1]
        );
      }
    }

    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK');
    throw err;
  }

  const updated = await getRow<Feed>('SELECT * FROM feeds WHERE id = ?', [input.id]);
  if (!updated) throw new Error('Feed not found');
  return { ...updated, contentMode: updated.contentMode ?? 'scraped' };
}

export async function deleteFeed(id: string): Promise<void> {
  await runSql('DELETE FROM feeds WHERE id = ?', [id]);
  // Cascades handle articles, feed_categories, translations
}

export async function reorderFeedsInCategory(categoryId: string, orderedFeedIds: string[]): Promise<void> {
  await runSql('BEGIN TRANSACTION');
  try {
    for (let i = 0; i < orderedFeedIds.length; i++) {
      await runSql(
        'UPDATE feed_categories SET sortOrder = ? WHERE feedId = ? AND categoryId = ?',
        [i, orderedFeedIds[i], categoryId]
      );
    }
    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK');
    throw err;
  }
}

// Articles
export async function getArticlesByCategory(
  categoryId: string,
  options: { includeHiddenDuplicates?: boolean; limit?: number; offset?: number } = {}
): Promise<Article[]> {
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
  const params: unknown[] = [categoryId];

  if (!showHidden) {
    sql += ' AND a.isHiddenDuplicate = 0';
  }

  sql += ' ORDER BY a.publishedAt DESC LIMIT ? OFFSET ?';
  params.push(limit, offset);

  return getAll<Article>(sql, params);
}

export async function getArticleById(id: string): Promise<Article | undefined> {
  const article = await getRow<Article>(
    'SELECT a.*, f.title as feedTitle FROM articles a JOIN feeds f ON a.feedId = f.id WHERE a.id = ?',
    [id]
  );
  console.log('[getArticleById] id:', id, 'found:', !!article);
  return article;
}

export async function insertOrUpdateArticle(article: {
  id: string;
  feedId: string;
  title: string;
  description: string | null;
  link: string;
  imageUrl: string | null;
  teaserImageUrl: string | null;
  publishedAt: string | null;
  contentHtml: string | null;
  contentText: string | null;
  contentSource?: 'feed' | 'scraped' | null;
}): Promise<void> {
  const now = new Date().toISOString();
  await runSql(
    `INSERT INTO articles (id, feedId, title, description, link, imageUrl, teaserImageUrl, publishedAt, fetchedAt, contentHtml, contentText, contentSource, duplicateGroupId, isHiddenDuplicate)
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
       isHiddenDuplicate = 0`,
    [
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
    ]
  );
}

export async function batchInsertArticles(
  newArticles: Array<{
    id: string;
    feedId: string;
    title: string;
    description: string | null;
    link: string;
    imageUrl: string | null;
    teaserImageUrl: string | null;
    publishedAt: string | null;
    contentHtml: string | null;
    contentText: string | null;
    contentSource?: 'feed' | 'scraped' | null;
  }>
): Promise<void> {
  const now = new Date().toISOString();
  await runSql('BEGIN TRANSACTION');
  try {
    for (const article of newArticles) {
      await runSql(
        `INSERT INTO articles (id, feedId, title, description, link, imageUrl, teaserImageUrl, publishedAt, fetchedAt, contentHtml, contentText, contentSource, duplicateGroupId, isHiddenDuplicate)
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
           isHiddenDuplicate = 0`,
        [
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
        ]
      );
    }
    await runSql('COMMIT');
  } catch (err) {
    await runSql('ROLLBACK');
    throw err;
  }
}

export async function findExistingArticle(
  feedId: string,
  guid: string | null,
  link: string,
  normalizedTitle: string
): Promise<Article | undefined> {
  if (guid) {
    const byGuid = await getRow<Article>('SELECT * FROM articles WHERE feedId = ? AND id = ?', [feedId, guid]);
    if (byGuid) return byGuid;
  }
  const byLink = await getRow<Article>('SELECT * FROM articles WHERE feedId = ? AND link = ?', [feedId, link]);
  if (byLink) return byLink;
  const byTitle = await getRow<Article>(
    'SELECT * FROM articles WHERE feedId = ? AND LOWER(TRIM(title)) = ?',
    [feedId, normalizedTitle]
  );
  return byTitle;
}

export async function updateArticleContent(
  id: string,
  contentHtml: string,
  contentText: string,
  contentSource: 'feed' | 'scraped'
): Promise<void> {
  await runSql(
    'UPDATE articles SET contentHtml = ?, contentText = ?, contentSource = ? WHERE id = ?',
    [contentHtml, contentText, contentSource, id]
  );
}

export async function updateArticleTeaserImage(id: string, teaserImageUrl: string): Promise<void> {
  await runSql('UPDATE articles SET teaserImageUrl = ? WHERE id = ?', [teaserImageUrl, id]);
}

export async function markDuplicateGroup(groupId: string, canonicalId: string, duplicateIds: string[]): Promise<void> {
  const placeholders = duplicateIds.map(() => '?').join(',');
  const allIds = [canonicalId, ...duplicateIds];
  await runSql(
    `UPDATE articles SET duplicateGroupId = ?, isHiddenDuplicate = CASE WHEN id = ? THEN 0 ELSE 1 END WHERE id IN (${placeholders})`,
    [groupId, canonicalId, ...allIds]
  );
}

export async function resetDuplicateFlagsForCategory(categoryId: string): Promise<void> {
  await runSql(
    `UPDATE articles SET duplicateGroupId = NULL, isHiddenDuplicate = 0
     WHERE feedId IN (SELECT feedId FROM feed_categories WHERE categoryId = ?)`,
    [categoryId]
  );
}

export async function deleteOldArticles(olderThanDays: number): Promise<void> {
  const cutoff = new Date(Date.now() - olderThanDays * 86400000).toISOString();
  await runSql('DELETE FROM articles WHERE publishedAt IS NOT NULL AND publishedAt < ?', [cutoff]);
}

const MAX_ARTICLES_PER_CATEGORY = 100;

export async function cleanupOldArticlesForCategory(categoryId: string): Promise<void> {
  const toDelete = await getAll<{ id: string }>(
    `SELECT a.id FROM articles a
     JOIN feed_categories fc ON a.feedId = fc.feedId
     WHERE fc.categoryId = ?
       AND a.id NOT IN (
         SELECT id FROM articles a2
         JOIN feed_categories fc2 ON a2.feedId = fc2.feedId
         WHERE fc2.categoryId = ?
         ORDER BY a2.publishedAt DESC
         LIMIT ?
       )`,
    [categoryId, categoryId, MAX_ARTICLES_PER_CATEGORY]
  );

  if (toDelete.length === 0) return;

  const ids = toDelete.map((d) => d.id);
  const placeholders = ids.map(() => '?').join(',');
  await runSql(`DELETE FROM articles WHERE id IN (${placeholders})`, ids);
  await deleteTranslationsForArticles(ids);

  console.log(`[DB] Cleaned up ${ids.length} old articles for category ${categoryId}.`);
}

export async function getArticlesForDedup(categoryId: string, _daysBack = 7): Promise<Article[]> {
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
  return getAll<Article>(sql, [categoryId]);
}

export async function updateFeedMeta(
  feedId: string,
  updates: { title?: string; siteUrl?: string; imageUrl?: string }
): Promise<void> {
  const now = new Date().toISOString();
  await runSql(
    'UPDATE feeds SET title = COALESCE(?, title), siteUrl = COALESCE(?, siteUrl), imageUrl = COALESCE(?, imageUrl), updatedAt = ? WHERE id = ?',
    [updates.title, updates.siteUrl, updates.imageUrl, now, feedId]
  );
}

export async function insertAiDuplicateRun(run: {
  id: string;
  categoryId: string;
  createdAt: string;
  model: string;
  inputHash: string;
  resultJson: string;
}): Promise<void> {
  await runSql(
    'INSERT INTO ai_duplicate_runs (id, categoryId, createdAt, model, inputHash, resultJson) VALUES (?, ?, ?, ?, ?, ?)',
    [run.id, run.categoryId, run.createdAt, run.model, run.inputHash, run.resultJson]
  );
}
