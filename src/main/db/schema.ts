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

export const schemaSql = `
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feeds (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  siteUrl TEXT,
  imageUrl TEXT,
  contentMode TEXT NOT NULL DEFAULT 'scraped',
  createdAt TEXT NOT NULL,
  updatedAt TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_categories (
  feedId TEXT NOT NULL,
  categoryId TEXT NOT NULL,
  sortOrder INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (feedId, categoryId),
  FOREIGN KEY (feedId) REFERENCES feeds(id) ON DELETE CASCADE,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY,
  feedId TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  link TEXT NOT NULL,
  imageUrl TEXT,
  teaserImageUrl TEXT,
  publishedAt TEXT,
  fetchedAt TEXT NOT NULL,
  contentHtml TEXT,
  contentText TEXT,
  contentSource TEXT,
  duplicateGroupId TEXT,
  isHiddenDuplicate INTEGER NOT NULL DEFAULT 0,
  FOREIGN KEY (feedId) REFERENCES feeds(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_articles_feedId ON articles(feedId);
CREATE INDEX IF NOT EXISTS idx_articles_duplicateGroupId ON articles(duplicateGroupId);
CREATE INDEX IF NOT EXISTS idx_articles_publishedAt ON articles(publishedAt);

CREATE TABLE IF NOT EXISTS ai_duplicate_runs (
  id TEXT PRIMARY KEY,
  categoryId TEXT NOT NULL,
  createdAt TEXT NOT NULL,
  model TEXT NOT NULL,
  inputHash TEXT NOT NULL,
  resultJson TEXT NOT NULL,
  FOREIGN KEY (categoryId) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS article_translations (
  articleId TEXT NOT NULL,
  targetLanguage TEXT NOT NULL,
  translatedTitle TEXT NOT NULL,
  translatedDescription TEXT NOT NULL,
  translatedHtml TEXT NOT NULL,
  wordCount INTEGER NOT NULL DEFAULT 0,
  createdAt TEXT NOT NULL,
  PRIMARY KEY (articleId, targetLanguage),
  FOREIGN KEY (articleId) REFERENCES articles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`;

export const migrations = [
  {
    version: 1,
    sql: schemaSql,
  },
];
