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

import { useState, useEffect } from 'react';
import { useAppStore } from '../state/useAppStore';
import { useI18n } from '../i18n';
import { X, Plus, Trash2, Edit2, Save, Loader2, Rss } from 'lucide-react';
import type { Feed } from '../../shared/types';

export default function ManageFeedsModal() {
  const { t } = useI18n();
  const { isManageOpen, setManageOpen, categories, loadCategories } = useAppStore();
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [feedCategories, setFeedCategories] = useState<Record<string, string[]>>({});
  const [isLoading, setIsLoading] = useState(false);

  const [newFeedUrl, setNewFeedUrl] = useState('');
  const [newFeedTitle, setNewFeedTitle] = useState('');
  const [newFeedCategories, setNewFeedCategories] = useState<string[]>([]);
  const [newFeedContentMode, setNewFeedContentMode] = useState<'feed' | 'scraped'>('scraped');
  const [editingFeedId, setEditingFeedId] = useState<string | null>(null);
  const [editFeedTitle, setEditFeedTitle] = useState('');
  const [editFeedUrl, setEditFeedUrl] = useState('');
  const [editFeedCats, setEditFeedCats] = useState<string[]>([]);
  const [editFeedContentMode, setEditFeedContentMode] = useState<'feed' | 'scraped'>('scraped');

  useEffect(() => {
    if (isManageOpen) {
      loadData();
    }
  }, [isManageOpen]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const f = await window.electronAPI.invoke<Feed[]>('db:getFeeds');
      setFeeds(f);
      const map: Record<string, string[]> = {};
      for (const feed of f) {
        const cats = await window.electronAPI.invoke<string[]>('db:getFeedCategories', feed.id);
        map[feed.id] = cats;
      }
      setFeedCategories(map);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddFeed = async () => {
    if (!newFeedUrl.trim() || !newFeedTitle.trim() || newFeedCategories.length === 0) return;
    await window.electronAPI.invoke('db:createFeed', {
      title: newFeedTitle.trim(),
      url: newFeedUrl.trim(),
      categoryIds: newFeedCategories,
      contentMode: newFeedContentMode,
    });
    setNewFeedUrl('');
    setNewFeedTitle('');
    setNewFeedCategories([]);
    setNewFeedContentMode('scraped');
    await loadData();
    await loadCategories();
  };

  const handleDeleteFeed = async (id: string) => {
    if (!confirm(t('manageFeeds.confirmDeleteFeed'))) return;
    await window.electronAPI.invoke('db:deleteFeed', id);
    await loadData();
    await loadCategories();
  };

  const handleUpdateFeed = async (id: string) => {
    await window.electronAPI.invoke('db:updateFeed', {
      id,
      title: editFeedTitle.trim(),
      url: editFeedUrl.trim(),
      categoryIds: editFeedCats,
      contentMode: editFeedContentMode,
    });
    setEditingFeedId(null);
    await loadData();
    await loadCategories();
  };

  const handleFetchFeed = async (feedId: string) => {
    await window.electronAPI.invoke('feeds:fetchFeed', feedId);
    alert(t('common.success'));
  };

  if (!isManageOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">{t('manageFeeds.title')}</h2>
          <button onClick={() => setManageOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-6">
          {/* Add Feed */}
          <div className="bg-slate-50 rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1">
              <Plus size={14} />
              {t('manageFeeds.addNewFeed')}
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <input
                placeholder={t('manageFeeds.titlePlaceholder')}
                className="px-3 py-2 border border-slate-300 rounded text-sm"
                value={newFeedTitle}
                onChange={(e) => setNewFeedTitle(e.target.value)}
              />
              <input
                placeholder={t('manageFeeds.urlPlaceholder')}
                className="px-3 py-2 border border-slate-300 rounded text-sm"
                value={newFeedUrl}
                onChange={(e) => setNewFeedUrl(e.target.value)}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <label key={cat.id} className="flex items-center gap-1 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={newFeedCategories.includes(cat.id)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setNewFeedCategories([...newFeedCategories, cat.id]);
                      } else {
                        setNewFeedCategories(newFeedCategories.filter((c) => c !== cat.id));
                      }
                    }}
                    className="rounded"
                  />
                  {cat.name}
                </label>
              ))}
            </div>
            <div className="space-y-1">
              <div className="text-xs font-medium text-slate-600">{t('manageFeeds.contentMode')}</div>
              <div className="flex gap-4">
                <label className="flex items-center gap-1 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="newFeedContentMode"
                    value="scraped"
                    checked={newFeedContentMode === 'scraped'}
                    onChange={() => setNewFeedContentMode('scraped')}
                    className="rounded"
                  />
                  {t('manageFeeds.contentModeScraped')}
                </label>
                <label className="flex items-center gap-1 text-sm text-slate-700">
                  <input
                    type="radio"
                    name="newFeedContentMode"
                    value="feed"
                    checked={newFeedContentMode === 'feed'}
                    onChange={() => setNewFeedContentMode('feed')}
                    className="rounded"
                  />
                  {t('manageFeeds.contentModeFeed')}
                </label>
              </div>
            </div>
            <button
              onClick={handleAddFeed}
              className="px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              {t('manageFeeds.add')}
            </button>
          </div>

          {/* Feed List */}
          <div>
            <h3 className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-1">
              <Rss size={14} />
              {t('manageFeeds.existingFeeds')}
            </h3>
            {isLoading ? (
              <div className="flex items-center text-slate-400 text-sm">
                <Loader2 size={14} className="animate-spin mr-2" />
                {t('manageFeeds.loading')}
              </div>
            ) : feeds.length === 0 ? (
              <div className="text-sm text-slate-400">{t('manageFeeds.noFeeds')}</div>
            ) : (
              <div className="space-y-2">
                {feeds.map((feed) => (
                  <div key={feed.id} className="border border-slate-200 rounded p-3">
                    {editingFeedId === feed.id ? (
                      <div className="space-y-2">
                        <input
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          value={editFeedTitle}
                          onChange={(e) => setEditFeedTitle(e.target.value)}
                        />
                        <input
                          className="w-full px-2 py-1 border border-slate-300 rounded text-sm"
                          value={editFeedUrl}
                          onChange={(e) => setEditFeedUrl(e.target.value)}
                        />
                        <div className="flex flex-wrap gap-2">
                          {categories.map((cat) => (
                            <label key={cat.id} className="flex items-center gap-1 text-xs text-slate-700">
                              <input
                                type="checkbox"
                                checked={editFeedCats.includes(cat.id)}
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setEditFeedCats([...editFeedCats, cat.id]);
                                  } else {
                                    setEditFeedCats(editFeedCats.filter((c) => c !== cat.id));
                                  }
                                }}
                                className="rounded"
                              />
                              {cat.name}
                            </label>
                          ))}
                        </div>
                        <div className="space-y-1">
                          <div className="text-xs font-medium text-slate-600">{t('manageFeeds.contentMode')}</div>
                          <div className="flex gap-4">
                            <label className="flex items-center gap-1 text-xs text-slate-700">
                              <input
                                type="radio"
                                name="editFeedContentMode"
                                value="scraped"
                                checked={editFeedContentMode === 'scraped'}
                                onChange={() => setEditFeedContentMode('scraped')}
                                className="rounded"
                              />
                              {t('manageFeeds.contentModeScraped')}
                            </label>
                            <label className="flex items-center gap-1 text-xs text-slate-700">
                              <input
                                type="radio"
                                name="editFeedContentMode"
                                value="feed"
                                checked={editFeedContentMode === 'feed'}
                                onChange={() => setEditFeedContentMode('feed')}
                                className="rounded"
                              />
                              {t('manageFeeds.contentModeFeed')}
                            </label>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleUpdateFeed(feed.id)}
                            className="flex items-center gap-1 px-2 py-1 text-xs bg-blue-600 text-white rounded"
                          >
                            <Save size={12} />
                            {t('manageFeeds.save')}
                          </button>
                          <button
                            onClick={() => setEditingFeedId(null)}
                            className="px-2 py-1 text-xs border border-slate-300 rounded"
                          >
                            {t('manageFeeds.cancel')}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{feed.title}</div>
                          <div className="text-xs text-slate-500 truncate">{feed.url}</div>
                          <div className="text-xs text-slate-400 mt-1">
                            {t('manageFeeds.categories')}{' '}
                            {feedCategories[feed.id]
                              ?.map((cid) => categories.find((c) => c.id === cid)?.name)
                              .filter(Boolean)
                              .join(', ') || t('manageFeeds.noCategories')}
                            {' · '}
                            {feed.contentMode === 'feed' ? t('manageFeeds.contentModeFeed') : t('manageFeeds.contentModeScraped')}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 ml-2">
                          <button
                            onClick={() => handleFetchFeed(feed.id)}
                            className="p-1 text-slate-500 hover:text-blue-600"
                            title={t('manageFeeds.fetchFeed')}
                          >
                            <Rss size={14} />
                          </button>
                          <button
                            onClick={() => {
                              setEditingFeedId(feed.id);
                              setEditFeedTitle(feed.title);
                              setEditFeedUrl(feed.url);
                              setEditFeedCats(feedCategories[feed.id] || []);
                              setEditFeedContentMode(feed.contentMode ?? 'scraped');
                            }}
                            className="p-1 text-slate-500 hover:text-blue-600"
                            title={t('manageFeeds.edit')}
                          >
                            <Edit2 size={14} />
                          </button>
                          <button
                            onClick={() => handleDeleteFeed(feed.id)}
                            className="p-1 text-slate-500 hover:text-red-600"
                            title={t('manageFeeds.delete')}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
