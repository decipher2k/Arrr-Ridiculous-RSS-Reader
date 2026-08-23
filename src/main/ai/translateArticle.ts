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

import { callChatCompletion } from './openAiCompatibleClient';
import { getTranslation, saveTranslation } from '../db/translations';
import { getArticleById } from '../db';
import { scrapeArticle } from '../articles/scrapeArticle';
import type { AppSettings, ArticleTranslation, TranslateArticleResult } from '../../shared/types';

const LANGUAGE_NAMES: Record<string, string> = {
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

const FULL_TRANSLATION_CACHE_MARKER = '<!-- translation-mode:full-v3 -->';
const OPENAI_BATCH_CONCURRENCY = 3;
const LOCAL_LLM_BATCH_CONCURRENCY = 1;

function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars) + '...';
}

export async function translateAndSummarizeArticle(
  articleId: string,
  targetLanguage: string,
  settings: AppSettings
): Promise<TranslateArticleResult> {
  console.log('[translateAndSummarizeArticle] articleId:', articleId, 'targetLanguage:', targetLanguage);
  const cached = await getTranslation(articleId, targetLanguage);
  if (cached && cached.translatedHtml && cached.translatedHtml.includes(FULL_TRANSLATION_CACHE_MARKER)) {
    console.log('[translateAndSummarizeArticle] Cache hit with full translation');
    return {
      success: true,
      title: cached.translatedTitle,
      html: cached.translatedHtml,
      wordCount: cached.wordCount,
      cached: true,
    };
  }

  const article = await getArticleById(articleId);
  if (!article) {
    return { success: false, title: '', html: '', wordCount: 0, cached: false, message: 'Article not found' };
  }

  const scrapedContent = await scrapeArticle(articleId);
  const rawContentHtml = scrapedContent?.contentHtml || article.contentHtml || '';
  const rawContentText = scrapedContent?.contentText || article.contentText || article.description || '';

  if (!rawContentHtml.trim() && !rawContentText.trim()) {
    return {
      success: false,
      title: '',
      html: '',
      wordCount: 0,
      cached: false,
      message: 'Der verlinkte Artikel konnte nicht geladen werden, und es ist kein Feed-Inhalt zum Übersetzen gespeichert.',
    };
  }

  const sourceContent = rawContentHtml.trim()
    ? rawContentHtml
    : textToHtml(rawContentText);

  if (!sourceContent.trim()) {
    return { success: false, title: '', html: '', wordCount: 0, cached: false, message: 'Article has no content to translate' };
  }

  const MAX_CONTENT_CHARS = 16000;
  const contentHtml = sourceContent.length > MAX_CONTENT_CHARS
    ? sourceContent.slice(0, MAX_CONTENT_CHARS) + '\n\n<p>[Article continues but was truncated due to length.]</p>'
    : sourceContent;

  const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;

  try {
    const responseText = await callChatCompletion(settings, [
      {
        role: 'system',
        content:
          `You are a professional news translator. Your task is to translate the given article into ${langName}.
Return ONLY valid JSON, no markdown, no explanations.

The JSON must have this exact structure and must be COMPLETE (not truncated):
{
  "title": "The translated title",
  "description": "A short translated teaser or empty string",
  "html": "<h2>Translated section heading</h2><p>Translated paragraph text...</p><img src=\\"https://example.com/image.jpg\\" alt=\\"Translated alt text\\" style=\\"max-width:100%;height:auto;margin-bottom:1rem;\\" />",
  "wordCount": 512
}

IMPORTANT:
- Translate the article completely. Do NOT summarize, shorten, omit, rewrite, or add information.
- Preserve the original HTML structure as much as possible.
- Keep all <img> tags in their original positions.
- Keep image src and style attributes unchanged.
- Translate image alt text when it exists.
- Preserve paragraph and heading order.
- The "html" field must contain the FULL translated article, ending with a complete sentence and closing tags.
- Do NOT cut off the output mid-paragraph.
- Use only <h2>, <h3>, <p>, <img>, and <br> tags.
- Do not include <h1> tags; return the article title only in the JSON "title" field.
- If the source HTML contains an <h1> that repeats the title, omit it from "html".
- No links or scripts.`,
      },
      {
        role: 'user',
        content: `Original title: ${article.title}\n\nOriginal article HTML:\n${contentHtml}`,
      },
      ], 5000, 10);

    let parsed: { title: string; description: string; html: string; wordCount: number };
    try {
      parsed = parseTranslationResponse(responseText);
    } catch (parseErr) {
      const repairResponse = await callChatCompletion(settings, [
        {
          role: 'system',
          content: 'You are a JSON repair tool. Fix the following broken JSON and return only valid JSON.',
        },
        { role: 'user', content: responseText },
      ], undefined, 10);
      parsed = parseTranslationResponse(repairResponse);
    }

    const translation: ArticleTranslation = {
      articleId,
      targetLanguage,
      translatedTitle: parsed.title,
      translatedDescription: parsed.description || '',
      translatedHtml: `${FULL_TRANSLATION_CACHE_MARKER}\n${parsed.html}`,
      wordCount: parsed.wordCount,
      createdAt: new Date().toISOString(),
    };
    await saveTranslation(translation);

    return {
      success: true,
      title: parsed.title,
      html: parsed.html,
      wordCount: parsed.wordCount,
      cached: false,
    };
  } catch (err) {
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

function robustJsonClean(text: string): string {
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

function parseTranslationResponse(text: string): { title: string; description: string; html: string; wordCount: number } {
  const cleaned = robustJsonClean(text);
  if (/^\[\s*\.\.\.\s*\]$/.test(cleaned)) {
    throw new Error('AI returned a placeholder instead of a translation');
  }
  try {
    const parsed = JSON.parse(cleaned) as { title?: string; description?: string; html?: string; wordCount?: number };
    if (parsed.title && parsed.html) {
      return {
        title: parsed.title,
        description: parsed.description || '',
        html: sanitizeHtml(parsed.html),
        wordCount: parsed.wordCount ?? 0,
      };
    }
  } catch {
    // Continue to regex fallback
  }

  const extractStr = (field: string): string => {
    const pattern = '"' + field + '"\\s*:\\s*"';
    const re = new RegExp(pattern);
    const m = cleaned.match(re);
    if (!m || m.index === undefined) return '';
    let pos = m.index + m[0].length;
    let result = '';
    let escaped = false;
    while (pos < cleaned.length) {
      const ch = cleaned[pos];
      if (escaped) {
        if (ch === 'n') result += '\n';
        else if (ch === 't') result += '\t';
        else if (ch === 'r') result += '\r';
        else result += ch;
        escaped = false;
      } else if (ch === '\\') {
        escaped = true;
      } else if (ch === '"') {
        break;
      } else {
        result += ch;
      }
      pos++;
    }
    return result;
  };

  const extractNum = (field: string): number => {
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

function sanitizeHtml(html: string): string {
  return html
    .replace(/\son\w+="[^"]*"/gi, '')
    .replace(/\son\w+='[^']*'/gi, '')
    .replace(/<(?!\/?(h2|h3|p|img|br)\b)[^>]*>/gi, '')
    .replace(/<img\b([^>]*)>/gi, (_match, attrs: string) => sanitizeImageTag(attrs))
    .replace(/\s+/g, ' ')
    .trim();
}

function sanitizeImageTag(attrs: string): string {
  const src = extractAttribute(attrs, 'src');
  if (!src || /^\s*javascript:/i.test(src)) return '';

  const alt = extractAttribute(attrs, 'alt') || '';
  const style = extractAttribute(attrs, 'style') || 'max-width:100%;height:auto;margin-bottom:1rem;';

  return `<img src="${escapeHtmlAttribute(src)}" alt="${escapeHtmlAttribute(alt)}" style="${escapeHtmlAttribute(style)}" />`;
}

function extractAttribute(attrs: string, name: string): string | null {
  const re = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const match = attrs.match(re);
  return match ? (match[2] || match[3] || match[4] || '') : null;
}

function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`)
    .join('\n');
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeHtmlAttribute(text: string): string {
  return escapeHtml(text).replace(/`/g, '&#096;');
}

export async function batchTranslateArticleList(
  articleIds: string[],
  targetLanguage: string,
  settings: AppSettings,
  force = false,
  onProgress?: (articleId: string, title: string, description: string) => void
): Promise<void> {
  if (articleIds.length === 0 || !targetLanguage) return;

  const concurrency = settings.aiProviderType === 'local' || isLocalBaseUrl(settings.aiBaseUrl)
    ? LOCAL_LLM_BATCH_CONCURRENCY
    : OPENAI_BATCH_CONCURRENCY;

  console.log(`[batchTranslate] START limited translation for ${articleIds.length} articles, lang=${targetLanguage}, force=${force}, concurrency=${concurrency}`);

  const langName = LANGUAGE_NAMES[targetLanguage] || targetLanguage;
  const translateOne = async (articleId: string, i: number): Promise<'success' | 'skipped' | 'failed'> => {
    const article = await getArticleById(articleId);
    if (!article) {
      console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] Article not found: ${articleId}`);
      return 'failed' as const;
    }

    // Check cache unless force is true
    if (!force) {
      const cached = await getTranslation(articleId, targetLanguage);
      if (cached && cached.translatedTitle) {
        console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] Cache hit, skipping: ${truncateText(article.title, 60)}`);
        if (onProgress) {
          onProgress(articleId, cached.translatedTitle, cached.translatedDescription || '');
        }
        return 'skipped' as const;
      }
    }

    try {
      console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] Translating: ${truncateText(article.title, 60)}`);

      const responseText = await callChatCompletion(settings, [
        {
          role: 'system',
          content:
            `You are a professional translator. Translate the following article title and description into ${langName}.\n\n` +
            `Return ONLY valid JSON object, no markdown, no explanations.\n\n` +
            `The JSON must have this exact structure:\n` +
            `{"translatedTitle": "...", "translatedDescription": "..."}\n\n` +
            `Rules:\n` +
            `- Translate the title accurately\n` +
            `- Translate the description without summarizing, shortening, or adding information\n` +
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
      if (/^\[\s*\.\.\.\s*\]$/.test(cleaned)) {
        throw new Error('AI returned a placeholder instead of JSON');
      }
      const parsed = JSON.parse(cleaned) as { translatedTitle?: string; translatedDescription?: string };

      if (!parsed.translatedTitle) {
        throw new Error('Missing translatedTitle in response');
      }

      const translation: ArticleTranslation = {
        articleId,
        targetLanguage,
        translatedTitle: parsed.translatedTitle,
        translatedDescription: parsed.translatedDescription || '',
        translatedHtml: '',
        wordCount: 0,
        createdAt: new Date().toISOString(),
      };
      await saveTranslation(translation);

      // Emit progress event
      if (onProgress) {
        onProgress(articleId, parsed.translatedTitle, parsed.translatedDescription || '');
      }

      console.log(`[batchTranslate] [${i + 1}/${articleIds.length}] OK: ${truncateText(parsed.translatedTitle, 60)}`);
      return 'success' as const;
    } catch (err) {
      console.error(`[batchTranslate] [${i + 1}/${articleIds.length}] FAILED for ${articleId}:`, err instanceof Error ? err.message : String(err));
      return 'failed' as const;
    }
  };

  const results = await mapWithConcurrency(articleIds, concurrency, translateOne);

  const successCount = results.filter((result) => result === 'success').length;
  const skippedCount = results.filter((result) => result === 'skipped').length;
  const failCount = results.filter((result) => result === 'failed').length;

  console.log(`[batchTranslate] DONE. Success: ${successCount}, Skipped: ${skippedCount}, Failed: ${failCount}, Total: ${articleIds.length}`);
}

function isLocalBaseUrl(baseUrl: string): boolean {
  try {
    const host = new URL(baseUrl).hostname.toLowerCase();
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return /(^|\/\/)(localhost|127\.0\.0\.1)(:|\/|$)/i.test(baseUrl);
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));

  await Promise.all(Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex++;
      results[currentIndex] = await worker(items[currentIndex], currentIndex);
    }
  }));

  return results;
}
