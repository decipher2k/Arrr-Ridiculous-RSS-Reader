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

import * as cheerio from 'cheerio';
import type { Element } from 'domhandler';

export interface ExtractedContent {
  title: string;
  teaserImageUrl: string | null;
  headings: { level: number; text: string }[];
  paragraphs: string[];
  html: string;
  text: string;
}

export function extractArticleContent(html: string, pageUrl?: string): ExtractedContent {
  const $ = cheerio.load(html);
  const structuredFallback = extractStructuredFallback($);

  // Remove unwanted elements
  $('script, style, template, nav, footer, aside, .sidebar, .advertisement, .ads, #cookie-banner, .cookie-banner, [class*="cookie"], [id*="cookie"]').remove();

  const $container = findBestContentContainer($);

  // Extract title
  const title = $('h1').first().text().trim() || structuredFallback.title || $('title').first().text().trim() || '';

  // Extract teaser image (Open Graph / Twitter Card)
  let teaserImageUrl: string | null = null;
  const ogImage = $('meta[property="og:image"]').attr('content');
  if (ogImage) {
    teaserImageUrl = resolveUrl(ogImage, pageUrl || '');
  } else {
    const twImage = $('meta[name="twitter:image"]').attr('content');
    if (twImage) teaserImageUrl = resolveUrl(twImage, pageUrl || '');
  }

  // Fallback: first image in article content
  if (!teaserImageUrl) {
    const firstContentImg = $container.find('img').first().attr('src');
    if (firstContentImg) {
      teaserImageUrl = resolveUrl(firstContentImg, pageUrl || '');
    }
  }

  // Get container HTML and process it
  let containerHtml = $container.html() || '';

  // Step 1: Deduplicate images - keep only the first occurrence of each image URL
  const seenImageUrls = new Set<string>();
  containerHtml = containerHtml.replace(/<img\b[^>]*>/gi, (match) => {
    const srcMatch = match.match(/src="([^"]+)"/);
    if (srcMatch) {
      const src = resolveUrl(srcMatch[1], pageUrl || '');
      if (seenImageUrls.has(src)) {
        return ''; // Remove duplicate image
      }
      seenImageUrls.add(src);
      const altMatch = match.match(/alt="([^"]*)"/);
      return `<img src="${src}" alt="${altMatch ? altMatch[1] : ''}" style="max-width:100%;height:auto;margin-bottom:1rem;" />`;
    }
    return match;
  });

  // Step 2: Remove all unwanted tags, keep only h1, h2, h3, p, img, br
  // This preserves structure while stripping divs, spans, sections, etc.
  containerHtml = containerHtml.replace(/<(?!\/?(h1|h2|h3|p|img|br)(?:\s|>))[^>]*>/gi, ' ');

  // Step 3: Clean up whitespace
  containerHtml = containerHtml.replace(/\s+/g, ' ').trim();

  // Step 4: Remove duplicate h1 if we're adding our own title
  // Remove h1 tags that contain the same text as the title
  if (title) {
    containerHtml = containerHtml.replace(/<h1>\s*<\/h1>/gi, '');
    containerHtml = containerHtml.replace(
      new RegExp(`<h1>\\s*${escapeRegex(title)}\\s*<\\/h1>`, 'gi'),
      ''
    );
  }

  // Step 5: Build final HTML
  let finalHtml = '';

  // Add teaser image only if not already in content
  if (teaserImageUrl && !seenImageUrls.has(teaserImageUrl)) {
    finalHtml += `<img src="${teaserImageUrl}" alt="Teaser" style="max-width:100%;height:auto;margin-bottom:1rem;" />\n`;
  }

  // Add title as h1
  if (title) {
    finalHtml += `<h1>${escapeHtml(title)}</h1>\n`;
  }

  // Add cleaned container content
  finalHtml += containerHtml;

  // Extract paragraphs for text version
  const paragraphs: string[] = [];
  $container.find('p').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length >= 3) {
      paragraphs.push(text);
    }
  });

  let finalText = paragraphs.join('\n\n');
  if (finalText.length < 150) {
    const fallbackParagraphs = structuredFallback.paragraphs.length > 0
      ? structuredFallback.paragraphs
      : extractMetaFallbackParagraphs($);
    const fallbackText = fallbackParagraphs.join('\n\n');
    if (fallbackText.length > finalText.length) {
      finalHtml = buildFallbackHtml(title, teaserImageUrl, fallbackParagraphs);
      paragraphs.splice(0, paragraphs.length, ...fallbackParagraphs);
      finalText = fallbackText;
    }
  }

  return {
    title,
    teaserImageUrl,
    headings: [],
    paragraphs,
    html: finalHtml,
    text: finalText,
  };
}

