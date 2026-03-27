"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseFetchResponse = parseFetchResponse;
const errors_1 = require("../types/errors");
/**
 * Shared response body parser for both execServiceByFetch and httpClientFetch.
 * Handles blob, arraybuffer, text, JSON, and auto-detection based on content-type.
 */
async function parseFetchResponse(res, responseType) {
    var _a;
    const contentType = ((_a = res.headers.get('content-type')) === null || _a === void 0 ? void 0 : _a.toLowerCase()) || '';
    if (responseType === 'blob')
        return res.blob();
    if (responseType === 'arraybuffer')
        return res.arrayBuffer();
    if (responseType === 'text')
        return res.text();
    // Auto-detect binary types
    if (contentType.startsWith('image/') || contentType.startsWith('application/pdf')) {
        return res.blob();
    }
    if (contentType.startsWith('application/octet-stream') && !responseType) {
        return res.blob();
    }
    // Auto-detect text types
    if (contentType.startsWith('text/') && !contentType.includes('application/json')) {
        return res.text();
    }
    // Default: try JSON, fallback to text
    const resText = await res.text();
    if (!resText)
        throw new errors_1.MalformedResponseError("Malformed response");
    if (contentType.includes('application/json') || !contentType) {
        try {
            return JSON.parse(resText);
        }
        catch (_b) {
            throw new errors_1.MalformedResponseError("Malformed response");
        }
    }
    return resText;
}
