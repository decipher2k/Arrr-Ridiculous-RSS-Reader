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

import { extractArticleContent } from './contentExtractor';
import { getArticleById, updateArticleContent, getFeeds } from '../db';
import { fetchArticleImageFromUrl } from '../feeds/imageExtractor';

const ARTICLE_FETCH_TIMEOUT_MS = 30000;
const ARTICLE_FETCH_MAX_ATTEMPTS = 3;
const ARTICLE_FETCH_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'de-DE,de;q=0.9,en-US;q=0.8,en;q=0.7',
  'Cache-Control': 'no-cache',
  Pragma: 'no-cache',
  'Upgrade-Insecure-Requests': '1',
};

export interface ScrapedArticleContent {
  contentHtml: string;
  contentText: string;
  teaserImageUrl: string | null;
  contentSource: 'feed' | 'scraped';
}

export async function scrapeArticle(articleId: string): Promise<ScrapedArticleContent | null> {
  const article = await getArticleById(articleId);
  if (!article) return null;

  const feeds = await getFeeds();
  const feed = feeds.find((f) => f.id === article.feedId);

  // For feed content mode, use the content from the RSS/Atom feed itself
  if (feed?.contentMode === 'feed') {
    const feedContentHtml = article.contentHtml || article.description || '';
    if (feedContentHtml) {
      const text = feedContentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      await updateArticleContent(articleId, feedContentHtml, text, 'feed');
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
  if (
    feed?.contentMode !== 'feed' &&
    (article.contentSource === 'scraped' || article.contentSource == null) &&
    article.contentHtml &&
    article.contentText
  ) {
    if (article.contentSource == null) {
      await updateArticleContent(articleId, article.contentHtml, article.contentText, 'scraped');
    }
    return {
      contentHtml: article.contentHtml,
      contentText: article.contentText,
      teaserImageUrl: article.teaserImageUrl,
      contentSource: 'scraped',
    };
  }

  if (!article.link) return getFeedFallbackContent(article);

  try {
    const { html, finalUrl } = await fetchArticleHtml(article.link);
    const extracted = extractArticleContent(html, article.link || undefined);

    if (isConsentPage(finalUrl, extracted.title, extracted.text)) {
      throw new Error(`Consent page instead of article: ${finalUrl}`);
    }

    // Try to fetch teaser image if not found in page
    let teaserImageUrl = extracted.teaserImageUrl;
    if (!teaserImageUrl && !article.imageUrl) {
      teaserImageUrl = await fetchArticleImageFromUrl(article.link);
    }

    await updateArticleContent(articleId, extracted.html, extracted.text, 'scraped');

    // Update teaser image if found
    if (teaserImageUrl) {
      const { updateArticleTeaserImage } = await import('../db');
      await updateArticleTeaserImage(articleId, teaserImageUrl);
    }

    return {
      contentHtml: extracted.html,
      contentText: extracted.text,
      teaserImageUrl: teaserImageUrl || article.imageUrl,
      contentSource: 'scraped',
    };
  } catch (err) {
    console.error(`Failed to scrape article ${articleId}:`, err);
    return getFeedFallbackContent(article);
  }
}

function getFeedFallbackContent(article: Awaited<ReturnType<typeof getArticleById>>): ScrapedArticleContent | null {
  if (!article) return null;

  const contentHtml = article.contentHtml?.trim()
    ? article.contentHtml
    : article.description?.trim()
      ? `<p>${escapeHtml(article.description)}</p>`
      : '';

  if (!contentHtml.trim()) return null;

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function fetchArticleHtml(url: string): Promise<{ html: string; finalUrl: string }> {
  const articleHeaders = getArticleFetchHeaders(url);
  let first: { html: string; finalUrl: string };
  try {
    first = await fetchTextWithRetry(url, articleHeaders);
  } catch (err) {
    if (!isGolemUrl(url)) throw err;

    const cookie = await fetchGolemConsentCookie('|250101');
    if (!cookie) throw err;

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

function getArticleFetchHeaders(url: string): Record<string, string> {
  return {
    ...ARTICLE_FETCH_HEADERS,
    Referer: getReferer(url),
  };
}

function getReferer(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/`;
  } catch {
    return '';
  }
}

async function fetchTextWithRetry(url: string, headers: Record<string, string>): Promise<{ html: string; finalUrl: string }> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= ARTICLE_FETCH_MAX_ATTEMPTS; attempt++) {
    try {
      return await fetchTextWithTimeout(url, headers);
    } catch (err) {
      lastError = err;
      if (attempt === ARTICLE_FETCH_MAX_ATTEMPTS || !isRetryableFetchError(err)) {
        break;
      }
      await sleep(500 * attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

async function fetchTextWithTimeout(url: string, headers: Record<string, string>): Promise<{ html: string; finalUrl: string }> {
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
      (error as Error & { status?: number }).status = response.status;
      throw error;
    }

    return {
      html: await response.text(),
      finalUrl: response.url,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function isRetryableFetchError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const status = (err as Error & { status?: number }).status;
  if (status && (status === 429 || status >= 500)) return true;
  return err.name === 'AbortError' || err.name === 'TypeError' || /fetch failed|network|timeout|ECONNRESET|ETIMEDOUT/i.test(err.message);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConsentPage(finalUrl: string, title: string, text: string): boolean {
  return isGolemConsentPage(finalUrl, text) || /willkommen auf golem\.de/i.test(title);
}

function isGolemConsentPage(finalUrl: string, htmlOrText: string): boolean {
  return finalUrl.includes('/sonstiges/zustimmung/') || /GolemConsent|Cookies zustimmen|Willkommen auf Golem\.de/i.test(htmlOrText);
}

function isGolemUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith('golem.de');
  } catch {
    return false;
  }
}

function extractGolemConsentVersion(html: string): string | null {
  const match = html.match(/"cookieVersion"\s*:\s*"([^"]+)"/);
  return match?.[1] || null;
}

async function fetchGolemConsentCookie(version: string): Promise<string | null> {
  const consentUrl = `https://www.golem.de/abo/setconsentcookie.php?type=simple&version=${encodeURIComponent(version)}&expire=1&referer=`;
  try {
    const response = await fetchTextHeaders(consentUrl);
    const cookies = response
      .map((cookie) => cookie.split(';')[0].trim())
      .filter(Boolean);
    return cookies.length > 0 ? cookies.join('; ') : null;
  } catch (err) {
    console.warn('Failed to get Golem consent cookie:', err);
    return null;
  }
}

async function fetchTextHeaders(url: string): Promise<string[]> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ARTICLE_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: ARTICLE_FETCH_HEADERS,
    });
    if (!response.ok) return [];

    const headersWithSetCookie = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookie = headersWithSetCookie.getSetCookie?.();
    if (setCookie && setCookie.length > 0) return setCookie;

    const singleCookie = response.headers.get('set-cookie');
    return singleCookie ? [singleCookie] : [];
  } finally {
    clearTimeout(timeout);
  }
}
