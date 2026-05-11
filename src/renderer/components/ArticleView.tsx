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

import { useAppStore } from '../state/useAppStore';
import { useI18n } from '../i18n';
import { Loader2, ExternalLink, AlertCircle, FileText, Globe } from 'lucide-react';
import DOMPurify from 'dompurify';
import { useEffect } from 'react';

export default function ArticleView() {
  const { t } = useI18n();
  const {
    currentArticleContent,
    selectedArticleId,
    articles,
    isLoadingContent,
    showTranslation,
    setShowTranslation,
    translation,
    selectedTranslationLanguage,
    settings,
  } = useAppStore();

  // Ensure translation is triggered when article or language changes
  useEffect(() => {
    console.log('[ArticleView useEffect] selectedArticleId:', selectedArticleId, 'selectedTranslationLanguage:', selectedTranslationLanguage, 'aiEnabled:', settings?.aiTranslationEnabled, 'isTranslating:', translation.isTranslating, 'translatedHtml:', translation.translatedHtml, 'error:', translation.translationError);
    if (selectedArticleId && selectedTranslationLanguage && settings?.aiTranslationEnabled && !translation.isTranslating && !translation.translatedHtml && !translation.translationError) {
      console.log('[ArticleView useEffect] Triggering translateCurrentArticle');
      useAppStore.getState().translateCurrentArticle();
    }
  }, [selectedArticleId, selectedTranslationLanguage, settings?.aiTranslationEnabled, translation.isTranslating, translation.translatedHtml, translation.translationError]);

  const article = articles.find((a) => a.id === selectedArticleId);

  const handleOpenExternal = () => {
    if (article?.link) {
      window.electronAPI.openExternal(article.link);
    }
  };

  const displayTitle = showTranslation && translation.translatedTitle
    ? translation.translatedTitle
    : article?.title;

  const displayHtml = showTranslation && translation.translatedHtml
    ? translation.translatedHtml
    : currentArticleContent?.contentHtml;

  const hasTranslation = !!translation.translatedHtml;

  return (
    <div className="flex-1 flex flex-col bg-white h-full overflow-hidden">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-700">{t('articleView.articleView')}</h2>
        <div className="flex items-center gap-2">
          {hasTranslation && (
            <div className="flex items-center bg-slate-100 rounded p-0.5">
              <button
                onClick={() => setShowTranslation(false)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  !showTranslation ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <FileText size={10} />
                {t('articleView.original')}
              </button>
              <button
                onClick={() => setShowTranslation(true)}
                className={`flex items-center gap-1 px-2 py-1 text-xs rounded transition-colors ${
                  showTranslation ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                <Globe size={10} />
                {t('articleView.translated')}
              </button>
            </div>
          )}
          {article?.link && (
            <button
              onClick={handleOpenExternal}
              className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              <ExternalLink size={12} />
              {t('articleView.openOriginal')}
            </button>
          )}
        </div>
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin p-4">
        {isLoadingContent ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={16} />
            {t('articleView.loading')}
          </div>
        ) : translation.isTranslating ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={16} />
            {t('articleView.translating')}
          </div>
        ) : translation.translationError ? (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
            <AlertCircle size={24} />
            <div className="text-sm">{translation.translationError}</div>
            <button
              onClick={() => useAppStore.getState().translateCurrentArticle()}
              className="text-sm text-blue-600 hover:underline"
            >
              {t('articleView.retry')}
            </button>
          </div>
        ) : !article ? (
          <div className="text-sm text-slate-400">{t('articleView.selectArticle')}</div>
        ) : displayHtml ? (
          <div>
            {!showTranslation && currentArticleContent?.teaserImageUrl && !currentArticleContent.contentHtml?.includes(currentArticleContent.teaserImageUrl) && (
              <img
                src={currentArticleContent.teaserImageUrl}
                alt="Teaser"
                className="w-full max-h-64 object-cover rounded mb-4"
              />
            )}
            <h1 className="text-2xl font-bold text-slate-900 mb-2">{displayTitle}</h1>
            {!showTranslation && (
              <div className="text-sm text-slate-500 mb-1">
                {article.feedTitle} · {article.publishedAt ? new Date(article.publishedAt).toLocaleString('de-DE') : ''}
              </div>
            )}
            {article.link && (
              <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => {
                  e.preventDefault();
                  handleOpenExternal();
                }}
                className="text-xs text-blue-600 hover:underline break-all mb-4 block"
                title={t('articleView.openOriginal')}
              >
                <ExternalLink size={12} className="inline mr-1" />
                {article.link}
              </a>
            )}
            {showTranslation && translation.wordCount > 0 && (
              <div className="text-xs text-slate-400 mb-4">
                {t('articleView.translationSummary')} · ca. {translation.wordCount} {t('articleView.words')}
              </div>
            )}
            <div
              className="max-w-none text-slate-800 leading-relaxed text-sm [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-4 [&_h2]:mb-2 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 [&_p]:mb-3"
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(displayHtml || '', {
                  ALLOWED_TAGS: ['h1', 'h2', 'h3', 'p', 'img', 'br'],
                  ALLOWED_ATTR: ['src', 'alt', 'style'],
                }),
              }}
            />
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-slate-500 gap-2">
            <AlertCircle size={24} />
            <div className="text-sm">{t('articleView.contentError')}</div>
            {article.link && (
              <button
                onClick={handleOpenExternal}
                className="text-sm text-blue-600 hover:underline"
              >
                {t('articleView.openInBrowser')}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
