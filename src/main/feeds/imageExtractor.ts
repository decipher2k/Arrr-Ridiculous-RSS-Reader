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

import type { Item } from 'rss-parser';
import * as cheerio from 'cheerio';

export function extractFeedImage(parsedFeed: { image?: { url?: string }; [key: string]: unknown }): string | null {
  if (parsedFeed.image?.url) return parsedFeed.image.url;
  return null;
}

export function extractArticleImageFromFeedItem(item: Record<string, unknown>): string | null {
  // media:content
  const mediaContent = item.mediaContent;
  if (mediaContent && typeof mediaContent === 'object') {
    const mc = mediaContent as Record<string, unknown>;
    if (mc.$ && typeof mc.$ === 'object') {
      const attrs = mc.$ as Record<string, string>;
      if (attrs.url) return attrs.url;
    }
    if (Array.isArray(mediaContent)) {
      const first = mediaContent[0] as Record<string, unknown>;
      if (first?.$ && typeof first.$ === 'object') {
        const attrs = first.$ as Record<string, string>;
        if (attrs.url) return attrs.url;
      }
    }
  }

  // media:thumbnail
  const mediaThumbnail = item.mediaThumbnail;
  if (mediaThumbnail && typeof mediaThumbnail === 'object') {
    const mt = mediaThumbnail as Record<string, unknown>;
    if (mt.$ && typeof mt.$ === 'object') {
      const attrs = mt.$ as Record<string, string>;
      if (attrs.url) return attrs.url;
    }
  }

  // enclosure
  const enclosure = item.enclosure;
  if (enclosure && typeof enclosure === 'object') {
    const enc = enclosure as Record<string, string>;
    if (enc.type?.startsWith('image/') && enc.url) return enc.url;
  }

  // content:encoded or description HTML
  const contentEncoded = item.contentEncoded as string | undefined;
  const description = item.description as string | undefined;
  const content = item.content as string | undefined;
  const html = contentEncoded || description || content || '';

  if (html) {
    const imgUrl = extractFirstImageFromHtml(html);
    if (imgUrl) return imgUrl;
  }

  return null;
}

function extractFirstImageFromHtml(html: string): string | null {
  try {
    const $ = cheerio.load(html);
    const src = $('img').first().attr('src');
    return src || null;
  } catch {
    return null;
  }
}

export async function fetchArticleImageFromUrl(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) return null;
    const html = await response.text();
    const $ = cheerio.load(html);

    // Open Graph
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) return ogImage;

    // Twitter Card
    const twImage = $('meta[name="twitter:image"]').attr('content');
    if (twImage) return twImage;

    // First reasonable image
    let firstImg: string | null = null;
    $('img').each((_, el) => {
      if (firstImg) return;
      const src = $(el).attr('src');
      if (src && src.length > 5 && !src.includes('tracking') && !src.includes('pixel')) {
        firstImg = src;
      }
    });

    return firstImg;
  } catch {
    return null;
  }
}
