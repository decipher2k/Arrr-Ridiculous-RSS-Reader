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
Object.defineProperty(exports, "__esModule", { value: true });
exports.OpenAIProvider = void 0;
class OpenAIProvider {
    settings;
    name = 'OpenAI-Compatible';
    isGpuAccelerated = false;
    constructor(settings) {
        this.settings = settings;
    }
    async init() { }
    async chatCompletion(messages, maxTokens = 4000) {
        const url = `${this.settings.aiBaseUrl.replace(/\/$/, '')}/chat/completions`;
        const body = {
            model: this.settings.aiModel,
            messages,
            temperature: this.settings.aiTemperature,
            max_tokens: maxTokens,
        };
        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${this.settings.aiApiKey}`,
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`API error ${res.status}: ${text}`);
        }
        const data = (await res.json());
        const content = data.choices?.[0]?.message?.content;
        if (!content)
            throw new Error('Empty response from AI API');
        return content;
    }
    async healthCheck() {
        try {
            await this.chatCompletion([{ role: 'user', content: 'Respond with exactly: ok' }]);
            return { ok: true, message: 'Connection successful.' };
        }
        catch (err) {
            return { ok: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
        }
    }
    async dispose() { }
}
exports.OpenAIProvider = OpenAIProvider;
//# sourceMappingURL=openAiProvider.js.map