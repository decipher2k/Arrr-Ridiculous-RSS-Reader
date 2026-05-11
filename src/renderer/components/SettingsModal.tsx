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
import { useI18n, UI_LANGUAGES } from '../i18n';
import { X, TestTube, Save, Loader2, Download, AlertTriangle, CheckCircle, Cpu } from 'lucide-react';
import type { AppSettings, ModelDownloadProgress } from '../../shared/types';

export default function SettingsModal() {
  const { t, setLang } = useI18n();
  const { settings, isSettingsOpen, setSettingsOpen, saveSettings, setSelectedTranslationLanguage } = useAppStore();

  const [form, setForm] = useState<AppSettings>({
    aiProviderType: 'openai',
    aiBaseUrl: 'https://api.openai.com/v1',
    aiApiKey: '',
    aiModel: 'gpt-4o-mini',
    aiTemperature: 0.2,
    aiDeduplicationEnabled: false,
    aiTranslationEnabled: false,
    selectedTranslationLanguage: '',
    uiLanguage: 'en',
    autoFetchEnabled: false,
    autoFetchIntervalMinutes: 30,
    localLlmPort: 8080,
    localLlmModelPath: '',
    localLlmContextSize: 8192,
    localLlmGpuLayers: 99,
    localLlmAllowCpuFallback: false,
  });

  const [testStatus, setTestStatus] = useState<{ success: boolean; message: string } | null>(null);
  const [isTesting, setIsTesting] = useState(false);

  const [localModelStatus, setLocalModelStatus] = useState<'unknown' | 'not_downloaded' | 'ready'>('unknown');
  const [isCheckingModel, setIsCheckingModel] = useState(false);
  const [showDownloadConfirm, setShowDownloadConfirm] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<ModelDownloadProgress | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (settings) {
      setForm({ ...settings });
    }
  }, [settings]);

  useEffect(() => {
    if (!isSettingsOpen) return;
    setTestStatus(null);
    setDownloadError(null);
    setShowDownloadConfirm(false);

    // Check local model status if provider is local
    if (form.aiProviderType === 'local') {
      checkLocalModel();
    }

    const onProgress = (...args: unknown[]) => {
      const progress = args[0] as ModelDownloadProgress;
      setDownloadProgress(progress);
    };
    const onComplete = () => {
      setIsDownloading(false);
      setLocalModelStatus('ready');
      setDownloadProgress(null);
    };
    const onError = (...args: unknown[]) => {
      const message = args[0] as string;
      setIsDownloading(false);
      setDownloadError(message);
      setDownloadProgress(null);
    };

    const unsubProgress = window.electronAPI.on('ai:downloadProgress', onProgress);
    const unsubComplete = window.electronAPI.on('ai:downloadComplete', onComplete);
    const unsubError = window.electronAPI.on('ai:downloadError', onError);

    return () => {
      unsubProgress();
      unsubComplete();
      unsubError();
    };
  }, [isSettingsOpen, form.aiProviderType]);

  const checkLocalModel = async () => {
    setIsCheckingModel(true);
    try {
      const status = await window.electronAPI.invoke<{ exists: boolean }>('ai:getLocalModelStatus');
      setLocalModelStatus(status.exists ? 'ready' : 'not_downloaded');
    } catch {
      setLocalModelStatus('not_downloaded');
    } finally {
      setIsCheckingModel(false);
    }
  };

  const handleSave = async () => {
    const oldSettings = settings;
    await saveSettings(form);
    setLang(form.uiLanguage as any);

    // If translation was just enabled and a language is already selected, trigger batch translation
    if (form.aiTranslationEnabled && !oldSettings?.aiTranslationEnabled && form.selectedTranslationLanguage) {
      setSelectedTranslationLanguage(form.selectedTranslationLanguage as any);
    }

    setSettingsOpen(false);
  };

  const handleTest = async () => {
    setIsTesting(true);
    setTestStatus(null);
    try {
      const result = await window.electronAPI.invoke<{ success: boolean; message: string }>('settings:testAiConnection', form);
      setTestStatus(result);
    } catch (err) {
      setTestStatus({ success: false, message: `${t('settings.connectionFailed')} ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsTesting(false);
    }
  };

  const handleDownload = async () => {
    setShowDownloadConfirm(false);
    setIsDownloading(true);
    setDownloadError(null);
    setDownloadProgress(null);
    try {
      await window.electronAPI.invoke('ai:downloadModel');
      // completion is handled by event listener
    } catch (err) {
      setIsDownloading(false);
      setDownloadError(err instanceof Error ? err.message : String(err));
    }
  };

  const handleCancelDownload = async () => {
    await window.electronAPI.invoke('ai:cancelDownload');
    setIsDownloading(false);
    setDownloadProgress(null);
  };

  if (!isSettingsOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto relative">
        {/* Download overlay */}
        {isDownloading && (
          <div className="absolute inset-0 bg-white/95 z-10 flex flex-col items-center justify-center p-6 rounded-lg">
            <Loader2 size={32} className="animate-spin text-blue-600 mb-4" />
            <p className="text-sm font-medium text-slate-700 mb-2">{t('settings.downloading')}</p>
            {downloadProgress && (
              <div className="w-full max-w-xs mb-2">
                <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-blue-600 transition-all"
                    style={{ width: `${downloadProgress.percent}%` }}
                  />
                </div>
                <div className="flex justify-between text-xs text-slate-500 mt-1">
                  <span>{downloadProgress.percent}%</span>
                  <span>{t('settings.downloadSpeed')}: {downloadProgress.speed}</span>
                </div>
              </div>
            )}
            <button
              onClick={handleCancelDownload}
              className="mt-3 px-3 py-1.5 text-sm border border-slate-300 rounded hover:bg-slate-50"
            >
              {t('settings.downloadCancel')}
            </button>
          </div>
        )}

        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">{t('settings.title')}</h2>
          <button onClick={() => setSettingsOpen(false)} className="text-slate-400 hover:text-slate-600">
            <X size={18} />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">{t('settings.uiLanguage')}</label>
            <select
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              value={form.uiLanguage}
              onChange={(e) => setForm({ ...form, uiLanguage: e.target.value })}
            >
              {UI_LANGUAGES.map((l) => (
                <option key={l.code} value={l.code}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="text-sm font-medium text-slate-700">{t('settings.aiProvider')}</label>
            <select
              className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
              value={form.aiProviderType}
              onChange={(e) => {
                const type = e.target.value as AppSettings['aiProviderType'];
                setForm({ ...form, aiProviderType: type });
                if (type === 'local') {
                  checkLocalModel();
                }
              }}
            >
              <option value="openai">{t('settings.providerOpenAi')}</option>
              <option value="local">{t('settings.providerLocal')}</option>
            </select>
          </div>

          {form.aiProviderType === 'openai' && (
            <>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{t('settings.apiBaseUrl')}</label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  value={form.aiBaseUrl}
                  onChange={(e) => setForm({ ...form, aiBaseUrl: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700">{t('settings.apiKey')}</label>
                <input
                  type="password"
                  className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                  value={form.aiApiKey}
                  onChange={(e) => setForm({ ...form, aiApiKey: e.target.value })}
                  placeholder="sk-..."
                />
                <p className="text-xs text-slate-500">{t('settings.apiKeyHint')}</p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">{t('settings.model')}</label>
                  <input
                    type="text"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                    value={form.aiModel}
                    onChange={(e) => setForm({ ...form, aiModel: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700">{t('settings.temperature')}</label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="2"
                    className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                    value={form.aiTemperature}
                    onChange={(e) => setForm({ ...form, aiTemperature: parseFloat(e.target.value) })}
                  />
                </div>
              </div>
            </>
          )}

          {form.aiProviderType === 'local' && (
            <div className="space-y-3 border border-slate-200 rounded-lg p-3 bg-slate-50">
              <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-1">
                <Cpu size={14} />
                {t('settings.localModel')}
              </h3>

              {isCheckingModel ? (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <Loader2 size={14} className="animate-spin" />
                  {t('common.loading')}
                </div>
              ) : localModelStatus === 'ready' ? (
                <div className="flex items-center gap-2 text-sm text-green-700">
                  <CheckCircle size={14} />
                  {t('settings.localModelReady')}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-amber-700">
                    <AlertTriangle size={14} />
                    {t('settings.localModelNotDownloaded')}
                  </div>
                  {!showDownloadConfirm ? (
                    <button
                      onClick={() => setShowDownloadConfirm(true)}
                      className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      <Download size={14} />
                      {t('settings.downloadModel')}
                    </button>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 rounded p-3 space-y-2">
                      <p className="text-xs text-amber-800">{t('settings.downloadWarning')}</p>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={handleDownload}
                          className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                        >
                          {t('settings.downloadConfirm')}
                        </button>
                        <button
                          onClick={() => setShowDownloadConfirm(false)}
                          className="px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-50"
                        >
                          {t('common.cancel')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {downloadError && (
                <div className="text-xs text-red-700 bg-red-50 rounded px-2 py-1.5">
                  {t('settings.downloadError')}: {downloadError}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('settings.localPort')}</label>
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    value={form.localLlmPort}
                    onChange={(e) => setForm({ ...form, localLlmPort: parseInt(e.target.value) || 8080 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('settings.localContextSize')}</label>
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    value={form.localLlmContextSize}
                    onChange={(e) => setForm({ ...form, localLlmContextSize: parseInt(e.target.value) || 8192 })}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-slate-600">{t('settings.localGpuLayers')}</label>
                  <input
                    type="number"
                    className="w-full px-2 py-1.5 border border-slate-300 rounded text-sm"
                    value={form.localLlmGpuLayers}
                    onChange={(e) => setForm({ ...form, localLlmGpuLayers: parseInt(e.target.value) || 99 })}
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <input
                  id="cpuFallback"
                  type="checkbox"
                  checked={form.localLlmAllowCpuFallback}
                  onChange={(e) => setForm({ ...form, localLlmAllowCpuFallback: e.target.checked })}
                  className="rounded border-slate-300"
                />
                <label htmlFor="cpuFallback" className="text-xs text-slate-600">
                  {t('settings.localCpuFallback')}
                </label>
              </div>

              <button
                onClick={handleTest}
                disabled={isTesting || localModelStatus !== 'ready'}
                className="flex items-center gap-1 px-3 py-1.5 text-xs border border-slate-300 rounded hover:bg-slate-100 disabled:opacity-50"
              >
                {isTesting ? <Loader2 size={12} className="animate-spin" /> : <TestTube size={12} />}
                {t('settings.localTestConnection')}
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <input
              id="dedupEnabled"
              type="checkbox"
              checked={form.aiDeduplicationEnabled}
              onChange={(e) => setForm({ ...form, aiDeduplicationEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <label htmlFor="dedupEnabled" className="text-sm text-slate-700">
              {t('settings.enableDeduplication')}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="translationEnabled"
              type="checkbox"
              checked={form.aiTranslationEnabled}
              onChange={(e) => setForm({ ...form, aiTranslationEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <label htmlFor="translationEnabled" className="text-sm text-slate-700">
              {t('settings.enableTranslation')}
            </label>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="autoFetch"
              type="checkbox"
              checked={form.autoFetchEnabled}
              onChange={(e) => setForm({ ...form, autoFetchEnabled: e.target.checked })}
              className="rounded border-slate-300"
            />
            <label htmlFor="autoFetch" className="text-sm text-slate-700">
              {t('settings.enableAutoFetch')}
            </label>
          </div>

          {form.autoFetchEnabled && (
            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700">{t('settings.fetchInterval')}</label>
              <input
                type="number"
                min="5"
                max="1440"
                className="w-full px-3 py-2 border border-slate-300 rounded text-sm"
                value={form.autoFetchIntervalMinutes}
                onChange={(e) => setForm({ ...form, autoFetchIntervalMinutes: parseInt(e.target.value) || 30 })}
              />
            </div>
          )}

          {testStatus && (
            <div className={`text-sm px-3 py-2 rounded ${testStatus.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
              {testStatus.message}
            </div>
          )}

          <div className="flex items-center gap-2 pt-2">
            {form.aiProviderType === 'openai' && (
              <button
                onClick={handleTest}
                disabled={isTesting}
                className="flex items-center gap-1 px-3 py-2 text-sm border border-slate-300 rounded hover:bg-slate-50 disabled:opacity-50"
              >
                {isTesting ? <Loader2 size={14} className="animate-spin" /> : <TestTube size={14} />}
                {t('settings.testConnection')}
              </button>
            )}
            <button
              onClick={handleSave}
              className="flex items-center gap-1 px-3 py-2 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              <Save size={14} />
              {t('settings.save')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
