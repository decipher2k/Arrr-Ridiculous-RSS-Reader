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

import { create } from 'zustand';
import type { Category, Feed, Article, AppSettings, TranslateArticleResult, NiceNewsFilterResult } from '../../shared/types';
import type { SupportedLanguage } from '../../shared/constants';

interface TranslationState {
  translatedTitle: string | null;
  translatedHtml: string | null;
  wordCount: number;
  isTranslating: boolean;
  translationError: string | null;
}

interface AppState {
  categories: Category[];
  selectedCategoryId: string | null;
  feeds: Feed[];
  articles: Article[];
  selectedArticleId: string | null;
  currentArticleContent: { contentHtml: string; contentText: string; teaserImageUrl: string | null; contentSource: 'feed' | 'scraped' } | null;
  settings: AppSettings | null;
  isSettingsOpen: boolean;
  isManageOpen: boolean;
  isLoadingArticles: boolean;
  isLoadingContent: boolean;
  isDedupRunning: boolean;
  showDuplicates: boolean;
  niceNewsEnabled: boolean;
  isNiceNewsFiltering: boolean;
  niceNewsFilteredCount: number;
  niceNewsError: string | null;
  selectedTranslationLanguage: SupportedLanguage | null;
  showTranslation: boolean;
  translation: TranslationState;
  loadCategories: () => Promise<void>;
  selectCategory: (id: string) => Promise<void>;
  selectArticle: (id: string) => Promise<void>;
  loadSettings: () => Promise<void>;
  saveSettings: (settings: AppSettings) => Promise<void>;
  setSettingsOpen: (open: boolean) => void;
  setManageOpen: (open: boolean) => void;
  setShowDuplicates: (show: boolean) => void;
  setNiceNewsEnabled: (enabled: boolean) => void;
  setSelectedTranslationLanguage: (lang: SupportedLanguage | null) => void;
  setShowTranslation: (show: boolean) => void;
  translateCurrentArticle: () => Promise<void>;
  fetchAllFeeds: () => Promise<void>;
  runDeduplication: () => Promise<void>;
  refreshArticles: () => Promise<void>;
  updateArticleTranslation: (articleId: string, translatedTitle: string, translatedDescription: string) => void;
}

async function loadTranslationsForArticles(articles: Article[], language: string | null): Promise<Article[]> {
  if (!language || articles.length === 0) return articles;
  try {
    const articleIds = articles.map((a) => a.id);
    const translations = await window.electronAPI.invoke<Array<{ articleId: string; translatedTitle: string; translatedDescription: string }>>(
      'ai:getTranslations',
      articleIds,
      language
    );
    const translationMap = new Map(translations.map((t) => [t.articleId, t]));
    
    return articles.map((article) => {
      const trans = translationMap.get(article.id);
      if (trans) {
        return {
          ...article,
          translatedTitle: trans.translatedTitle,
          translatedDescription: trans.translatedDescription,
        };
      }
      return {
        ...article,
        translatedTitle: undefined,
        translatedDescription: undefined,
      };
    });
  } catch (err) {
    console.error('[loadTranslationsForArticles] Error:', err);
    return articles;
  }
}

const niceNewsClassificationCache = new Map<string, boolean>();

function niceNewsCacheKey(article: Article): string {
  return `${article.id}:${article.title}`;
}

