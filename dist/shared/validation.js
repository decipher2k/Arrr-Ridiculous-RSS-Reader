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
exports.isValidUrl = isValidUrl;
exports.sanitizeString = sanitizeString;
exports.isNonEmptyString = isNonEmptyString;
exports.clampNumber = clampNumber;
function isValidUrl(input) {
    try {
        const url = new URL(input);
        return url.protocol === 'http:' || url.protocol === 'https:';
    }
    catch {
        return false;
    }
}
function sanitizeString(input, maxLength = 1000) {
    return input.trim().slice(0, maxLength).replace(/[\x00-\x1F\x7F]/g, '');
}
function isNonEmptyString(input) {
    return typeof input === 'string' && input.trim().length > 0;
}
function clampNumber(value, min, max) {
    return Math.max(min, Math.min(max, value));
}
//# sourceMappingURL=validation.js.map