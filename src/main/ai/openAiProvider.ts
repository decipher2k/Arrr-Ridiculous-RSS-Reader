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
import type { AIProvider, ChatMessage } from './aiProvider';

const REMOTE_CHAT_COMPLETION_TIMEOUT_MS = 120_000;
const LOCAL_COMPATIBLE_CHAT_COMPLETION_TIMEOUT_MS = 180_000;

export class OpenAIProvider implements AIProvider {
  readonly name = 'OpenAI-Compatible';
  readonly isGpuAccelerated = false;

  constructor(private settings: Pick<AppSettings, 'aiBaseUrl' | 'aiApiKey' | 'aiModel' | 'aiTemperature'>) {}

  async init(): Promise<void> {}

  async chatCompletion(messages: ChatMessage[], maxTokens = 4000): Promise<string> {
    const url = `${this.settings.aiBaseUrl.replace(/\/$/, '')}/chat/completions`;
    const model = this.settings.aiModel;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: this.settings.aiTemperature,
      max_tokens: maxTokens,
    };

    // Groq reasoning models (e.g. gpt-oss) spend output tokens on chain-of-thought
    // before producing any `content`, which can exhaust max_tokens and yield an
    // empty response. Keep reasoning minimal and out of the token budget so the
    // full quota is available for the actual answer.
    if (isReasoningModel(model)) {
      body.reasoning_effort = 'low';
      body.reasoning_format = 'hidden';
    }

    const timeoutMs = isLocalBaseUrl(this.settings.aiBaseUrl)
      ? LOCAL_COMPATIBLE_CHAT_COMPLETION_TIMEOUT_MS
      : REMOTE_CHAT_COMPLETION_TIMEOUT_MS;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let res: Response;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.settings.aiApiKey}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new Error(`AI request timed out after ${timeoutMs / 1000}s`);
      }
      throw err;
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`API error ${res.status}: ${text}`);
    }

    const data = (await res.json()) as {
      choices?: {
        message?: { content?: string | null; reasoning?: string | null; refusal?: string | null };
        finish_reason?: string;
      }[];
    };
    const choice = data.choices?.[0];
    const content = choice?.message?.content?.trim();
    if (content) return content;

    // Some providers (e.g. Groq reasoning models) may leave `content` empty and
    // put usable text in `reasoning` instead — fall back to that.
    const reasoning = choice?.message?.reasoning?.trim();
    if (reasoning) return reasoning;

    const finishReason = choice?.finish_reason;
    const refusal = choice?.message?.refusal?.trim();
    if (refusal) {
      throw new Error(`AI refused the request: ${refusal}`);
    }
    if (finishReason === 'length') {
      throw new Error('Empty response from AI API (output token limit reached before any text was produced — the model likely spent all tokens on reasoning; try a larger max_tokens or a non-reasoning model).');
    }
    throw new Error(`Empty response from AI API${finishReason ? ` (finish_reason: ${finishReason})` : ''}`);
  }

  async healthCheck(): Promise<{ ok: boolean; message: string }> {
    try {
      await this.chatCompletion([{ role: 'user', content: 'Respond with exactly: ok' }]);
      return { ok: true, message: 'Connection successful.' };
    } catch (err) {
      return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  }

  async dispose(): Promise<void> {}
}

function isReasoningModel(model: string): boolean {
  return /gpt-oss|deepseek-r1|qwen.*(?:thinking|reasoning)|o[1-4](?:-|$)/i.test(model);
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
  }
}
