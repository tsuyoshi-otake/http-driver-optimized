"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveRetryConfig = resolveRetryConfig;
exports.withRetry = withRetry;
const DEFAULT_RETRY_ON = [408, 429, 500, 502, 503, 504];
function resolveRetryConfig(global, perService) {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    const merged = {
        maxAttempts: (_b = (_a = perService === null || perService === void 0 ? void 0 : perService.maxAttempts) !== null && _a !== void 0 ? _a : global === null || global === void 0 ? void 0 : global.maxAttempts) !== null && _b !== void 0 ? _b : 0,
        delay: (_d = (_c = perService === null || perService === void 0 ? void 0 : perService.delay) !== null && _c !== void 0 ? _c : global === null || global === void 0 ? void 0 : global.delay) !== null && _d !== void 0 ? _d : 1000,
        backoff: (_f = (_e = perService === null || perService === void 0 ? void 0 : perService.backoff) !== null && _e !== void 0 ? _e : global === null || global === void 0 ? void 0 : global.backoff) !== null && _f !== void 0 ? _f : "fixed",
        retryOn: (_h = (_g = perService === null || perService === void 0 ? void 0 : perService.retryOn) !== null && _g !== void 0 ? _g : global === null || global === void 0 ? void 0 : global.retryOn) !== null && _h !== void 0 ? _h : DEFAULT_RETRY_ON,
    };
    return merged;
}
async function withRetry(config, fn) {
    var _a, _b, _c, _d;
    const maxAttempts = (_a = config.maxAttempts) !== null && _a !== void 0 ? _a : 0;
    if (maxAttempts <= 0)
        return fn();
    let lastResult;
    const retryOn = (_b = config.retryOn) !== null && _b !== void 0 ? _b : DEFAULT_RETRY_ON;
    for (let attempt = 0; attempt <= maxAttempts; attempt++) {
        lastResult = await fn();
        if (lastResult.ok || !retryOn.includes(lastResult.status)) {
            return lastResult;
        }
        if (attempt < maxAttempts) {
            const delay = config.backoff === "exponential"
                ? ((_c = config.delay) !== null && _c !== void 0 ? _c : 1000) * Math.pow(2, attempt)
                : ((_d = config.delay) !== null && _d !== void 0 ? _d : 1000);
            await sleep(delay);
        }
    }
    return lastResult;
}
function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
