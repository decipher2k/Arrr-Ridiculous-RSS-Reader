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
exports.extractFeedImage = extractFeedImage;
exports.extractArticleImageFromFeedItem = extractArticleImageFromFeedItem;
exports.fetchArticleImageFromUrl = fetchArticleImageFromUrl;
const cheerio = __importStar(require("cheerio"));
function extractFeedImage(parsedFeed) {
    if (parsedFeed.image?.url)
        return parsedFeed.image.url;
    return null;
}
function extractArticleImageFromFeedItem(item) {
    // media:content
    const mediaContent = item.mediaContent;
    if (mediaContent && typeof mediaContent === 'object') {
        const mc = mediaContent;
        if (mc.$ && typeof mc.$ === 'object') {
            const attrs = mc.$;
            if (attrs.url)
                return attrs.url;
        }
        if (Array.isArray(mediaContent)) {
            const first = mediaContent[0];
            if (first?.$ && typeof first.$ === 'object') {
                const attrs = first.$;
                if (attrs.url)
                    return attrs.url;
            }
        }
    }
    // media:thumbnail
    const mediaThumbnail = item.mediaThumbnail;
    if (mediaThumbnail && typeof mediaThumbnail === 'object') {
        const mt = mediaThumbnail;
        if (mt.$ && typeof mt.$ === 'object') {
            const attrs = mt.$;
            if (attrs.url)
                return attrs.url;
        }
    }
    // enclosure
    const enclosure = item.enclosure;
    if (enclosure && typeof enclosure === 'object') {
        const enc = enclosure;
        if (enc.type?.startsWith('image/') && enc.url)
            return enc.url;
    }
    // content:encoded or description HTML
    const contentEncoded = item.contentEncoded;
    const description = item.description;
    const content = item.content;
    const html = contentEncoded || description || content || '';
    if (html) {
        const imgUrl = extractFirstImageFromHtml(html);
        if (imgUrl)
            return imgUrl;
    }
    return null;
}
function extractFirstImageFromHtml(html) {
    try {
        const $ = cheerio.load(html);
        const src = $('img').first().attr('src');
        return src || null;
    }
    catch {
        return null;
    }
}
async function fetchArticleImageFromUrl(url) {
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000);
        const response = await fetch(url, { signal: controller.signal });
        clearTimeout(timeout);
        if (!response.ok)
            return null;
        const html = await response.text();
        const $ = cheerio.load(html);
        // Open Graph
        const ogImage = $('meta[property="og:image"]').attr('content');
        if (ogImage)
            return ogImage;
        // Twitter Card
        const twImage = $('meta[name="twitter:image"]').attr('content');
        if (twImage)
            return twImage;
        // First reasonable image
        let firstImg = null;
        $('img').each((_, el) => {
            if (firstImg)
                return;
            const src = $(el).attr('src');
            if (src && src.length > 5 && !src.includes('tracking') && !src.includes('pixel')) {
                firstImg = src;
            }
        });
        return firstImg;
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=imageExtractor.js.map