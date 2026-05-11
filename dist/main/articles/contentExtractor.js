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
exports.extractArticleContent = extractArticleContent;
const cheerio = __importStar(require("cheerio"));
function extractArticleContent(html, pageUrl) {
    const $ = cheerio.load(html);
    // Remove unwanted elements
    $('script, style, nav, header, footer, aside, .sidebar, .advertisement, .ads, #cookie-banner, .cookie-banner, [class*="cookie"], [id*="cookie"]').remove();
    // Try to find main content container
    let $container = $('article').first();
    if (!$container.length) {
        $container = $('main').first();
    }
    if (!$container.length) {
        $container = $('body');
    }
    // Extract title
    const title = $('h1').first().text().trim() || $('title').first().text().trim() || '';
    // Extract teaser image (Open Graph / Twitter Card)
    let teaserImageUrl = null;
    const ogImage = $('meta[property="og:image"]').attr('content');
    if (ogImage) {
        teaserImageUrl = resolveUrl(ogImage, pageUrl || '');
    }
    else {
        const twImage = $('meta[name="twitter:image"]').attr('content');
        if (twImage)
            teaserImageUrl = resolveUrl(twImage, pageUrl || '');
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
    const seenImageUrls = new Set();
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
        containerHtml = containerHtml.replace(new RegExp(`<h1>\\s*${escapeRegex(title)}\\s*<\\/h1>`, 'gi'), '');
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
    const paragraphs = [];
    $container.find('p').each((_, el) => {
        const text = $(el).text().trim();
        if (text && text.length >= 3) {
            paragraphs.push(text);
        }
    });
    return {
        title,
        teaserImageUrl,
        headings: [],
        paragraphs,
        html: finalHtml,
        text: paragraphs.join('\n\n'),
    };
}
function resolveUrl(url, baseUrl) {
    if (!baseUrl || !url)
        return url;
    try {
        return new URL(url, baseUrl).href;
    }
    catch {
        return url;
    }
}
function escapeHtml(text) {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
//# sourceMappingURL=contentExtractor.js.map