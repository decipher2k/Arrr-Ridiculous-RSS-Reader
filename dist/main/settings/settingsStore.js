"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadSettings = loadSettings;
exports.saveSettings = saveSettings;
const electron_1 = require("electron");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const SETTINGS_FILE = 'settings.json';
function getDefaultModelPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), 'models', 'Ministral-3-3B-Instruct-2512-Q4_K_M.gguf');
}
const defaultSettings = {
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
};
function getSettingsPath() {
    return path_1.default.join(electron_1.app.getPath('userData'), SETTINGS_FILE);
}
async function loadSettings() {
    const filePath = getSettingsPath();
    if (!fs_1.default.existsSync(filePath)) {
        return { ...defaultSettings };
    }
    try {
        const raw = fs_1.default.readFileSync(filePath, 'utf-8');
        const stored = JSON.parse(raw);
        let apiKey = '';
        if (stored.aiApiKeyEncrypted && electron_1.safeStorage.isEncryptionAvailable()) {
            try {
                const buffer = Buffer.from(stored.aiApiKeyEncrypted, 'base64');
                apiKey = electron_1.safeStorage.decryptString(buffer);
            }
            catch {
                apiKey = '';
            }
        }
        return {
            aiProviderType: stored.aiProviderType ?? defaultSettings.aiProviderType,
            aiBaseUrl: stored.aiBaseUrl ?? defaultSettings.aiBaseUrl,
            aiApiKey: apiKey,
            aiModel: stored.aiModel ?? defaultSettings.aiModel,
            aiTemperature: stored.aiTemperature ?? defaultSettings.aiTemperature,
            aiDeduplicationEnabled: stored.aiDeduplicationEnabled ?? false,
            aiTranslationEnabled: stored.aiTranslationEnabled ?? false,
            selectedTranslationLanguage: stored.selectedTranslationLanguage ?? '',
            uiLanguage: stored.uiLanguage ?? 'en',
            autoFetchEnabled: stored.autoFetchEnabled ?? false,
            autoFetchIntervalMinutes: stored.autoFetchIntervalMinutes ?? 30,
            localLlmPort: stored.localLlmPort ?? defaultSettings.localLlmPort,
            localLlmModelPath: stored.localLlmModelPath || getDefaultModelPath(),
            localLlmContextSize: stored.localLlmContextSize ?? defaultSettings.localLlmContextSize,
            localLlmGpuLayers: stored.localLlmGpuLayers ?? defaultSettings.localLlmGpuLayers,
            localLlmAllowCpuFallback: stored.localLlmAllowCpuFallback ?? defaultSettings.localLlmAllowCpuFallback,
        };
    }
    catch {
        return { ...defaultSettings };
    }
}
async function saveSettings(settings) {
    const filePath = getSettingsPath();
    let encrypted = null;
    if (settings.aiApiKey && electron_1.safeStorage.isEncryptionAvailable()) {
        try {
            const buffer = electron_1.safeStorage.encryptString(settings.aiApiKey);
            encrypted = buffer.toString('base64');
        }
        catch {
            encrypted = null;
        }
    }
    const stored = {
        aiProviderType: settings.aiProviderType,
        aiBaseUrl: settings.aiBaseUrl,
        aiApiKeyEncrypted: encrypted,
        aiModel: settings.aiModel,
        aiTemperature: settings.aiTemperature,
        aiDeduplicationEnabled: settings.aiDeduplicationEnabled,
        aiTranslationEnabled: settings.aiTranslationEnabled,
        selectedTranslationLanguage: settings.selectedTranslationLanguage,
        uiLanguage: settings.uiLanguage,
        autoFetchEnabled: settings.autoFetchEnabled,
        autoFetchIntervalMinutes: settings.autoFetchIntervalMinutes,
        localLlmPort: settings.localLlmPort,
        localLlmModelPath: settings.localLlmModelPath,
        localLlmContextSize: settings.localLlmContextSize,
        localLlmGpuLayers: settings.localLlmGpuLayers,
        localLlmAllowCpuFallback: settings.localLlmAllowCpuFallback,
    };
    fs_1.default.writeFileSync(filePath, JSON.stringify(stored, null, 2), 'utf-8');
}
//# sourceMappingURL=settingsStore.js.map