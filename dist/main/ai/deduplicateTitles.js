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
exports.deduplicateCategory = deduplicateCategory;
exports.testAiConnection = testAiConnection;
const openAiCompatibleClient_1 = require("./openAiCompatibleClient");
const db_1 = require("../db");
async function deduplicateCategory(categoryId, settings) {
    if (!settings.aiDeduplicationEnabled) {
        return { success: false, message: 'AI deduplication is disabled.' };
    }
    if (settings.aiProviderType === 'openai' && !settings.aiApiKey) {
        return { success: false, message: 'API key is missing.' };
    }
    const articles = await (0, db_1.getArticlesForDedup)(categoryId, 7);
    if (articles.length < 2) {
        return { success: true, message: 'Not enough articles to deduplicate.' };
    }
    // Reset previous duplicate flags for this category
    await (0, db_1.resetDuplicateFlagsForCategory)(categoryId);
    const inputArticles = articles.map((a) => ({
        id: a.id,
        title: a.title,
        publishedAt: a.publishedAt,
        source: a.feedTitle || 'Unknown',
    }));
    const promptContent = JSON.stringify({
        task: 'Group news articles by semantic similarity of their titles.',
        rules: [
            'Group titles that likely refer to the same real-world event or substantially the same story.',
            'Do not group titles only because they share broad topics.',
            'Return strict JSON only.',
            'Every group must contain at least 2 article IDs.',
            'For each group choose exactly one canonicalArticleId. Prefer newer articles, articles with better descriptions, and known feed sources.',
        ],
        articles: inputArticles,
        outputSchema: {
            groups: [
                {
                    canonicalArticleId: 'string',
                    duplicateArticleIds: ['string'],
                    reason: 'string',
                },
            ],
        },
    });
    try {
        const responseText = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
            {
                role: 'system',
                content: 'You are a helpful assistant that groups news articles by semantic similarity. You must respond with valid JSON only, no markdown, no explanations.',
            },
            { role: 'user', content: promptContent },
        ]);
        let result;
        try {
            result = parseAiResponse(responseText);
        }
        catch (parseErr) {
            // Retry once with repair prompt
            console.warn('AI dedup parse failed, retrying with repair prompt:', parseErr);
            const repairResponse = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
                {
                    role: 'system',
                    content: 'You are a JSON repair tool. Fix the following broken JSON and return only valid JSON.',
                },
                { role: 'user', content: responseText },
            ]);
            result = parseAiResponse(repairResponse);
        }
        await (0, db_1.insertAiDuplicateRun)({
            id: crypto.randomUUID(),
            categoryId,
            createdAt: new Date().toISOString(),
            model: settings.aiModel,
            inputHash: hashInput(inputArticles),
            resultJson: JSON.stringify(result),
        });
        // Apply duplicate flags
        for (const group of result.groups) {
            if (!group.canonicalArticleId || group.duplicateArticleIds.length < 1)
                continue;
            const allIds = [group.canonicalArticleId, ...group.duplicateArticleIds];
            const groupId = crypto.randomUUID();
            await (0, db_1.markDuplicateGroup)(groupId, group.canonicalArticleId, allIds);
        }
        return {
            success: true,
            message: `Deduplication complete. Found ${result.groups.length} duplicate groups among ${articles.length} articles.`,
        };
    }
    catch (err) {
        console.error('AI deduplication failed:', err);
        return { success: false, message: `Deduplication failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
function parseAiResponse(text) {
    // Remove markdown code blocks if present
    let cleaned = text.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '');
    }
    const parsed = JSON.parse(cleaned);
    if (!parsed.groups || !Array.isArray(parsed.groups)) {
        throw new Error('Invalid response structure: missing groups array');
    }
    const validGroups = parsed.groups.filter((g) => g.canonicalArticleId &&
        Array.isArray(g.duplicateArticleIds) &&
        g.duplicateArticleIds.length >= 1);
    return { groups: validGroups };
}
function hashInput(articles) {
    const str = articles.map((a) => `${a.id}:${a.title}`).join('|');
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = (hash << 5) - hash + char;
        hash = hash & hash;
    }
    return hash.toString(16);
}
async function testAiConnection(settings) {
    if (settings.aiProviderType === 'openai' && !settings.aiApiKey) {
        return { success: false, message: 'API Key is missing.' };
    }
    try {
        await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
            { role: 'user', content: 'Respond with exactly: {"status":"ok"}' },
        ]);
        return { success: true, message: 'Connection successful.' };
    }
    catch (err) {
        return { success: false, message: `Connection failed: ${err instanceof Error ? err.message : String(err)}` };
    }
}
//# sourceMappingURL=deduplicateTitles.js.map