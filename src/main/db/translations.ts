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

import type { ArticleTranslation } from '../../shared/types';
import { getDatabase } from './index';

function run(sql: string, params: unknown[] = []): Promise<import('sqlite3').RunResult> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get<T>(sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row as T);
    });
  });
}

function all<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const db = getDatabase();
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows as T[]);
    });
  });
}

export async function getTranslation(articleId: string, targetLanguage: string): Promise<ArticleTranslation | undefined> {
  return get<ArticleTranslation>(
    'SELECT * FROM article_translations WHERE articleId = ? AND targetLanguage = ?',
    [articleId, targetLanguage]
  );
}

export async function saveTranslation(translation: ArticleTranslation): Promise<void> {
  await run(
    `INSERT INTO article_translations (articleId, targetLanguage, translatedTitle, translatedDescription, translatedHtml, wordCount, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(articleId, targetLanguage) DO UPDATE SET
       translatedTitle = excluded.translatedTitle,
       translatedDescription = excluded.translatedDescription,
       translatedHtml = excluded.translatedHtml,
       wordCount = excluded.wordCount,
       createdAt = excluded.createdAt`,
    [
      translation.articleId,
      translation.targetLanguage,
      translation.translatedTitle,
      translation.translatedDescription,
      translation.translatedHtml,
      translation.wordCount,
      translation.createdAt,
    ]
  );
}

export async function deleteTranslation(articleId: string, targetLanguage: string): Promise<void> {
  await run('DELETE FROM article_translations WHERE articleId = ? AND targetLanguage = ?', [
    articleId,
    targetLanguage,
  ]);
}

export async function getTranslationsForArticles(articleIds: string[], targetLanguage: string): Promise<ArticleTranslation[]> {
  if (articleIds.length === 0) return [];
  const placeholders = articleIds.map(() => '?').join(',');
  return all<ArticleTranslation>(
    `SELECT * FROM article_translations WHERE articleId IN (${placeholders}) AND targetLanguage = ?`,
    [...articleIds, targetLanguage]
  );
}

export async function deleteTranslationsForArticles(articleIds: string[]): Promise<void> {
  if (articleIds.length === 0) return;
  const placeholders = articleIds.map(() => '?').join(',');
  await run(`DELETE FROM article_translations WHERE articleId IN (${placeholders})`, articleIds);
}
