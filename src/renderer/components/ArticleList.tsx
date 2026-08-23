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

import { useRef, useEffect, useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { useI18n } from '../i18n';
import { Newspaper, Loader2 } from 'lucide-react';

const PLACEHOLDER_IMAGE = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiNlMmU4ZjAiLz48cGF0aCBkPSJNMTYgMThIMjRWMjJIMTZWMTlaIiBmaWxsPSIjOTRBM0I4Ii8+PC9zdmc+';

function ArticleDescription({ text }: { text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  useEffect(() => {
    if (ref.current) {
      setIsOverflowing(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [text]);

  return (
    <div className="relative mt-1">
      <div
        ref={ref}
        className="text-xs text-slate-500 max-h-[54px] overflow-hidden leading-[18px]"
      >
        {text}
      </div>
      {isOverflowing && (
        <span className="absolute bottom-0 right-0 bg-white pl-1 text-xs text-slate-500">
          [...]
        </span>
      )}
    </div>
  );
}

function ArticlePreviewImage({ imageUrl, teaserImageUrl }: { imageUrl: string | null; teaserImageUrl: string | null }) {
  const sources = [teaserImageUrl, imageUrl, PLACEHOLDER_IMAGE].filter(Boolean) as string[];
  const [sourceIndex, setSourceIndex] = useState(0);

  useEffect(() => {
    setSourceIndex(0);
  }, [imageUrl, teaserImageUrl]);

  return (
    <img
      src={sources[sourceIndex] || PLACEHOLDER_IMAGE}
      alt=""
      className="w-[115px] h-[115px] object-cover rounded shrink-0 bg-slate-100"
      onError={() => {
        setSourceIndex((index) => Math.min(index + 1, sources.length - 1));
      }}
    />
  );
}

export default function ArticleList() {
  const { t } = useI18n();
  const { articles, selectedArticleId, selectArticle, isLoadingArticles } = useAppStore();

  return (
    <div className="w-[28rem] flex flex-col border-r border-slate-200 bg-white h-full">
      <div className="px-4 py-2 border-b border-slate-200 flex items-center justify-between shrink-0">
        <h2 className="text-sm font-semibold text-slate-700 flex items-center gap-1">
          <Newspaper size={14} />
          {t('articleList.news')}
        </h2>
        {isLoadingArticles && (
          <Loader2 className="animate-spin text-slate-400" size={16} />
        )}
      </div>
      <div className="flex-1 overflow-y-auto scrollbar-thin">
        {isLoadingArticles && articles.length === 0 ? (
          <div className="flex items-center justify-center h-32 text-slate-400">
            <Loader2 className="animate-spin mr-2" size={16} />
            {t('articleList.loading')}
          </div>
        ) : articles.length === 0 ? (
          <div className="p-4 text-sm text-slate-400">{t('articleList.noArticles')}</div>
        ) : (
          articles.map((article) => (
            <button
              key={article.id}
              onClick={() => selectArticle(article.id)}
              className={`w-full text-left flex items-start gap-3 p-3 border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                selectedArticleId === article.id ? 'bg-blue-50 border-l-4 border-l-blue-600' : 'border-l-4 border-l-transparent'
              }`}
            >
              <ArticlePreviewImage imageUrl={article.imageUrl} teaserImageUrl={article.teaserImageUrl} />
              <div className="flex-1 min-w-0 flex flex-col">
                <div className="text-sm font-bold text-slate-800 leading-tight">
                  {article.translatedTitle || article.title}
                </div>
                <ArticleDescription text={article.translatedDescription || article.description || t('articleList.noDescription')} />
                <div className="text-[10px] text-slate-400 mt-1">
                  {article.feedTitle} · {article.publishedAt ? new Date(article.publishedAt).toLocaleString('de-DE') : ''}
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
