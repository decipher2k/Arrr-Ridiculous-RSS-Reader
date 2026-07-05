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
exports.filterNiceNewsTitles = filterNiceNewsTitles;
const openAiCompatibleClient_1 = require("./openAiCompatibleClient");
async function filterNiceNewsTitles(articles, settings) {
    if (articles.length === 0) {
        return { success: true, negativeArticleIds: [] };
    }
    const ruleBasedNegativeIds = new Set(articles.filter((article) => isObviouslyNegativeTitle(article.title)).map((article) => article.id));
    if (settings.aiProviderType === 'openai' && !settings.aiApiKey) {
        return {
            success: true,
            negativeArticleIds: [...ruleBasedNegativeIds],
            usedFallbackOnly: true,
            message: 'API key is missing. Used local keyword fallback only.',
        };
    }
    const validIds = new Set(articles.map((article) => article.id));
    const articlesForAi = articles.filter((article) => !ruleBasedNegativeIds.has(article.id));
    if (articlesForAi.length === 0) {
        return { success: true, negativeArticleIds: [...ruleBasedNegativeIds] };
    }
    const promptContent = JSON.stringify({
        task: 'Classify RSS news headlines for a Nice News view.',
        rules: [
            'Return IDs for all headlines that a reader would likely experience as bad, distressing, threatening, conflict-heavy, or pessimistic.',
            'Negative includes death, war, violence, crime, abuse, disasters, accidents, severe illness, hate, corruption, crisis, layoffs, losses, or scandals.',
            'Also mark political or economic headlines as negative when they emphasize threats, conflict, restrictions, collapse, debt, anger, lawsuits, attacks, or extremism.',
            'Do not mark headlines as negative when they are primarily about recovery, rescue, help, solutions, scientific progress, celebration, entertainment, culture, sports, weather, or neutral announcements.',
            'Judge only from the title.',
            'If the headline would be unwelcome in a Nice News feed, include its ID.',
            'Return strict JSON only. Do not include markdown or explanations.',
        ],
        examples: [
            { title: 'Mann erstochen - zwei Tatverdächtige festgenommen', negative: true },
            { title: 'Neun Verletzte nach verbotenem Überholvorgang', negative: true },
            { title: 'Forscher entdecken neue Mini-Oktopusart in der Tiefsee', negative: false },
            { title: 'Verein erhält Förderung für neues Kulturprojekt', negative: false },
        ],
        articles: articlesForAi,
        outputSchema: {
            negativeArticleIds: ['string'],
        },
    });
    try {
        const responseText = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
            {
                role: 'system',
                content: 'You classify news headlines for a positive RSS reader mode. Respond with valid JSON only.',
            },
            { role: 'user', content: promptContent },
        ], 1200);
        let parsed;
        try {
            parsed = parseNiceNewsResponse(responseText);
        }
        catch (parseErr) {
            console.warn('Nice News parse failed, retrying with repair prompt:', parseErr);
            const repairResponse = await (0, openAiCompatibleClient_1.callChatCompletion)(settings, [
                {
                    role: 'system',
                    content: 'You are a JSON repair tool. Fix the following broken JSON and return only valid JSON.',
                },
                { role: 'user', content: responseText },
            ], 800);
            parsed = parseNiceNewsResponse(repairResponse);
        }
        return {
            success: true,
            negativeArticleIds: [
                ...new Set([
                    ...ruleBasedNegativeIds,
                    ...parsed.negativeArticleIds.filter((id) => validIds.has(id)),
                ]),
            ],
        };
    }
    catch (err) {
        console.error('Nice News filtering failed:', err);
        return {
            success: true,
            negativeArticleIds: [...ruleBasedNegativeIds],
            usedFallbackOnly: true,
            message: `Nice News AI filtering failed. Used local keyword fallback only: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
function parseNiceNewsResponse(text) {
    const cleaned = cleanJson(text);
    const parsed = JSON.parse(cleaned);
    if (Array.isArray(parsed)) {
        return {
            negativeArticleIds: parsed
                .map((item) => {
                if (typeof item === 'string')
                    return item;
                if (item && typeof item === 'object' && 'id' in item && hasNegativeClassification(item)) {
                    return String(item.id);
                }
                return null;
            })
                .filter((id) => typeof id === 'string'),
        };
    }
    const ids = parsed.negativeArticleIds ?? parsed.negativeIds ?? parsed.ids;
    if (Array.isArray(ids)) {
        return {
            negativeArticleIds: ids.filter((id) => typeof id === 'string'),
        };
    }
    if (Array.isArray(parsed.articles)) {
        return {
            negativeArticleIds: parsed.articles
                .map((item) => {
                if (item && typeof item === 'object' && 'id' in item && hasNegativeClassification(item)) {
                    return String(item.id);
                }
                return null;
            })
                .filter((id) => typeof id === 'string'),
        };
    }
    if (!Array.isArray(parsed.negativeArticleIds)) {
        throw new Error('Invalid response structure: missing negativeArticleIds array');
    }
    return {
        negativeArticleIds: parsed.negativeArticleIds.filter((id) => typeof id === 'string'),
    };
}
function cleanJson(text) {
    let cleaned = text.trim();
    cleaned = cleaned.replace(/^```(?:json)?\s*/, '').replace(/\s*```\s*$/, '');
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
    }
    return cleaned.replace(/,(\s*[}\]])/g, '$1');
}
function hasNegativeClassification(item) {
    const record = item;
    const rawValue = record.negative ??
        record.isNegative ??
        record.hide ??
        record.shouldHide ??
        record.classification ??
        record.sentiment;
    if (typeof rawValue === 'boolean')
        return rawValue;
    if (typeof rawValue === 'string') {
        return /^(negative|bad|hide|true|yes|negativ)$/i.test(rawValue.trim());
    }
    return false;
}
function isObviouslyNegativeTitle(title) {
    const normalized = normalizeTitle(title);
    return NEGATIVE_TITLE_PATTERNS.some((pattern) => pattern.test(normalized));
}
function normalizeTitle(title) {
    return title
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[„“”"']/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
const NEGATIVE_TITLE_PATTERNS = [
    /\b(abuse|accident|attack|attacks|bankrupt|bankruptcy|collapse|corruption|crash|crime|crisis|dead|death|disaster|disease|drown|drowned|fatal|fire|flood|fraud|hate|injured|killed|killing|lawsuit|murder|protest|scandal|shooting|strike|terror|threat|victim|violence|war)\b/i,
    /\b(angriff|attacke|attentat|auseinandersetzung|brand|brandstiftung|einbruch|ermordet|erschossen|ersticht|erstochen|getotet|gewalt|hass|krieg|krise|mord|opfer|raub|skandal|terror|tod|tote|toten|todes|todesurteil|totet|umgebracht|verbrechen)\b/i,
    /\b(unfall|unfalle|ungluck|notfall|notfalle|katastrophe|evakuiert|evakuierung|explosion|feuer|flut|hochwasser|sturm|sturz|stürzt|sturzt)\b/i,
    /\b(verletzt|verletzte|verletzten|verletzung|schwer verletzt|stirbt|starb|sterben|gestorben|ertrinkt|ertrunken|totlich|todlich)\b/i,
    /\b(krank|kranke|kranken|erkrankt|erkranktem|erkrankung|psychose|sucht|mediensucht|depression|seuche)\b/i,
    /\b(festgenommen|tatverdachtig|tatverdachtige|untersuchungshaft|haft|polizei|kripo|illegal|illegale|klage|gericht|urteil)\b/i,
    /\b(schulden|pleite|verlust|verluste|entlassung|entlassungen|streit|warnt|warnung|droht|drohung|konflikt|eskalation|extremismus|afd|kreml|putin|israel|ukraine|russland|rakete|atomwaffenfahig|hyperschallrakete)\b/i,
    /\b(massaker|massenprotest|massenproteste|grossangriff|großangriff|beschuss|bombardierung|invasion|front|geisel)\b/i,
];
//# sourceMappingURL=niceNewsFilter.js.map