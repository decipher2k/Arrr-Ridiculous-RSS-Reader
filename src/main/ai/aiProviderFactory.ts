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

import type { AppSettings } from '../../shared/types';
import type { AIProvider } from './aiProvider';
import { OpenAIProvider } from './openAiProvider';
import { LocalLlamaProvider, getDefaultModelPath } from './localLlamaProvider';

let currentProvider: AIProvider | null = null;
let currentSettingsHash: string | null = null;

function hashSettings(settings: AppSettings): string {
  return JSON.stringify({
    type: settings.aiProviderType,
    baseUrl: settings.aiBaseUrl,
    key: settings.aiApiKey,
    model: settings.aiModel,
    temp: settings.aiTemperature,
    port: settings.localLlmPort,
    path: settings.localLlmModelPath,
    ctx: settings.localLlmContextSize,
    layers: settings.localLlmGpuLayers,
    cpuFallback: settings.localLlmAllowCpuFallback,
  });
}

export async function getProvider(settings: AppSettings): Promise<AIProvider> {
  const hash = hashSettings(settings);
  if (currentProvider && currentSettingsHash === hash) {
    return currentProvider;
  }

  if (currentProvider) {
    await currentProvider.dispose();
    currentProvider = null;
  }

  if (settings.aiProviderType === 'local') {
    currentProvider = new LocalLlamaProvider({
      localLlmPort: settings.localLlmPort ?? 8080,
      localLlmModelPath: settings.localLlmModelPath || getDefaultModelPath(),
      localLlmContextSize: settings.localLlmContextSize ?? 8192,
      localLlmGpuLayers: settings.localLlmGpuLayers ?? 99,
      localLlmAllowCpuFallback: settings.localLlmAllowCpuFallback ?? false,
    });
  } else {
    currentProvider = new OpenAIProvider({
      aiBaseUrl: settings.aiBaseUrl,
      aiApiKey: settings.aiApiKey,
      aiModel: settings.aiModel,
      aiTemperature: settings.aiTemperature,
    });
  }

  currentSettingsHash = hash;
  await currentProvider.init();
  return currentProvider;
}

export async function warmupProvider(settings: AppSettings): Promise<void> {
  try {
    const provider = await getProvider(settings);
    console.log(`[AI] Provider warmed up: ${provider.name}, GPU: ${provider.isGpuAccelerated}`);
  } catch (err) {
    console.error('[AI] Provider warmup failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function disposeCurrentProvider(): Promise<void> {
  if (currentProvider) {
    await currentProvider.dispose();
    currentProvider = null;
    currentSettingsHash = null;
  }
}
