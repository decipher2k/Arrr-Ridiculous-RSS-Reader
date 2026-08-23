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
import { getProvider } from './aiProviderFactory';

interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

interface QueuedCompletion {
  run: () => Promise<void>;
  priority: number;
  sequence: number;
}

const queuedCompletions: QueuedCompletion[] = [];
let activeCompletions = 0;
let completionSequence = 0;

export async function callChatCompletion(
  settings: AppSettings,
  messages: ChatMessage[],
  maxTokens?: number,
  priority = 0
): Promise<string> {
  return enqueueCompletion(settings, priority, async () => {
    const provider = await getProvider(settings);
    return provider.chatCompletion(messages, maxTokens);
  });
}

function enqueueCompletion<T>(
  settings: AppSettings,
  priority: number,
  task: () => Promise<T>
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    queuedCompletions.push({
      priority,
      sequence: completionSequence++,
      run: async () => {
        try {
          resolve(await task());
        } catch (err) {
          reject(err);
        }
      },
    });

    pumpCompletionQueue(settings);
  });
}

function pumpCompletionQueue(settings: AppSettings): void {
  const maxConcurrent = getMaxConcurrentCompletions(settings);

  while (activeCompletions < maxConcurrent && queuedCompletions.length > 0) {
    queuedCompletions.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
    const next = queuedCompletions.shift();
    if (!next) return;

    activeCompletions++;
    next.run()
      .finally(() => {
        activeCompletions--;
        pumpCompletionQueue(settings);
      });
  }
}

function getMaxConcurrentCompletions(settings: AppSettings): number {
  if (settings.aiProviderType === 'local' || isLocalBaseUrl(settings.aiBaseUrl)) {
    return 1;
  }
  return 4;
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
  }
}
