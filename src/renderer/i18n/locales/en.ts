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

export default {
  // App / Toolbar
  'app.categorySelected': 'Category selected',
  'app.noCategorySelected': 'No category selected',
  'app.showDuplicates': 'Show duplicates',
  'app.hideDuplicates': 'Hide duplicates',
  'app.deduplicate': 'Deduplicate',
  'app.niceNews': 'Nice News',
  'app.niceNewsFilter': 'Hide negative news with AI',
  'app.niceNewsActive': 'Nice News is active',
  'app.none': '<None>',

  // CategoryBar
  'categoryBar.addCategory': 'Category',
  'categoryBar.categoryNamePlaceholder': 'Name...',
  'categoryBar.add': 'Add',
  'categoryBar.rename': 'Rename',
  'categoryBar.delete': 'Delete',
  'categoryBar.moveLeft': 'Move left',
  'categoryBar.moveRight': 'Move right',
  'categoryBar.confirmDeleteCategory': 'Really delete category?',
  'categoryBar.fetchFeeds': 'Fetch',
  'categoryBar.manageFeeds': 'Manage',
  'categoryBar.settings': 'Settings',

  // ArticleList
  'articleList.news': 'News',
  'articleList.loading': 'Loading...',
  'articleList.noArticles': 'No articles available.',
  'articleList.noDescription': 'No description available.',

  // ArticleView
  'articleView.articleView': 'Article view',
  'articleView.openOriginal': 'Open original',
  'articleView.loading': 'Loading article...',
  'articleView.selectArticle': 'Select an article from the list.',
  'articleView.contentError': 'Article content could not be loaded.',
  'articleView.openInBrowser': 'Open in browser',
  'articleView.original': 'Original',
  'articleView.translated': 'Translated',
  'articleView.translationSummary': 'AI translation',
  'articleView.words': 'words',
  'articleView.translating': 'Translating article...',
  'articleView.translationError': 'Translation failed',
  'articleView.retry': 'Retry',

  // SettingsModal
  'settings.title': 'Settings',
  'settings.aiProvider': 'AI Provider',
  'settings.providerOpenAi': 'OpenAI-compatible (external)',
  'settings.providerLocal': 'Local model (llama.cpp)',
  'settings.apiBaseUrl': 'API Base URL',
  'settings.apiKey': 'API Key',
  'settings.apiKeyHint': 'The key is encrypted and stored locally, never sent to the renderer.',
  'settings.model': 'Model',
  'settings.temperature': 'Temperature',
  'settings.enableDeduplication': 'Enable AI deduplication',
  'settings.enableTranslation': 'Enable AI translation',
  'settings.enableAutoFetch': 'Enable automatic feed fetching',
  'settings.fetchInterval': 'Fetch interval (minutes)',
  'settings.uiLanguage': 'Interface language',
  'settings.testConnection': 'Test connection',
  'settings.save': 'Save',
  'settings.connectionSuccess': 'Connection successful.',
  'settings.connectionFailed': 'Connection failed:',
  'settings.localModel': 'Local Model',
  'settings.localModelReady': 'Model is ready.',
  'settings.localModelNotDownloaded': 'Model not downloaded yet.',
  'settings.downloadModel': 'Download model',
  'settings.downloadWarning': 'The model "ministral-3:3b" (Q4_K_M, ~1.9 GB) will be downloaded. It requires ~4–5 GB VRAM. The download may take several minutes depending on your connection.',
  'settings.downloadConfirm': 'Download',
  'settings.downloading': 'Downloading model...',
  'settings.downloadSpeed': 'Speed',
  'settings.downloadCancel': 'Cancel',
  'settings.localPort': 'Server port',
  'settings.localContextSize': 'Context size',
  'settings.localGpuLayers': 'GPU layers',
  'settings.localCpuFallback': 'Allow CPU fallback (slow)',
  'settings.localTestConnection': 'Test local connection',
  'settings.downloadError': 'Download failed',

  // ManageFeedsModal
  'manageFeeds.title': 'Manage Feeds & Categories',
  'manageFeeds.addNewFeed': 'Add new feed',
  'manageFeeds.titlePlaceholder': 'Title',
  'manageFeeds.urlPlaceholder': 'RSS/Atom URL',
  'manageFeeds.add': 'Add',
  'manageFeeds.existingFeeds': 'Existing feeds',
  'manageFeeds.noFeeds': 'No feeds available.',
  'manageFeeds.loading': 'Loading...',
  'manageFeeds.categories': 'Categories:',
  'manageFeeds.noCategories': 'None',
  'manageFeeds.fetchFeed': 'Fetch feed',
  'manageFeeds.edit': 'Edit',
  'manageFeeds.save': 'Save',
  'manageFeeds.cancel': 'Cancel',
  'manageFeeds.delete': 'Delete',
  'manageFeeds.confirmDeleteFeed': 'Really delete feed?',
  'manageFeeds.contentMode': 'Detail view',
  'manageFeeds.contentModeFeed': 'Feed content',
  'manageFeeds.contentModeScraped': 'Linked article',

  // Common
  'common.error': 'Error',
  'common.success': 'Success',
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.add': 'Add',
  'common.loading': 'Loading...',
  'common.close': 'Close',
};
