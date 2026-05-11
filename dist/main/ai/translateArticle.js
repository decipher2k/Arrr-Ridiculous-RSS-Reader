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
exports.translateAndSummarizeArticle = translateAndSummarizeArticle;
exports.batchTranslateArticleList = batchTranslateArticleList;
const openAiCompatibleClient_1 = require("./openAiCompatibleClient");
const translations_1 = require("../db/translations");
const db_1 = require("../db");
const LANGUAGE_NAMES = {
    de: 'Deutsch',
    fr: 'Französisch',
    es: 'Spanisch',
    en: 'Englisch',
    it: 'Italienisch',
    hi: 'Hindi',
    zh: 'Chinesisch',
    ru: 'Russisch',
    ja: 'Japanisch',
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
function truncateText(text, maxChars) {
    if (text.length <= maxChars)
        return text;
    return text.slice(0, maxChars) + '...';
}
async function translateAndSummarizeArticle(articleId, targetLanguage, settings) {
    console.log('[translateAndSummarizeArticle] articleId:', articleId, 'targetLanguage:', targetLanguage);
    const cached = await (0, translations_1.getTranslation)(articleId, targetLanguage);
    if (cached && cached.translatedHtml) {
        console.log('[translateAndSummarizeArticle] Cache hit with full translation');
        return {
            success: true,
            title: cached.translatedTitle,
            html: cached.translatedHtml,
            wordCount: cached.wordCount,
            cached: true,
        };
    }
    const article = await (0, db_1.getArticleById)(articleId);
    if (!article) {
        return { success: false, title: '', html: '', wordCount: 0, cached: false, message: 'Article not found' };
    }
    const rawContentText = article.contentText || article.description || '';
    if (!rawContentText.trim()) {
        return { success: false, title: '', html: '', wordCount: 0, cached: false, message: 'Article has no content to translate' };
    }
    const MAX_CONTENT_CHARS = 12000;
    const contentText = rawContentText.length > MAX_CONTENT_CHARS
        ? rawContentText.slice(0, MAX_CONTENT_CHARS) + '\n\n[Article continues but was truncated due to length.]'
        : rawContentText;
    const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    try {
        const responseText = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
            {
                role: 'system',
                content: `You are a professional translator and summarizer. Your task is to:
1. Translate the given article into ${langName}.
2. Summarize it to approximately 500 words while keeping the most important facts, quotes, and key information.
3. Return ONLY valid JSON, no markdown, no explanations.

The JSON must have this exact structure and must be COMPLETE (not truncated):
{
  "title": "The translated and summarized title",
  "description": "A 1-2 sentence summary of the article in ${langName}",
  "html": "<h2>Section heading</h2><p>Paragraph text...</p><p>Next paragraph...</p>",
  "wordCount": 512
}

IMPORTANT:
- The "html" field must contain the FULL translated and summarized text, ending with a complete sentence and closing tags.
- Do NOT cut off the output mid-paragraph.
- Use only <h2>, <h3>, and <p> tags
- No <h1> tags (the title is separate)
- No images, no links, no styling attributes`,
            },
            {
                role: 'user',
                content: `Original title: ${article.title}\n\nOriginal article:\n${contentText}`,
            },
        ], 3500);
        let parsed;
        try {
            parsed = parseTranslationResponse(responseText);
        }
        catch (parseErr) {
            const repairResponse = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
                {
                    role: 'system',
                    content: 'You are a JSON repair tool. Fix the following broken JSON and return only valid JSON.',
                },
                { role: 'user', content: responseText },
            ]);
            parsed = parseTranslationResponse(repairResponse);
        }
        const translation = {
            articleId,
            targetLanguage,
            translatedTitle: parsed.title,
            translatedDescription: parsed.description || '',
            translatedHtml: parsed.html,
            wordCount: parsed.wordCount,
            createdAt: new Date().toISOString(),
        };
        await (0, translations_1.saveTranslation)(translation);
        return {
            success: true,
            title: parsed.title,
            html: parsed.html,
            wordCount: parsed.wordCount,
            cached: false,
        };
    }
    catch (err) {
        console.error('Translation failed:', err);
        return {
            success: false,
            title: '',
            html: '',
            wordCount: 0,
            cached: false,
            message: `Translation failed: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
function robustJsonClean(text) {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
    const firstBrace = Math.max(cleaned.indexOf('{'), cleaned.indexOf('['));
    if (firstBrace !== -1) {
        const isArray = cleaned[firstBrace] === '[';
        const lastBrace = cleaned.lastIndexOf(isArray ? ']' : '}');
        if (lastBrace > firstBrace) {
            cleaned = cleaned.slice(firstBrace, lastBrace + 1);
        }
    }
    cleaned = cleaned.replace(/\*\*/g, '');
    cleaned = cleaned.replace(/,(\s*[}\]])/g, '$1');
    return cleaned;
}
function parseTranslationResponse(text) {
    const cleaned = robustJsonClean(text);
    try {
        const parsed = JSON.parse(cleaned);
        if (parsed.title && parsed.html) {
            return {
                title: parsed.title,
                description: parsed.description || '',
                html: sanitizeHtml(parsed.html),
                wordCount: parsed.wordCount ?? 0,
            };
        }
    }
    catch {
        // Continue to regex fallback
    }
    const extractStr = (field) => {
        const pattern = '"' + field + '"\\s*:\\s*"';
        const re = new RegExp(pattern);
        const m = cleaned.match(re);
        if (!m || m.index === undefined)
            return '';
        let pos = m.index + m[0].length;
        let result = '';
        let escaped = false;
        while (pos < cleaned.length) {
            const ch = cleaned[pos];
            if (escaped) {
                if (ch === 'n')
                    result += '\n';
                else if (ch === 't')
                    result += '\t';
                else if (ch === 'r')
                    result += '\r';
                else
                    result += ch;
                escaped = false;
            }
            else if (ch === '\\') {
                escaped = true;
            }
            else if (ch === '"') {
                break;
            }
            else {
                result += ch;
            }
            pos++;
        }
        return result;
    };
    const extractNum = (field) => {
        const re = new RegExp('"' + field + '"\\s*:\\s*(\\d+)');
        const m = cleaned.match(re);
        return m ? parseInt(m[1], 10) : 0;
    };
    let title = extractStr('title');
    let html = extractStr('html');
    if (!title || !html) {
        throw new Error('Invalid translation response: missing title or html');
    }
    return {
        title,
        description: extractStr('description'),
        html: sanitizeHtml(html),
        wordCount: extractNum('wordCount'),
    };
}
function sanitizeHtml(html) {
    return html
        .replace(/<(?!\/?(h2|h3|p|br)\b)[^>]*>/gi, '')
        .replace(/\s+/g, ' ')
        .trim();
}
// NEW: Sequential single-article batch translation with per-article events
async function batchTranslateArticleList(articleIds, targetLanguage, settings, force = false, onProgress) {
    if (articleIds.length === 0 || !targetLanguage)
        return;
    console.log(`[batchTranslate] START sequential translation for ${articleIds.length} articles, lang=${targetLanguage}, force=${force}`);
    const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    for (let i = 0; i < articleIds.length; i++) {
        const articleId = articleIds[i];
        const article = await (0, db_1.getArticleById)(articleId);
        if (!article) {
            console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] Article not found: ${articleId}`);
            failCount++;
            continue;
        }
        // Check cache unless force is true
        if (!force) {
            const cached = await (0, translations_1.getTranslation)(articleId, targetLanguage);
            if (cached && cached.translatedTitle) {
                console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] Cache hit, skipping: ${truncateText(article.title, 60)}`);
                skippedCount++;
                if (onProgress) {
                    onProgress(articleId, cached.translatedTitle, cached.translatedDescription || '');
                }
                continue;
            }
        }
        try {
            console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] Translating: ${truncateText(article.title, 60)}`);
            const responseText = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
                {
                    role: 'system',
                    content: `You are a professional translator. Translate the following article title and description into ${langName}.\n\n` +
                        `Return ONLY valid JSON object, no markdown, no explanations.\n\n` +
                        `The JSON must have this exact structure:\n` +
                        `{"translatedTitle": "...", "translatedDescription": "..."}\n\n` +
                        `Rules:\n` +
                        `- Translate the title accurately\n` +
                        `- For description: translate and keep it concise (1-2 sentences max)\n` +
                        `- If description is empty, return an empty string`,
                },
                {
                    role: 'user',
                    content: JSON.stringify({
                        title: article.title,
                        description: (article.description || '').slice(0, 1000),
                    }),
                },
            ], 1500);
            const cleaned = robustJsonClean(responseText);
            const parsed = JSON.parse(cleaned);
            if (!parsed.translatedTitle) {
                throw new Error('Missing translatedTitle in response');
            }
            const translation = {
                articleId,
                targetLanguage,
                translatedTitle: parsed.translatedTitle,
                translatedDescription: parsed.translatedDescription || '',
                translatedHtml: '',
                wordCount: 0,
                createdAt: new Date().toISOString(),
            };
            await (0, translations_1.saveTranslation)(translation);
            successCount++;
            // Emit progress event
            if (onProgress) {
                onProgress(articleId, parsed.translatedTitle, parsed.translatedDescription || '');
            }
            console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] OK: ${truncateText(parsed.translatedTitle, 60)}`);
            // Small delay to not overload the local server
            if (i < articleIds.length - 1) {
                await sleep(150);
            }
        }
        catch (err) {
            console.error(`[batchTranslate] [${i + 1}/${articleIds.length}] FAILED for ${articleId}:`, err instanceof Error ? err.message : String(err));
            failCount++;
            // Continue with next article
            await sleep(150);
        }
    }
    console.log(`[batchTranslate] DONE. Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failCount}, Total: ${articleIds.length}`);
}
//# sourceMappingURL=translateArticle.js.map