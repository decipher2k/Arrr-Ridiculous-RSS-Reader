"use strict";
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