function findBestContentContainer($: cheerio.CheerioAPI): cheerio.Cheerio<Element> {
  const selector = [
    '.article-content',
    '.article-layout__content',
    '.js-upscore-article-content-for-paywall',
    '.js-upscore-article-content',
    '.entry-content',
    '.post-content',
    '.story-content',
    '.c-article-content',
    '[itemprop="articleBody"]',
    '[role="main"]',
    'article',
    'main',
  ].join(', ');

  let best: Element | null = null;
  let bestScore = 0;

  $(selector).each((_, el) => {
    const element = el as Element;
    const score = scoreContentElement($, element);
    if (score > bestScore) {
      best = element;
      bestScore = score;
    }
  });

  return best && bestScore > 80 ? $(best) : $('body');
}

function scoreContentElement($: cheerio.CheerioAPI, el: Element): number {
  const $el = $(el);
  const paragraphText = $el
    .find('p')
    .map((_, p) => $(p).text().trim())
    .get()
    .filter((text) => text.length >= 30)
    .join(' ');
  const headingText = $el
    .find('h1,h2,h3')
    .map((_, h) => $(h).text().trim())
    .get()
    .join(' ');
  const className = String($el.attr('class') || '');
  const id = String($el.attr('id') || '');
  const contentBoost = /(article|content|meldung|story|post)/i.test(`${className} ${id}`) ? 250 : 0;
  return paragraphText.length + headingText.length * 0.25 + contentBoost;
}

function extractStructuredFallback($: cheerio.CheerioAPI): { title: string; paragraphs: string[] } {
  let title = '';
  let body = '';
  let description = '';

  $('script[type="application/ld+json"]').each((_, el) => {
    if (body) return;
    const raw = $(el).contents().text().trim();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      const article = findStructuredArticle(parsed);
      if (article) {
        title = asString(article.headline) || title;
        body = asString(article.articleBody) || body;
        description = asString(article.description) || description;
      }
    } catch {
      // Ignore malformed structured data.
    }
  });

  const text = body || description;
  return {
    title,
    paragraphs: splitFallbackText(text),
  };
}

function findStructuredArticle(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object') return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findStructuredArticle(item);
      if (found) return found;
    }
    return null;
  }

  const record = value as Record<string, unknown>;
  const type = record['@type'];
  const types = Array.isArray(type) ? type.map(String) : [String(type || '')];
  if (types.some((entry) => /^(NewsArticle|Article|BlogPosting)$/i.test(entry))) {
    return record;
  }

  const graph = record['@graph'];
  if (Array.isArray(graph)) {
    return findStructuredArticle(graph);
  }

  return null;
}

function extractMetaFallbackParagraphs($: cheerio.CheerioAPI): string[] {
  const candidates = [
    $('meta[name="description"]').attr('content'),
    $('meta[property="og:description"]').attr('content'),
    $('meta[property="twitter:description"]').attr('content'),
  ];
  const text = candidates.find((candidate) => candidate && candidate.trim().length > 0) || '';
  return splitFallbackText(text);
}

function splitFallbackText(text: string): string[] {
  return text
    .split(/\n{2,}|(?<=[.!?])\s+(?=[A-ZÄÖÜ])/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length >= 20);
}

function buildFallbackHtml(title: string, teaserImageUrl: string | null, paragraphs: string[]): string {
  const chunks: string[] = [];
  if (teaserImageUrl) {
    chunks.push(`<img src="${escapeHtml(teaserImageUrl)}" alt="Teaser" style="max-width:100%;height:auto;margin-bottom:1rem;" />`);
  }
  if (title) {
    chunks.push(`<h1>${escapeHtml(title)}</h1>`);
  }
  chunks.push(...paragraphs.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`));
  return chunks.join('\n');
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function resolveUrl(url: string, baseUrl: string): string {
  if (!baseUrl || !url) return url;
  try {
    return new URL(url, baseUrl).href;
  } catch {
    return url;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