async function filterNiceNewsArticles(articles: Article[]): Promise<{ articles: Article[]; filteredCount: number; error: string | null }> {
  if (articles.length === 0) {
    return { articles, filteredCount: 0, error: null };
  }

  const negativeIds = new Set<string>();
  const uncachedArticles: Article[] = [];

  for (const article of articles) {
    const cachedIsNegative = niceNewsClassificationCache.get(niceNewsCacheKey(article));
    if (cachedIsNegative === true) {
      negativeIds.add(article.id);
    } else if (cachedIsNegative === undefined) {
      uncachedArticles.push(article);
    }
  }

  if (uncachedArticles.length === 0) {
    return {
      articles: articles.filter((article) => !negativeIds.has(article.id)),
      filteredCount: negativeIds.size,
      error: null,
    };
  }

  try {
    const result = await window.electronAPI.invoke<NiceNewsFilterResult>(
      'ai:filterNiceNews',
      uncachedArticles.map((article) => ({ id: article.id, title: article.title }))
    );

    if (!result.success) {
      return {
        articles: articles.filter((article) => !negativeIds.has(article.id)),
        filteredCount: negativeIds.size,
        error: result.message || 'Nice News filtering failed',
      };
    }

    const newlyNegativeIds = new Set(result.negativeArticleIds);
    for (const article of uncachedArticles) {
      const isNegative = newlyNegativeIds.has(article.id);
      if (isNegative || !result.usedFallbackOnly) {
        niceNewsClassificationCache.set(niceNewsCacheKey(article), isNegative);
      }
      if (isNegative) {
        negativeIds.add(article.id);
      }
    }

    return {
      articles: articles.filter((article) => !negativeIds.has(article.id)),
      filteredCount: negativeIds.size,
      error: null,
    };
  } catch (err) {
    console.error('[filterNiceNewsArticles] Error:', err);
    return {
      articles: articles.filter((article) => !negativeIds.has(article.id)),
      filteredCount: negativeIds.size,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

let articleLoadRunId = 0;

export const useAppStore = create<AppState>((set, get) => ({
  categories: [],
  selectedCategoryId: null,
  feeds: [],
  articles: [],
  selectedArticleId: null,
  currentArticleContent: null,
  settings: null,
  isSettingsOpen: false,
  isManageOpen: false,
  isLoadingArticles: false,
  isLoadingContent: false,
  isDedupRunning: false,
  showDuplicates: false,
  niceNewsEnabled: false,
  isNiceNewsFiltering: false,
  niceNewsFilteredCount: 0,
  niceNewsError: null,
  selectedTranslationLanguage: null,
  showTranslation: false,
  translation: {
    translatedTitle: null,
    translatedHtml: null,
    wordCount: 0,
    isTranslating: false,
    translationError: null,
  },

  loadCategories: async () => {
    const categories = await window.electronAPI.invoke<Category[]>('db:getCategories');
    set({ categories });
    if (categories.length > 0 && !get().selectedCategoryId) {
      await get().selectCategory(categories[0].id);
    }
  },

  selectCategory: async (id) => {
    const runId = ++articleLoadRunId;
    const niceNewsEnabled = get().niceNewsEnabled;
    set({
      selectedCategoryId: id,
      selectedArticleId: null,
      currentArticleContent: null,
      isLoadingArticles: true,
      isNiceNewsFiltering: niceNewsEnabled,
      niceNewsFilteredCount: 0,
      niceNewsError: null,
    });
    const rawArticles = await window.electronAPI.invoke<Article[]>('db:getArticles', id, {
      includeHiddenDuplicates: get().showDuplicates,
    });
    const niceNewsResult = niceNewsEnabled
      ? await filterNiceNewsArticles(rawArticles)
      : { articles: rawArticles, filteredCount: 0, error: null };
    const articles = await loadTranslationsForArticles(niceNewsResult.articles, get().selectedTranslationLanguage);

    if (runId !== articleLoadRunId || get().selectedCategoryId !== id) return;

    set({
      articles,
      isLoadingArticles: false,
      isNiceNewsFiltering: false,
      niceNewsFilteredCount: niceNewsResult.filteredCount,
      niceNewsError: niceNewsResult.error,
    });

    // Trigger batch translation for the new category if a language is selected
    const { selectedTranslationLanguage, settings } = get();
    if (selectedTranslationLanguage && settings?.aiTranslationEnabled && articles.length > 0) {
      const needsTranslation = articles.some((a) => !a.translatedTitle);
      if (needsTranslation) {
        console.log('[selectCategory] Triggering batch translation for', articles.length, 'articles');
        window.electronAPI.invoke('ai:batchTranslateArticles', articles.map((a) => a.id), selectedTranslationLanguage, false)
          .then(() => {
            console.log('[selectCategory] Batch translation complete');
            get().refreshArticles();
          })
          .catch((err) => {
            console.error('[selectCategory] Batch translation failed:', err);
          });
      }
    }

    if (articles.length > 0) {
      await get().selectArticle(articles[0].id);
    }
  },

  selectArticle: async (id) => {
    let { selectedTranslationLanguage, settings } = get();
    set({
      selectedArticleId: id,
      isLoadingContent: true,
      translation: { translatedTitle: null, translatedHtml: null, wordCount: 0, isTranslating: false, translationError: null },
      showTranslation: false,
    });
    const content = await window.electronAPI.invoke<{ contentHtml: string; contentText: string; teaserImageUrl: string | null; contentSource: 'feed' | 'scraped' } | null>('articles:scrape', id);
    set({ currentArticleContent: content, isLoadingContent: false });

    if (!settings) {
      settings = await window.electronAPI.invoke<AppSettings>('settings:get');
      set({ settings });
    }

    if (!selectedTranslationLanguage && settings?.selectedTranslationLanguage) {
      selectedTranslationLanguage = settings.selectedTranslationLanguage as SupportedLanguage;
      set({ selectedTranslationLanguage });
    }
  },

  loadSettings: async () => {
    const settings = await window.electronAPI.invoke<AppSettings>('settings:get');
    set({ 
      settings,
      selectedTranslationLanguage: settings.selectedTranslationLanguage ? (settings.selectedTranslationLanguage as SupportedLanguage) : null,
    });
  },

  saveSettings: async (settings) => {
    await window.electronAPI.invoke<void>('settings:set', settings);
    set({ settings });
  },

  setSettingsOpen: (open) => set({ isSettingsOpen: open }),
  setManageOpen: (open) => set({ isManageOpen: open }),
  setShowDuplicates: async (show) => {
    set({ showDuplicates: show });
    await get().refreshArticles();
  },

  setNiceNewsEnabled: async (enabled) => {
    set({ niceNewsEnabled: enabled, niceNewsError: null });
    await get().refreshArticles();
  },

  setSelectedTranslationLanguage: async (lang) => {
    const { settings, selectedCategoryId, showDuplicates, niceNewsEnabled } = get();
    
    // Save to settings first
    if (settings) {
      const newSettings = { ...settings, selectedTranslationLanguage: lang || '' };
      await window.electronAPI.invoke<void>('settings:set', newSettings);
    }
    
    const aiEnabled = settings?.aiTranslationEnabled;
    
    if (lang && aiEnabled && selectedCategoryId) {
      // Reset current article translation
      set({
        selectedTranslationLanguage: lang,
        translation: {
          translatedTitle: null,
          translatedHtml: null,
          wordCount: 0,
          isTranslating: false,
          translationError: null,
        },
        showTranslation: false,
      });
      
      // ALWAYS reload articles directly from DB to ensure we have the current category's articles
      const runId = ++articleLoadRunId;
      set({ isLoadingArticles: true, isNiceNewsFiltering: niceNewsEnabled, niceNewsFilteredCount: 0, niceNewsError: null });
      const rawArticles = await window.electronAPI.invoke<Article[]>('db:getArticles', selectedCategoryId, {
        includeHiddenDuplicates: showDuplicates,
      });
      console.log('[setSelectedTranslationLanguage] Loaded', rawArticles.length, 'raw articles for category', selectedCategoryId);
      const niceNewsResult = niceNewsEnabled
        ? await filterNiceNewsArticles(rawArticles)
        : { articles: rawArticles, filteredCount: 0, error: null };
      const translatedArticles = await loadTranslationsForArticles(niceNewsResult.articles, lang);

      if (runId !== articleLoadRunId || get().selectedCategoryId !== selectedCategoryId) return;

      set({
        articles: translatedArticles,
        isLoadingArticles: false,
        isNiceNewsFiltering: false,
        niceNewsFilteredCount: niceNewsResult.filteredCount,
        niceNewsError: niceNewsResult.error,
      });

      const { selectedArticleId } = get();
      if (translatedArticles.length === 0) {
        set({ selectedArticleId: null, currentArticleContent: null });
      } else if (!selectedArticleId || !translatedArticles.some((article) => article.id === selectedArticleId)) {
        await get().selectArticle(translatedArticles[0].id);
      }
      
      if (translatedArticles.length > 0) {
        // Trigger background batch translation for ALL articles (force=true)
        console.log('[setSelectedTranslationLanguage] Triggering batch translation for', translatedArticles.length, 'articles');
        window.electronAPI.invoke('ai:batchTranslateArticles', translatedArticles.map((a) => a.id), lang, false)
          .then(() => {
            console.log('[setSelectedTranslationLanguage] Batch translation complete');
            get().refreshArticles();
          })
          .catch((err) => {
            console.error('Batch translation failed:', err);
          });
      }
    } else {
      // No language selected or translation disabled: show original titles
      set({
        selectedTranslationLanguage: lang,
        translation: {
          translatedTitle: null,
          translatedHtml: null,
          wordCount: 0,
          isTranslating: false,
          translationError: null,
        },
        showTranslation: false,
      });
      await get().refreshArticles();
    }
  },

  setShowTranslation: (show) => set({ showTranslation: show }),

  translateCurrentArticle: async () => {
    const { selectedArticleId, selectedTranslationLanguage, settings } = get();
    if (!selectedArticleId || !selectedTranslationLanguage || !settings?.aiTranslationEnabled) {
      return;
    }

    const { translation } = get();
    if (translation.isTranslating) {
      return;
    }

    const targetLang = selectedTranslationLanguage;
    const targetArticleId = selectedArticleId;

    set({ translation: { ...get().translation, isTranslating: true, translationError: null } });

    try {
      const result = await window.electronAPI.invoke<TranslateArticleResult>(
        'ai:translateArticle',
        targetArticleId,
        targetLang
      );

      const current = get();
      if (current.selectedTranslationLanguage !== targetLang || current.selectedArticleId !== targetArticleId) {
        return;
      }

      if (result.success) {
        set({
          translation: {
            translatedTitle: result.title,
            translatedHtml: result.html,
            wordCount: result.wordCount,
            isTranslating: false,
            translationError: null,
          },
          showTranslation: true,
        });
      } else {
        set({
          translation: {
            ...get().translation,
            isTranslating: false,
            translationError: result.message || 'Translation failed',
          },
        });
      }
    } catch (err) {
      const current = get();
      if (current.selectedTranslationLanguage !== targetLang || current.selectedArticleId !== targetArticleId) {
        return;
      }
      set({
        translation: {
          ...get().translation,
          isTranslating: false,
          translationError: err instanceof Error ? err.message : String(err),
        },
      });
    }
  },

  fetchAllFeeds: async () => {
    await window.electronAPI.invoke('feeds:fetchAllFeeds');
    await get().refreshArticles();
  },

  runDeduplication: async () => {
    const { selectedCategoryId } = get();
    if (!selectedCategoryId) return;
    set({ isDedupRunning: true });
    try {
      await window.electronAPI.invoke('ai:deduplicateCategory', selectedCategoryId);
      await get().refreshArticles();
    } finally {
      set({ isDedupRunning: false });
    }
  },

  refreshArticles: async () => {
    const { selectedCategoryId, showDuplicates, selectedTranslationLanguage, niceNewsEnabled } = get();
    if (!selectedCategoryId) return;
    const runId = ++articleLoadRunId;
    set({
      isLoadingArticles: true,
      isNiceNewsFiltering: niceNewsEnabled,
      niceNewsFilteredCount: 0,
      niceNewsError: null,
    });
    const rawArticles = await window.electronAPI.invoke<Article[]>('db:getArticles', selectedCategoryId, {
      includeHiddenDuplicates: showDuplicates,
    });

    const niceNewsResult = niceNewsEnabled
      ? await filterNiceNewsArticles(rawArticles)
      : { articles: rawArticles, filteredCount: 0, error: null };
    const articles = await loadTranslationsForArticles(niceNewsResult.articles, selectedTranslationLanguage);

    if (runId !== articleLoadRunId || get().selectedCategoryId !== selectedCategoryId) return;

    set({
      articles,
      isLoadingArticles: false,
      isNiceNewsFiltering: false,
      niceNewsFilteredCount: niceNewsResult.filteredCount,
      niceNewsError: niceNewsResult.error,
    });

    const { selectedArticleId } = get();
    if (articles.length === 0) {
      set({ selectedArticleId: null, currentArticleContent: null });
    } else if (!selectedArticleId || !articles.some((article) => article.id === selectedArticleId)) {
      await get().selectArticle(articles[0].id);
    }
  },

  updateArticleTranslation: (articleId: string, translatedTitle: string, translatedDescription: string) => {
    set((state) => ({
      articles: state.articles.map((article) =>
        article.id === articleId
          ? { ...article, translatedTitle, translatedDescription }
          : article
      ),
    }));
  },
}));
