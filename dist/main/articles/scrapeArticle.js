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
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.scrapeArticle = scrapeArticle;
const contentExtractor_1 = require("./contentExtractor");
const db_1 = require("../db");
const imageExtractor_1 = require("../feeds/imageExtractor");
const ARTICLE_FETCH_TIMEOUT_MS = 30000;
const ARTICLE_FETCH_MAX_ATTEMPTS = 3;
const ARTICLE_FETCH_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    Pragma: 'no-cache',
    'Upgrade-Insecure-Requests': '1',
};
async function scrapeArticle(articleId) {
    const article = await (0, db_1.getArticleById)(articleId);
    if (!article)
        return null;
    const feeds = await (0, db_1.getFeeds)();
    const feed = feeds.find((f) => f.id === article.feedId);
    // For feed content mode, use the content from the RSS/Atom feed itself
    if (feed?.contentMode === 'feed') {
        const feedContentHtml = article.contentHtml || article.description || '';
        if (feedContentHtml) {
            const text = feedContentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
            await (0, db_1.updateArticleContent)(articleId, feedContentHtml, text, 'feed');
            return {
                contentHtml: feedContentHtml,
                contentText: text,
                teaserImageUrl: article.teaserImageUrl || article.imageUrl,
                contentSource: 'feed',
            };
        }
    }
    // For linked-article mode, reuse scraped content. Older app versions cached this
    // before contentSource existed, so null is treated as legacy scraped cache here.
    if (feed?.contentMode !== 'feed' &&
        (article.contentSource === 'scraped' || article.contentSource == null) &&
        article.contentHtml &&
        article.contentText) {
        if (article.contentSource == null) {
            await (0, db_1.updateArticleContent)(articleId, article.contentHtml, article.contentText, 'scraped');
        }
        return {
            contentHtml: article.contentHtml,
            contentText: article.contentText,
            teaserImageUrl: article.teaserImageUrl,
            contentSource: 'scraped',
        };
    }
    if (!article.link)
        return getFeedFallbackContent(article);
    try {
        const { html, finalUrl } = await fetchArticleHtml(article.link);
        const extracted = (0, contentExtractor_1.extractArticleContent)(html, article.link || undefined);
        if (isConsentPage(finalUrl, extracted.title, extracted.text)) {
            throw new Error(`Consent page instead of article: ${finalUrl}`);
        }
        // Try to fetch teaser image if not found in page
        let teaserImageUrl = extracted.teaserImageUrl;
        if (!teaserImageUrl && !article.imageUrl) {
            teaserImageUrl = await (0, imageExtractor_1.fetchArticleImageFromUrl)(article.link);
        }
        await (0, db_1.updateArticleContent)(articleId, extracted.html, extracted.text, 'scraped');
        // Update teaser image if found
        if (teaserImageUrl) {
            const { updateArticleTeaserImage } = await Promise.resolve().then(() => __importStar(require('../db')));
            await updateArticleTeaserImage(articleId, teaserImageUrl);
        }
        return {
            contentHtml: extracted.html,
            contentText: extracted.text,
            teaserImageUrl: teaserImageUrl || article.imageUrl,
            contentSource: 'scraped',
        };
    }
    catch (err) {
        console.error(`Failed to scrape article ${articleId}:`, err);
        return getFeedFallbackContent(article);
    }
}
function getFeedFallbackContent(article) {
    if (!article)
        return null;
    const contentHtml = article.contentHtml?.trim()
        ? article.contentHtml
        : article.description?.trim()
            ? `<p>${escapeHtml(article.description)}</p>`
            : '';
    if (!contentHtml.trim())
        return null;
    const contentText = (article.contentText?.trim() || article.description?.trim() || contentHtml.replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    return {
        contentHtml,
        contentText,
        teaserImageUrl: article.teaserImageUrl || article.imageUrl,
        contentSource: 'feed',
    };
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
async function fetchArticleHtml(url) {
    const articleHeaders = getArticleFetchHeaders(url);
    let first;
    try {
        first = await fetchTextWithRetry(url, articleHeaders);
    }
    catch (err) {
        if (!isGolemUrl(url))
            throw err;
        const cookie = await fetchGolemConsentCookie('|250101');
        if (!cookie)
            throw err;
        return fetchTextWithRetry(url, {
            ...articleHeaders,
            Cookie: cookie,
        });
    }
    if (!isGolemConsentPage(first.finalUrl, first.html)) {
        return first;
    }
    const version = extractGolemConsentVersion(first.html) || '|250101';
    const cookie = await fetchGolemConsentCookie(version);
    if (!cookie) {
        return first;
    }
    const retried = await fetchTextWithRetry(url, {
        ...articleHeaders,
        Cookie: cookie,
    });
    return retried;
}
function getArticleFetchHeaders(url) {
    return {
        ...ARTICLE_FETCH_HEADERS,
        Referer: getReferer(url),
    };
}
function getReferer(url) {
    try {
        const parsed = new URL(url);
        return `${parsed.protocol}//${parsed.hostname}/`;
    }
    catch {
        return '';
    }
}
async function fetchTextWithRetry(url, headers) {
    let lastError = null;
    for (let attempt = 1; attempt <= ARTICLE_FETCH_MAX_ATTEMPTS; attempt++) {
        try {
            return await fetchTextWithTimeout(url, headers);
        }
        catch (err) {
            lastError = err;
            if (attempt === ARTICLE_FETCH_MAX_ATTEMPTS || !isRetryableFetchError(err)) {
                break;
            }
            await sleep(500 * attempt);
        }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
async function fetchTextWithTimeout(url, headers) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers,
            redirect: 'follow',
        });
        if (!response.ok) {
            const error = new Error(`HTTP ${response.status}`);
            error.status = response.status;
            throw error;
        }
        return {
            html: await response.text(),
            finalUrl: response.url,
        };
    }
    finally {
        clearTimeout(timeout);
    }
}
function isRetryableFetchError(err) {
    if (!(err instanceof Error))
        return false;
    const status = err.status;
    if (status && (status === 429 || status >= 500))
        return true;
    return err.name === 'AbortError' || err.name === 'TypeError' || /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
function isConsentPage(finalUrl, title, text) {
    return isGolemConsentPage(finalUrl, text) || /willkommen auf golem\.de/i.test(title);
}
function isGolemConsentPage(finalUrl, htmlOrText) {
    return finalUrl.includes('/sonstiges/zustimmung/') || /GolemConsent|Cookies zustimmen|Willkommen auf Golem\.de/i.test(htmlOrText);
}
function isGolemUrl(url) {
    try {
        return new URL(url).hostname.endsWith('golem.de');
    }
    catch {
        return false;
    }
}
function extractGolemConsentVersion(html) {
    const match = html.match(/"cookieVersion"\s*:\s*"([^"]+)"/);
    return match?.[1] || null;
}
async function fetchGolemConsentCookie(version) {
    const consentUrl = `https://www.golem.de/abo/setconsentcookie.php?type=simple&version=${encodeURIComponent(version)}&expire=1&referer=`;
    try {
        const response = await fetchTextHeaders(consentUrl);
        const cookies = response
            .map((cookie) => cookie.split(';')[0].trim())
            .filter(Boolean);
        return cookies.length > 0 ? cookies.join('; ') : null;
    }
    catch (err) {
        console.warn('Failed to get Golem consent cookie:', err);
        return null;
    }
}
async function fetchTextHeaders(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
    try {
        const response = await fetch(url, {
            signal: controller.signal,
            headers: ARTICLE_FETCH_HEADERS,
        });
        if (!response.ok)
            return [];
        const headersWithSetCookie = response.headers;
        const setCookie = headersWithSetCookie.getSetCookie?.();
        if (setCookie && setCookie.length > 0)
            return setCookie;
        const singleCookie = response.headers.get('set-cookie');
        return singleCookie ? [singleCookie] : [];
    }
    finally {
        clearTimeout(timeout);
    }
}
//# sourceMappingURL=scrapeArticle.js.map