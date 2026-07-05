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

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type FeedContentMode = 'feed' | 'scraped';

export interface Feed {
  id: string;
  title: string;
  url: string;
  siteUrl: string | null;
  imageUrl: string | null;
  contentMode: FeedContentMode;
  createdAt: string;
  updatedAt: string;
}

export interface FeedCategory {
  feedId: string;
  categoryId: string;
  sortOrder: number;
}

export interface Article {
  id: string;
  feedId: string;
  title: string;
  description: string | null;
  link: string;
  imageUrl: string | null;
  teaserImageUrl: string | null;
  publishedAt: string | null;
  fetchedAt: string;
  contentHtml: string | null;
  contentText: string | null;
  contentSource?: 'feed' | 'scraped' | null;
  duplicateGroupId: string | null;
  isHiddenDuplicate: number; // SQLite boolean as 0/1
  feedTitle?: string; // joined for UI
  translatedTitle?: string; // AI translated title for list view
  translatedDescription?: string; // AI translated description for list view
}

export interface AiDuplicateRun {
  id: string;
  categoryId: string;
  createdAt: string;
  model: string;
  inputHash: string;
  resultJson: string;
}

export type AiProviderType = 'openai' | 'local';

export interface AppSettings {
  aiProviderType: AiProviderType;
  aiBaseUrl: string;
  aiApiKey: string;
  aiModel: string;
  aiTemperature: number;
  aiDeduplicationEnabled: boolean;
  aiTranslationEnabled: boolean;
  selectedTranslationLanguage: string;
  uiLanguage: string;
  autoFetchEnabled: boolean;
  autoFetchIntervalMinutes: number;
  // Local LLM settings
  localLlmPort: number;
  localLlmModelPath: string;
  localLlmContextSize: number;
  localLlmGpuLayers: number;
  localLlmAllowCpuFallback: boolean;
}

export interface CreateCategoryInput {
  name: string;
}

export interface UpdateCategoryInput {
  id: string;
  name: string;
  sortOrder?: number;
}

export interface CreateFeedInput {
  title: string;
  url: string;
  siteUrl?: string;
  categoryIds: string[];
  contentMode?: FeedContentMode;
}

export interface UpdateFeedInput {
  id: string;
  title?: string;
  url?: string;
  siteUrl?: string;
  categoryIds?: string[];
  contentMode?: FeedContentMode;
}

export interface DuplicateGroup {
  canonicalArticleId: string;
  duplicateArticleIds: string[];
  reason: string;
}

export interface AiDedupResult {
  groups: DuplicateGroup[];
}

export interface ArticleInputForDedup {
  id: string;
  title: string;
  publishedAt: string | null;
  source: string;
}

export interface ArticleTranslation {
  articleId: string;
  targetLanguage: string;
  translatedTitle: string;
  translatedDescription: string;
  translatedHtml: string;
  wordCount: number;
  createdAt: string;
}

export interface TranslateArticleInput {
  articleId: string;
  targetLanguage: string;
}

export interface TranslateArticleResult {
  success: boolean;
  title: string;
  html: string;
  wordCount: number;
  cached: boolean;
  message?: string;
}

export interface NiceNewsArticleInput {
  id: string;
  title: string;
}

export interface NiceNewsFilterResult {
  success: boolean;
  negativeArticleIds: string[];
  usedFallbackOnly?: boolean;
  message?: string;
}

export interface ModelDownloadProgress {
  percent: number;
  bytesDownloaded: number;
  totalBytes: number;
  speed: string;
}

export type IpcChannels =
  | 'db:getCategories'
  | 'db:createCategory'
  | 'db:updateCategory'
  | 'db:deleteCategory'
  | 'db:reorderCategories'
  | 'db:getFeeds'
  | 'db:getFeedsByCategory'
  | 'db:getFeedCategories'
  | 'db:createFeed'
  | 'db:updateFeed'
  | 'db:deleteFeed'
  | 'db:reorderFeedsInCategory'
  | 'db:getArticles'
  | 'db:getArticleById'
  | 'feeds:fetchFeed'
  | 'feeds:fetchAllFeeds'
  | 'articles:scrape'
  | 'ai:deduplicateCategory'
  | 'ai:translateArticle'
  | 'ai:batchTranslateArticles'
  | 'ai:getTranslations'
  | 'ai:filterNiceNews'
  | 'ai:downloadModel'
  | 'ai:cancelDownload'
  | 'ai:getLocalModelStatus'
  | 'ai:testLocalConnection'
  | 'settings:get'
  | 'settings:set'
  | 'settings:testAiConnection'
  | 'app:openExternal';
