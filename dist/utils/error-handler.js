"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeError = normalizeError;
exports.handleErrorResponse = handleErrorResponse;
exports.isMalformedResponse = isMalformedResponse;
exports.isEmptyResponse = isEmptyResponse;
const errors_1 = require("../types/errors");
function normalizeError(error) {
    const baseError = {
        ok: false,
        duration: 0,
        headers: null,
        data: null
    };
    if (error instanceof errors_1.HTTPError) {
        return Object.assign(Object.assign({}, baseError), { status: error.status || 500, problem: error.message, originalError: error.message, data: error.data || null });
    }
    if (error instanceof Error) {
        return Object.assign(Object.assign({}, baseError), { status: 500, problem: error.message, originalError: error.message });
    }
    return Object.assign(Object.assign({}, baseError), { status: 500, problem: 'An unknown error occurred', originalError: String(error) });
}
function handleErrorResponse(error) {
    return normalizeError(error);
}
function isMalformedResponse(response) {
    if (!response)
        return true;
    if (typeof response === 'string') {
        try {
            JSON.parse(response);
            return false;
        }
        catch (_a) {
            return true;
        }
    }
    return false;
}
function isEmptyResponse(response) {
    return response === '' || response === null || response === undefined;
}
