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

import { useState } from 'react';
import { useAppStore } from '../state/useAppStore';
import { useI18n } from '../i18n';
import { Plus, Settings, RefreshCw, FolderCog } from 'lucide-react';

export default function CategoryBar() {
  const { t } = useI18n();
  const {
    categories,
    selectedCategoryId,
    selectCategory,
    loadCategories,
    setSettingsOpen,
    setManageOpen,
    fetchAllFeeds,
  } = useAppStore();

  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const handleAdd = async () => {
    if (!newName.trim()) return;
    await window.electronAPI.invoke('db:createCategory', { name: newName.trim() });
    setNewName('');
    setIsAdding(false);
    await loadCategories();
  };

  const handleRename = async (id: string) => {
    if (!editName.trim()) return;
    await window.electronAPI.invoke('db:updateCategory', { id, name: editName.trim() });
    setEditingId(null);
    await loadCategories();
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('categoryBar.confirmDeleteCategory'))) return;
    await window.electronAPI.invoke('db:deleteCategory', id);
    await loadCategories();
  };

  const moveCategory = async (id: string, direction: 'left' | 'right') => {
    const idx = categories.findIndex((c) => c.id === id);
    if (idx === -1) return;
    const newIdx = direction === 'left' ? idx - 1 : idx + 1;
    if (newIdx < 0 || newIdx >= categories.length) return;
    const newOrder = [...categories];
    const [moved] = newOrder.splice(idx, 1);
    newOrder.splice(newIdx, 0, moved);
    await window.electronAPI.invoke('db:reorderCategories', newOrder.map((c) => c.id));
    await loadCategories();
  };

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-slate-100 border-b border-slate-200 shrink-0">
      <div className="flex-1 flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {categories.map((cat) => (
          <div key={cat.id} className="flex items-center shrink-0">
            {editingId === cat.id ? (
              <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-1">
                <input
                  className="text-sm outline-none w-32"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleRename(cat.id);
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  autoFocus
                />
                <button className="text-xs text-blue-600" onClick={() => handleRename(cat.id)}>
                  OK
                </button>
              </div>
            ) : (
              <button
                onClick={() => selectCategory(cat.id)}
                onDoubleClick={() => {
                  setEditingId(cat.id);
                  setEditName(cat.name);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
                  selectedCategoryId === cat.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-slate-700 hover:bg-slate-200'
                }`}
              >
                {cat.name}
              </button>
            )}
            <button
              className="text-slate-400 hover:text-slate-600 px-1 text-xs"
              onClick={() => moveCategory(cat.id, 'left')}
              title={t('categoryBar.moveLeft')}
            >
              ◀
            </button>
            <button
              className="text-slate-400 hover:text-slate-600 px-1 text-xs"
              onClick={() => moveCategory(cat.id, 'right')}
              title={t('categoryBar.moveRight')}
            >
              ▶
            </button>
            <button
              className="text-slate-400 hover:text-red-500 px-1 text-xs"
              onClick={() => handleDelete(cat.id)}
              title={t('categoryBar.delete')}
            >
              ✕
            </button>
          </div>
        ))}

        {isAdding ? (
          <div className="flex items-center gap-1 bg-white border border-slate-300 rounded px-2 py-1 shrink-0">
            <input
              className="text-sm outline-none w-32"
              placeholder={t('categoryBar.categoryNamePlaceholder')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAdd();
                if (e.key === 'Escape') setIsAdding(false);
              }}
              autoFocus
            />
            <button className="text-xs text-blue-600" onClick={handleAdd}>
              {t('categoryBar.add')}
            </button>
          </div>
        ) : (
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1 px-2 py-1.5 text-sm text-slate-600 hover:bg-white rounded shrink-0"
          >
            <Plus size={14} />
            {t('categoryBar.addCategory')}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={fetchAllFeeds}
          className="flex items-center gap-1 px-2 py-1.5 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50"
          title={t('categoryBar.fetchFeeds')}
        >
          <RefreshCw size={14} />
          {t('categoryBar.fetchFeeds')}
        </button>
        <button
          onClick={() => setManageOpen(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50"
          title={t('categoryBar.manageFeeds')}
        >
          <FolderCog size={14} />
          {t('categoryBar.manageFeeds')}
        </button>
        <button
          onClick={() => setSettingsOpen(true)}
          className="flex items-center gap-1 px-2 py-1.5 text-sm bg-white border border-slate-300 rounded hover:bg-slate-50"
          title={t('categoryBar.settings')}
        >
          <Settings size={14} />
        </button>
      </div>
    </div>
  );
}
