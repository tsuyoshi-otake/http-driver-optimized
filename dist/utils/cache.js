"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseCache = void 0;
class ResponseCache {
    constructor(config) {
        var _a, _b, _c;
        this.store = new Map();
        this.config = {
            enabled: (_a = config === null || config === void 0 ? void 0 : config.enabled) !== null && _a !== void 0 ? _a : false,
            ttl: (_b = config === null || config === void 0 ? void 0 : config.ttl) !== null && _b !== void 0 ? _b : 30000,
            getOnly: (_c = config === null || config === void 0 ? void 0 : config.getOnly) !== null && _c !== void 0 ? _c : true,
        };
    }
    get enabled() {
        return this.config.enabled;
    }
    buildKey(method, url, payload) {
        const payloadKey = payload && Object.keys(payload).length > 0
            ? JSON.stringify(payload) : "";
        return `${method}:${url}:${payloadKey}`;
    }
    get(key) {
        const entry = this.store.get(key);
        if (!entry)
            return null;
        if (Date.now() > entry.expiry) {
            this.store.delete(key);
            return null;
        }
        return entry.data;
    }
    set(key, data) {
        this.store.set(key, { data, expiry: Date.now() + this.config.ttl });
    }
    shouldCache(method) {
        if (!this.config.enabled)
            return false;
        if (this.config.getOnly && method.toLowerCase() !== "get")
            return false;
        return true;
    }
    clear() {
        this.store.clear();
    }
    size() {
        return this.store.size;
    }
}
exports.ResponseCache = ResponseCache;
