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

import { useEffect } from 'react';
import { useAppStore } from './state/useAppStore';
import { useI18n } from './i18n';
import CategoryBar from './components/CategoryBar';
import ArticleList from './components/ArticleList';
import ArticleView from './components/ArticleView';
import SettingsModal from './components/SettingsModal';
import ManageFeedsModal from './components/ManageFeedsModal';
import { Loader2, Wand2, Eye, EyeOff, Languages } from 'lucide-react';
import { SUPPORTED_LANGUAGES } from '../shared/constants';

export default function App() {
  const { t, lang, setLang } = useI18n();
  const {
    loadCategories,
    loadSettings,
    isDedupRunning,
    runDeduplication,
    showDuplicates,
    setShowDuplicates,
    selectedCategoryId,
    selectedTranslationLanguage,
    setSelectedTranslationLanguage,
    settings,
  } = useAppStore();

  useEffect(() => {
    // Load settings first so they are available before any user interaction
    loadSettings().then(() => {
      loadCategories();
    });

    const removeAutoFetchListener = window.electronAPI.on('feeds:autoFetchComplete', () => {
      useAppStore.getState().refreshArticles();
    });

    const removeBatchTranslationListener = window.electronAPI.on('ai:batchTranslationComplete', () => {
      useAppStore.getState().refreshArticles();
    });

    const removeTranslationProgressListener = window.electronAPI.on('ai:translationProgress', (...args: unknown[]) => {
      const data = args[0] as { articleId: string; translatedTitle: string; translatedDescription: string };
      if (data && data.articleId) {
        useAppStore.getState().updateArticleTranslation(data.articleId, data.translatedTitle, data.translatedDescription);
      }
    });

    return () => {
      removeAutoFetchListener();
      removeBatchTranslationListener();
      removeTranslationProgressListener();
    };
  }, []);

  // Apply UI language from settings
  useEffect(() => {
    if (settings?.uiLanguage && settings.uiLanguage !== lang) {
      setLang(settings.uiLanguage as any);
    }
  }, [settings?.uiLanguage]);

  return (
    <div className="flex flex-col h-screen w-screen bg-slate-50 text-slate-900">
      <CategoryBar />

      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-white border-b border-slate-200 shrink-0">
        <div className="text-xs text-slate-500">
          {selectedCategoryId ? t('app.categorySelected') : t('app.noCategorySelected')}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDuplicates(!showDuplicates)}
            className="flex items-center gap-1 px-2 py-1 text-xs border border-slate-300 rounded hover:bg-slate-50"
            title={showDuplicates ? t('app.hideDuplicates') : t('app.showDuplicates')}
          >
            {showDuplicates ? <Eye size={12} /> : <EyeOff size={12} />}
            {showDuplicates ? t('app.hideDuplicates') : t('app.showDuplicates')}
          </button>
          <button
            onClick={runDeduplication}
            disabled={isDedupRunning || !selectedCategoryId}
            className="flex items-center gap-1 px-2 py-1 text-xs bg-purple-600 text-white rounded hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            title={t('app.deduplicate')}
          >
            {isDedupRunning ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} />}
            {t('app.deduplicate')}
          </button>

          {settings?.aiTranslationEnabled && (
            <div className="flex items-center gap-1">
              <Languages size={12} className="text-slate-500" />
              <select
                value={selectedTranslationLanguage || ''}
                onChange={(e) => {
                  const value = e.target.value;
                  setSelectedTranslationLanguage(value ? (value as any) : null);
                }}
                className="text-xs border border-slate-300 rounded px-2 py-1 bg-white outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="">{t('app.none')}</option>
                {SUPPORTED_LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        <ArticleList />
        <ArticleView />
      </div>

      <SettingsModal />
      <ManageFeedsModal />
    </div>
  );
}
