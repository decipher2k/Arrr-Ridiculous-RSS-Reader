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
exports.getTranslation = getTranslation;
exports.saveTranslation = saveTranslation;
exports.deleteTranslation = deleteTranslation;
exports.getTranslationsForArticles = getTranslationsForArticles;
exports.deleteTranslationsForArticles = deleteTranslationsForArticles;
const index_1 = require("./index");
function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = (0, index_1.getDatabase)();
        db.run(sql, params, function (err) {
            if (err)
                reject(err);
            else
                resolve(this);
        });
    });
}
function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = (0, index_1.getDatabase)();
        db.get(sql, params, (err, row) => {
            if (err)
                reject(err);
            else
                resolve(row);
        });
    });
}
function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        const db = (0, index_1.getDatabase)();
        db.all(sql, params, (err, rows) => {
            if (err)
                reject(err);
            else
                resolve(rows);
        });
    });
}
async function getTranslation(articleId, targetLanguage) {
    return get('SELECT * FROM article_translations WHERE articleId = ? AND targetLanguage = ?', [articleId, targetLanguage]);
}
async function saveTranslation(translation) {
    await run(`INSERT INTO article_translations (articleId, targetLanguage, translatedTitle, translatedDescription, translatedHtml, wordCount, createdAt)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(articleId, targetLanguage) DO UPDATE SET
       translatedTitle = excluded.translatedTitle,
       translatedDescription = excluded.translatedDescription,
       translatedHtml = excluded.translatedHtml,
       wordCount = excluded.wordCount,
       createdAt = excluded.createdAt`, [
        translation.articleId,
        translation.targetLanguage,
        translation.translatedTitle,
        translation.translatedDescription,
        translation.translatedHtml,
        translation.wordCount,
        translation.createdAt,
    ]);
}
async function deleteTranslation(articleId, targetLanguage) {
    await run('DELETE FROM article_translations WHERE articleId = ? AND targetLanguage = ?', [
        articleId,
        targetLanguage,
    ]);
}
async function getTranslationsForArticles(articleIds, targetLanguage) {
    if (articleIds.length === 0)
        return [];
    const placeholders = articleIds.map(() => '?').join(',');
    return all(`SELECT * FROM article_translations WHERE articleId IN (${placeholders}) AND targetLanguage = ?`, [...articleIds, targetLanguage]);
}
async function deleteTranslationsForArticles(articleIds) {
    if (articleIds.length === 0)
        return;
    const placeholders = articleIds.map(() => '?').join(',');
    await run(`DELETE FROM article_translations WHERE articleId IN (${placeholders})`, articleIds);
}
//# sourceMappingURL=translations.js.map