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
exports.callChatCompletion = callChatCompletion;
const aiProviderFactory_1 = require("./aiProviderFactory");
const queuedCompletions = [];
let activeCompletions = 0;
let completionSequence = 0;
async function callChatCompletion(settings, messages, maxTokens, priority = 0) {
    return enqueueCompletion(settings, priority, async () => {
        const provider = await (0, aiProviderFactory_1.getProvider)(settings);
        return provider.chatCompletion(messages, maxTokens);
    });
}
function enqueueCompletion(settings, priority, task) {
    return new Promise((resolve, reject) => {
        queuedCompletions.push({
            priority,
            sequence: completionSequence++,
            run: async () => {
                try {
                    resolve(await task());
                }
                catch (err) {
                    reject(err);
                }
            },
        });
        pumpCompletionQueue(settings);
    });
}
function pumpCompletionQueue(settings) {
    const maxConcurrent = getMaxConcurrentCompletions(settings);
    while (activeCompletions < maxConcurrent && queuedCompletions.length > 0) {
        queuedCompletions.sort((a, b) => b.priority - a.priority || a.sequence - b.sequence);
        const next = queuedCompletions.shift();
        if (!next)
            return;
        activeCompletions++;
        next.run()
            .finally(() => {
            activeCompletions--;
            pumpCompletionQueue(settings);
        });
    }
}
function getMaxConcurrentCompletions(settings) {
    if (settings.aiProviderType === 'local' || isLocalBaseUrl(settings.aiBaseUrl)) {
        return 1;
    }
    return 4;
}
function isLocalBaseUrl(baseUrl) {
    try {
        const host = new URL(baseUrl).hostname.toLowerCase();
        return host === 'localhost' || host === '127.0.0.1' || host === '::1';
    }
    catch {
        return /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
    }
}
//# sourceMappingURL=openAiCompatibleClient.js.map