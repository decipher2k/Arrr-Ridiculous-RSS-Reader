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

export async function scrapeArticle(articleId: string): Promise<{ contentHtml: string; contentText: string; teaserImageUrl: string | null } | null> {
  const article = await getArticleById(articleId);
  if (!article) return null;

  const feeds = await getFeeds();
  const feed = feeds.find((f) => f.id === article.feedId);

  // For feed content mode, use the content from the RSS/Atom feed itself
  if (feed?.contentMode === 'feed') {
    const feedContentHtml = article.contentHtml || article.description || '';
    if (feedContentHtml) {
      const text = feedContentHtml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      await updateArticleContent(articleId, feedContentHtml, text);
      return {
        contentHtml: feedContentHtml,
        contentText: text,
        teaserImageUrl: article.teaserImageUrl || article.imageUrl,
      };
    }
  }

  // Return cached scraped content if available
  if (article.contentHtml && article.contentText) {
    return {
      contentHtml: article.contentHtml,
      contentText: article.contentText,
      teaserImageUrl: article.teaserImageUrl,
    };
  }

  if (!article.link) return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    const response = await fetch(article.link, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const html = await response.text();
    const extracted = extractArticleContent(html, article.link || undefined);

    // Try to fetch teaser image if not found in page
    let teaserImageUrl = extracted.teaserImageUrl;
    if (!teaserImageUrl && !article.imageUrl) {
      teaserImageUrl = await fetchArticleImageFromUrl(article.link);
    }

    await updateArticleContent(articleId, extracted.html, extracted.text);

    // Update teaser image if found
    if (teaserImageUrl) {
      const { updateArticleTeaserImage } = await import('../db');
      await updateArticleTeaserImage(articleId, teaserImageUrl);
    }

    return {
      contentHtml: extracted.html,
      contentText: extracted.text,
      teaserImageUrl: teaserImageUrl || article.imageUrl,
    };
  } catch (err) {
    console.error(`Failed to scrape article ${articleId}:`, err);
    return null;
  }
}
