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

import Parser from 'rss-parser';
import type { Feed, Article } from '../../shared/types';
import { findExistingArticle, batchInsertArticles, updateFeedMeta, cleanupOldArticlesForCategory, getFeedCategories } from '../db';
import { extractFeedImage, extractArticleImageFromFeedItem } from './imageExtractor';

const parser = new Parser({
  customFields: {
    item: [
      ['media:content', 'mediaContent'],
      ['media:thumbnail', 'mediaThumbnail'],
      ['enclosure', 'enclosure'],
      ['content:encoded', 'contentEncoded'],
      ['summary', 'summary'],
    ],
  },
});

export interface ParsedFeedResult {
  feed: Record<string, unknown>;
  articles: Article[];
}

export async function fetchAndParseFeed(feed: Feed): Promise<ParsedFeedResult> {
  const parsedRaw = await parser.parseURL(feed.url);
  const parsed = parsedRaw as unknown as { link?: string; title?: string; image?: { url?: string }; items: Record<string, unknown>[] };

  // Update feed metadata
  const siteUrl = parsed.link ?? feed.siteUrl;
  const imageUrl = extractFeedImage(parsedRaw as Record<string, unknown>) ?? feed.imageUrl;
  const title = parsed.title ?? feed.title;
  if (siteUrl || imageUrl || title) {
    await updateFeedMeta(feed.id, {
      title: title || undefined,
      siteUrl: siteUrl || undefined,
      imageUrl: imageUrl || undefined,
    });
  }

  const articles: Article[] = [];

  for (const rawItem of parsed.items) {
    const item = rawItem as Record<string, unknown>;
    const guid = (item.guid as string | undefined) ?? (item.id as string | undefined) ?? (item.link as string | undefined);
    const title = item.title as string | undefined;
    if (!guid || !title) continue;

    const normalizedTitle = title.toLowerCase().trim();
    const link = (item.link as string) || '';
    const existing = await findExistingArticle(feed.id, guid, link, normalizedTitle);
    if (existing) continue;

    const articleId = guid || crypto.randomUUID();
    const pubDate = item.pubDate as string | undefined;
    const publishedAt = pubDate ? new Date(pubDate).toISOString() : new Date().toISOString();
    const description = (item.summary as string | undefined) || (item.contentSnippet as string | undefined) || (item.content as string | undefined) || null;
    const contentHtml = feed.contentMode === 'feed'
      ? ((item.contentEncoded as string | undefined) || (item.content as string | undefined) || null)
      : null;
    const contentText = contentHtml ? sanitizeDescription(contentHtml) : null;

    const imageUrl = extractArticleImageFromFeedItem(item) || null;

    const article: Article = {
      id: articleId,
      feedId: feed.id,
      title,
      description: sanitizeDescription(description),
      link,
      imageUrl,
      teaserImageUrl: null,
      publishedAt,
      fetchedAt: new Date().toISOString(),
      contentHtml,
      contentText,
      contentSource: contentHtml ? 'feed' : null,
      duplicateGroupId: null,
      isHiddenDuplicate: 0,
    };

    articles.push(article);
  }

  // Batch insert all new articles at once (reduces writes from N to 1 per feed)
  if (articles.length > 0) {
    await batchInsertArticles(articles);
  }

  // Cleanup old articles for each category this feed belongs to
  const categoryIds = await getFeedCategories(feed.id);
  for (const categoryId of categoryIds) {
    await cleanupOldArticlesForCategory(categoryId);
  }

  return { feed: parsed, articles };
}

function sanitizeDescription(input: string | null): string | null {
  if (!input) return null;
  return input.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 2000);
}
