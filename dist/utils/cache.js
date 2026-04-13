"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ResponseCache = void 0;
const request_key_1 = require("./request-key");
const DEFAULT_MAX_SIZE = 1000;
class ResponseCache {
    constructor(config) {
        var _a, _b, _c;
        this.store = new Map();
        this.cleanupTimer = null;
        this.config = {
            enabled: (_a = config === null || config === void 0 ? void 0 : config.enabled) !== null && _a !== void 0 ? _a : false,
            ttl: (_b = config === null || config === void 0 ? void 0 : config.ttl) !== null && _b !== void 0 ? _b : 30000,
            getOnly: (_c = config === null || config === void 0 ? void 0 : config.getOnly) !== null && _c !== void 0 ? _c : true,
        };
        this.maxSize = DEFAULT_MAX_SIZE;
        // Periodic cleanup of expired entries every TTL interval
        if (this.config.enabled) {
            this.cleanupTimer = setInterval(() => this.evictExpired(), this.config.ttl);
            // Allow the process to exit even if the timer is still running
            if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
                this.cleanupTimer.unref();
            }
        }
    }
    get enabled() {
        return this.config.enabled;
    }
    buildKey(method, url, payload) {
        return (0, request_key_1.buildRequestKey)(method, url, payload);
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
        // Evict oldest entries if cache is full
        if (this.store.size >= this.maxSize && !this.store.has(key)) {
            const firstKey = this.store.keys().next().value;
            if (firstKey !== undefined)
                this.store.delete(firstKey);
        }
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
    /** Remove all expired entries */
    evictExpired() {
        const now = Date.now();
        for (const [key, entry] of this.store) {
            if (now > entry.expiry) {
                this.store.delete(key);
            }
        }
    }
    /** Stop the periodic cleanup timer */
    destroy() {
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.store.clear();
    }
}
exports.ResponseCache = ResponseCache;
