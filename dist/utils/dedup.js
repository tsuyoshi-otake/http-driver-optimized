"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestDedup = void 0;
const request_key_1 = require("./request-key");
/**
 * Request deduplication - prevents duplicate concurrent requests.
 * If a request with the same key is already in-flight, returns the same promise.
 */
class RequestDedup {
    constructor() {
        this.pending = new Map();
    }
    buildKey(method, url, payload) {
        return (0, request_key_1.buildRequestKey)(method, url, payload);
    }
    async execute(key, fn) {
        const existing = this.pending.get(key);
        if (existing)
            return existing;
        const promise = fn().finally(() => {
            this.pending.delete(key);
        });
        this.pending.set(key, promise);
        return promise;
    }
    get pendingCount() {
        return this.pending.size;
    }
}
exports.RequestDedup = RequestDedup;
