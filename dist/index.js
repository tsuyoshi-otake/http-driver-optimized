"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __await = (this && this.__await) || function (v) { return this instanceof __await ? (this.v = v, this) : new __await(v); }
var __asyncGenerator = (this && this.__asyncGenerator) || function (thisArg, _arguments, generator) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var g = generator.apply(thisArg, _arguments || []), i, q = [];
    return i = Object.create((typeof AsyncIterator === "function" ? AsyncIterator : Object).prototype), verb("next"), verb("throw"), verb("return", awaitReturn), i[Symbol.asyncIterator] = function () { return this; }, i;
    function awaitReturn(f) { return function (v) { return Promise.resolve(v).then(f, reject); }; }
    function verb(n, f) { if (g[n]) { i[n] = function (v) { return new Promise(function (a, b) { q.push([n, v, a, b]) > 1 || resume(n, v); }); }; if (f) i[n] = f(i[n]); } }
    function resume(n, v) { try { step(g[n](v)); } catch (e) { settle(q[0][3], e); } }
    function step(r) { r.value instanceof __await ? Promise.resolve(r.value.v).then(fulfill, reject) : settle(q[0][2], r); }
    function fulfill(value) { resume("next", value); }
    function reject(value) { resume("throw", value); }
    function settle(f, v) { if (f(v), q.shift(), q.length) resume(q[0][0], q[0][1]); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DriverBuilder = exports.createWebSocketClient = exports.createUploadProgressBody = exports.fetchWithDownloadProgress = exports.parseNDJSONStream = exports.createGraphQLClient = exports.MethodAPI = void 0;
const axios_1 = __importDefault(require("axios"));
const qs = __importStar(require("qs"));
const driver_1 = require("./types/driver");
const errors_1 = require("./types/errors");
const cache_1 = require("./utils/cache");
const dedup_1 = require("./utils/dedup");
const error_handler_1 = require("./utils/error-handler");
const middleware_1 = require("./utils/middleware");
const response_parser_1 = require("./utils/response-parser");
const sse_parser_1 = require("./utils/sse-parser");
const ndjson_parser_1 = require("./utils/ndjson-parser");
const retry_1 = require("./utils/retry");
const index_1 = require("./utils/index");
var driver_2 = require("./types/driver");
Object.defineProperty(exports, "MethodAPI", { enumerable: true, get: function () { return driver_2.MethodAPI; } });
// Re-export utilities for standalone usage
var graphql_1 = require("./utils/graphql");
Object.defineProperty(exports, "createGraphQLClient", { enumerable: true, get: function () { return graphql_1.createGraphQLClient; } });
var ndjson_parser_2 = require("./utils/ndjson-parser");
Object.defineProperty(exports, "parseNDJSONStream", { enumerable: true, get: function () { return ndjson_parser_2.parseNDJSONStream; } });
var progress_1 = require("./utils/progress");
Object.defineProperty(exports, "fetchWithDownloadProgress", { enumerable: true, get: function () { return progress_1.fetchWithDownloadProgress; } });
Object.defineProperty(exports, "createUploadProgressBody", { enumerable: true, get: function () { return progress_1.createUploadProgressBody; } });
var websocket_1 = require("./utils/websocket");
Object.defineProperty(exports, "createWebSocketClient", { enumerable: true, get: function () { return websocket_1.createWebSocketClient; } });
const BODYLESS_METHODS = new Set(["get", "delete", "head"]);
/* istanbul ignore next -- defensive: only used when abortController is in options */
function applyAbortControllerSignal(opts) {
    if (!opts.signal && opts.abortController) {
        opts.signal = opts.abortController.signal;
    }
}
class Driver {
    constructor(config) {
        var _a;
        this.config = config;
        this.cache = new cache_1.ResponseCache(config.cache);
        this.dedup = new dedup_1.RequestDedup();
        this.axiosInstance = axios_1.default.create({
            withCredentials: (_a = config.withCredentials) !== null && _a !== void 0 ? _a : true,
            baseURL: config.baseURL,
        });
        const isRefreshing = { value: false };
        const failedQueue = [];
        const processQueue = (error, token = null) => {
            const queue = failedQueue.splice(0);
            for (const prom of queue) {
                if (error)
                    prom.reject(error);
                else
                    prom.resolve(token);
            }
        };
        const addToQueue = (resolve, reject) => {
            failedQueue.push({ resolve, reject });
        };
        const defaultInterceptorError = () => async (error) => Promise.reject(error);
        this.axiosInstance.interceptors.response.use((response) => response, this.config.handleInterceptorErrorAxios
            ? this.config.handleInterceptorErrorAxios(this.axiosInstance, processQueue, isRefreshing, addToQueue)
            : defaultInterceptorError());
        this.axiosInstance.interceptors.request.use(async (request) => {
            if (this.config.addRequestTransformAxios) {
                try {
                    this.config.addRequestTransformAxios(request);
                }
                catch (e) {
                    throw e;
                }
            }
            if (this.config.addAsyncRequestTransform) {
                const transforms = [];
                const registrar = (transform) => { transforms.push(transform); };
                try {
                    this.config.addAsyncRequestTransform(registrar);
                    for (const t of transforms) {
                        await t(request);
                    }
                }
                catch (e) {
                    throw e;
                }
            }
            return request;
        }, 
        /* istanbul ignore next */
        (error) => Promise.reject(error));
        this.axiosInstance.interceptors.response.use(async (response) => {
            if (this.config.addTransformResponseAxios) {
                const apiResponseLike = Driver.mapAxiosToApiResponseLike(response);
                try {
                    this.config.addTransformResponseAxios(apiResponseLike);
                }
                catch ( /* swallow */_a) { /* swallow */ }
            }
            if (this.config.addAsyncResponseTransform) {
                const transforms = [];
                const registrar = (transform) => { transforms.push(transform); };
                try {
                    this.config.addAsyncResponseTransform(registrar);
                    for (const t of transforms) {
                        await t(response);
                    }
                }
                catch ( /* ignore */_b) { /* ignore */ }
            }
            return response;
        }, 
        /* istanbul ignore next */
        (error) => Promise.reject(error));
        return this;
    }
    emitRequest(serviceId, url, method) {
        var _a, _b;
        (_b = (_a = this.config).onRequest) === null || _b === void 0 ? void 0 : _b.call(_a, { url, method, serviceId, timestamp: Date.now() });
    }
    emitResponse(serviceId, url, method, status, duration, ok) {
        var _a, _b;
        (_b = (_a = this.config).onResponse) === null || _b === void 0 ? void 0 : _b.call(_a, { url, method, serviceId, status, duration, ok });
    }
    applyTimeout(options, serviceTimeout) {
        const timeout = serviceTimeout !== null && serviceTimeout !== void 0 ? serviceTimeout : this.config.timeout;
        if (timeout && !options.signal) {
            // Use AbortSignal.timeout when available (Node 17.3+, modern browsers)
            // It automatically cleans up the internal timer when the signal is GC'd
            if (typeof AbortSignal.timeout === 'function') {
                return Object.assign(Object.assign({}, options), { signal: AbortSignal.timeout(timeout) });
            }
            // Fallback: manual AbortController + setTimeout
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeout);
            // Prevent timer from keeping Node.js process alive
            if (timer && typeof timer === 'object' && 'unref' in timer) {
                timer.unref();
            }
            return Object.assign(Object.assign({}, options), { signal: controller.signal });
        }
        return options;
    }
    appendExecService() {
        const httpDriver = Object.assign(this.axiosInstance, {
            execService: async (idService, payload, options) => {
                const apiInfo = (0, index_1.compileUrlByService)(this.config, idService, payload, options);
                if (apiInfo == null) {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new Error(`Service ${idService.id} in driver not found`)));
                }
                const serviceInfo = (0, index_1.compileService)(idService, this.config.services);
                /* istanbul ignore next */
                if (!serviceInfo) {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new Error(`Service ${idService.id} in driver not found`)));
                }
                const retryConfig = (0, retry_1.resolveRetryConfig)(this.config.retry, serviceInfo.retry);
                // Middleware context
                const ctx = {
                    url: apiInfo.url, method: apiInfo.method, serviceId: String(idService.id),
                    payload, options,
                };
                // Cache check
                const cacheKey = this.cache.buildKey(apiInfo.method, apiInfo.url, payload);
                if (this.cache.shouldCache(apiInfo.method)) {
                    const cached = this.cache.get(cacheKey);
                    if (cached)
                        return cached;
                }
                // Dedup for bodyless methods (GET, HEAD, DELETE)
                const isBodyless = BODYLESS_METHODS.has(apiInfo.method);
                const dedupKey = isBodyless ? this.dedup.buildKey(apiInfo.method, apiInfo.url, payload) : "";
                const execute = async () => {
                    return (0, retry_1.withRetry)(retryConfig, async () => {
                        var _a;
                        let result;
                        const core = async () => {
                            result = await this.executeAxiosCall(apiInfo, idService);
                        };
                        if ((_a = this.config.middleware) === null || _a === void 0 ? void 0 : _a.length) {
                            await (0, middleware_1.executeMiddleware)(this.config.middleware, ctx, core);
                            if (result)
                                ctx.response = result;
                        }
                        else {
                            await core();
                        }
                        return result;
                    });
                };
                try {
                    this.emitRequest(String(idService.id), apiInfo.url, apiInfo.method);
                    const result = isBodyless && dedupKey
                        ? await this.dedup.execute(dedupKey, execute)
                        : await execute();
                    this.emitResponse(String(idService.id), apiInfo.url, apiInfo.method, result.status, result.duration, result.ok);
                    if (result.ok && this.cache.shouldCache(apiInfo.method)) {
                        this.cache.set(cacheKey, result);
                    }
                    return result;
                }
                catch (error) {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(error));
                }
            },
            execServiceByFetch: async (idService, payload, options) => {
                const apiInfo = (0, index_1.compileUrlByService)(this.config, idService, payload !== null && payload !== void 0 ? payload : undefined, options);
                if (apiInfo == null) {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new Error(`Service ${idService.id} in driver not found`)));
                }
                const serviceInfo = (0, index_1.compileService)(idService, this.config.services);
                /* istanbul ignore next */
                if (!serviceInfo) {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new Error(`Service ${idService.id} in driver not found`)));
                }
                const retryConfig = (0, retry_1.resolveRetryConfig)(this.config.retry, serviceInfo.retry);
                const ctx = {
                    url: apiInfo.url, method: apiInfo.method, serviceId: String(idService.id),
                    payload: payload !== null && payload !== void 0 ? payload : undefined, options,
                };
                const cacheKey = this.cache.buildKey(apiInfo.method, apiInfo.url, payload !== null && payload !== void 0 ? payload : undefined);
                if (this.cache.shouldCache(apiInfo.method)) {
                    const cached = this.cache.get(cacheKey);
                    if (cached)
                        return cached;
                }
                const isBodyless = BODYLESS_METHODS.has(apiInfo.method);
                const dedupKey = isBodyless ? this.dedup.buildKey(apiInfo.method, apiInfo.url, payload !== null && payload !== void 0 ? payload : undefined) : "";
                const execute = async () => {
                    return (0, retry_1.withRetry)(retryConfig, async () => {
                        var _a;
                        let result;
                        const core = async () => {
                            result = await this.executeFetchCall(apiInfo, idService, options);
                        };
                        if ((_a = this.config.middleware) === null || _a === void 0 ? void 0 : _a.length) {
                            await (0, middleware_1.executeMiddleware)(this.config.middleware, ctx, core);
                            if (result)
                                ctx.response = result;
                        }
                        else {
                            await core();
                        }
                        return result;
                    });
                };
                try {
                    this.emitRequest(String(idService.id), apiInfo.url, apiInfo.method);
                    const result = isBodyless && dedupKey
                        ? await this.dedup.execute(dedupKey, execute)
                        : await execute();
                    this.emitResponse(String(idService.id), apiInfo.url, apiInfo.method, result.status, result.duration, result.ok);
                    if (result.ok && this.cache.shouldCache(apiInfo.method)) {
                        this.cache.set(cacheKey, result);
                    }
                    return result;
                }
                catch (error) {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(error));
                }
            },
            execServiceByStream: async (idService, payload, options) => {
                var _a;
                const apiInfo = (0, index_1.compileUrlByService)(this.config, idService, payload !== null && payload !== void 0 ? payload : undefined, options);
                if (apiInfo == null) {
                    const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                    return { ok: false, status: 500, headers: null, problem: `Service ${idService.id} in driver not found`, stream: emptyStream, abort: () => { } };
                }
                let url = apiInfo.url;
                let requestOptions = Object.assign({}, apiInfo.options);
                const serviceInfo = (0, index_1.compileService)(idService, this.config.services);
                requestOptions = this.applyTimeout(requestOptions, serviceInfo.timeout);
                applyAbortControllerSignal(requestOptions);
                // SSE typically uses Accept: text/event-stream
                if (!((_a = requestOptions.headers) === null || _a === void 0 ? void 0 : _a.hasOwnProperty("Accept"))) {
                    requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { "Accept": "text/event-stream" });
                }
                if (!requestOptions.headers.hasOwnProperty("Content-Type") && apiInfo.method !== "get") {
                    requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { "Content-Type": "application/json" });
                }
                const methodUpper = apiInfo.method.toUpperCase();
                if (methodUpper !== "GET") {
                    requestOptions = Object.assign(Object.assign({}, requestOptions), { method: methodUpper, body: JSON.stringify(apiInfo.payload) });
                }
                if (this.config.addRequestTransformFetch) {
                    ({ url, requestOptions } = this.config.addRequestTransformFetch(url, requestOptions));
                }
                // Create an AbortController for manual abort
                const abortController = new AbortController();
                if (requestOptions.signal) {
                    const existingSignal = requestOptions.signal;
                    existingSignal.addEventListener("abort", () => abortController.abort(), { once: true });
                }
                requestOptions.signal = abortController.signal;
                try {
                    this.emitRequest(String(idService.id), url, apiInfo.method);
                    const res = await fetch(url, requestOptions);
                    if (!res.ok) {
                        this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
                        const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                        return {
                            ok: false, status: res.status, headers: res.headers,
                            problem: res.statusText || "Request failed",
                            stream: emptyStream, abort: () => abortController.abort(),
                        };
                    }
                    if (!res.body) {
                        this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
                        const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                        return {
                            ok: false, status: res.status, headers: res.headers,
                            problem: "No readable stream in response",
                            stream: emptyStream, abort: () => abortController.abort(),
                        };
                    }
                    this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, true);
                    const stream = (0, sse_parser_1.parseSSEStream)(res.body, abortController.signal);
                    return {
                        ok: true, status: res.status, headers: res.headers, problem: null,
                        stream, abort: () => abortController.abort(),
                    };
                }
                catch (error) {
                    const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                    const problem = error instanceof Error ? error.message : String(error);
                    return { ok: false, status: 0, headers: null, problem, stream: emptyStream, abort: () => abortController.abort() };
                }
            },
            execServiceByNDJSON: async (idService, payload, options) => {
                var _a;
                const apiInfo = (0, index_1.compileUrlByService)(this.config, idService, payload !== null && payload !== void 0 ? payload : undefined, options);
                if (apiInfo == null) {
                    const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                    return { ok: false, status: 500, headers: null, problem: `Service ${idService.id} in driver not found`, stream: emptyStream, abort: () => { } };
                }
                let url = apiInfo.url;
                let requestOptions = Object.assign({}, apiInfo.options);
                const serviceInfo = (0, index_1.compileService)(idService, this.config.services);
                requestOptions = this.applyTimeout(requestOptions, serviceInfo.timeout);
                applyAbortControllerSignal(requestOptions);
                if (!((_a = requestOptions.headers) === null || _a === void 0 ? void 0 : _a.hasOwnProperty("Accept"))) {
                    requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { "Accept": "application/x-ndjson" });
                }
                if (!requestOptions.headers.hasOwnProperty("Content-Type") && apiInfo.method !== "get") {
                    requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { "Content-Type": "application/json" });
                }
                const methodUpper = apiInfo.method.toUpperCase();
                if (methodUpper !== "GET") {
                    requestOptions = Object.assign(Object.assign({}, requestOptions), { method: methodUpper, body: JSON.stringify(apiInfo.payload) });
                }
                if (this.config.addRequestTransformFetch) {
                    ({ url, requestOptions } = this.config.addRequestTransformFetch(url, requestOptions));
                }
                const abortController = new AbortController();
                if (requestOptions.signal) {
                    const existingSignal = requestOptions.signal;
                    existingSignal.addEventListener("abort", () => abortController.abort(), { once: true });
                }
                requestOptions.signal = abortController.signal;
                try {
                    this.emitRequest(String(idService.id), url, apiInfo.method);
                    const res = await fetch(url, requestOptions);
                    if (!res.ok) {
                        this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
                        const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                        return { ok: false, status: res.status, headers: res.headers, problem: res.statusText || "Request failed", stream: emptyStream, abort: () => abortController.abort() };
                    }
                    if (!res.body) {
                        this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
                        const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                        return { ok: false, status: res.status, headers: res.headers, problem: "No readable stream in response", stream: emptyStream, abort: () => abortController.abort() };
                    }
                    this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, true);
                    const stream = (0, ndjson_parser_1.parseNDJSONStream)(res.body, abortController.signal);
                    return { ok: true, status: res.status, headers: res.headers, problem: null, stream, abort: () => abortController.abort() };
                }
                catch (error) {
                    const emptyStream = (function () { return __asyncGenerator(this, arguments, function* () { }); })();
                    const problem = error instanceof Error ? error.message : String(error);
                    return { ok: false, status: 0, headers: null, problem, stream: emptyStream, abort: () => abortController.abort() };
                }
            },
            getInfoURL: (idService, payload = {}) => {
                var _a;
                const apiInfo = (0, index_1.compileService)(idService, this.config.services);
                if (apiInfo != null) {
                    let fullUrl;
                    if ((_a = this.config.versionConfig) === null || _a === void 0 ? void 0 : _a.enabled) {
                        const vCfg = this.config.versionConfig;
                        const version = apiInfo.version || vCfg.defaultVersion;
                        fullUrl = (0, index_1.buildUrlWithVersion)(this.config.baseURL, apiInfo.url, version, vCfg);
                    }
                    else {
                        fullUrl = (0, index_1.joinUrl)(this.config.baseURL, apiInfo.url);
                    }
                    if (payload && Object.keys(payload).length > 0 && apiInfo.method === driver_1.MethodAPI.get) {
                        const queryString = qs.stringify(payload);
                        const separator = fullUrl.includes('?') ? '&' : '?';
                        return { fullUrl: fullUrl + separator + queryString, pathname: apiInfo.url + "?" + queryString, method: apiInfo.method, payload: null };
                    }
                    return { fullUrl, pathname: apiInfo.url, method: apiInfo.method, payload };
                }
                return { fullUrl: null, pathname: null, method: null, payload: null };
            },
        });
        return httpDriver;
    }
    async executeAxiosCall(apiInfo, idService) {
        var _a, _b, _c, _d;
        try {
            const payloadConvert = apiInfo.payload;
            const optHeaders = apiInfo.options.headers;
            if (optHeaders && typeof optHeaders === "object" && optHeaders.hasOwnProperty("Content-Type")) {
                const contentType = optHeaders["Content-Type"];
                if (typeof contentType === "string" && contentType.toLowerCase() === "multipart/form-data") {
                    // axios handles multipart boundaries automatically
                }
            }
            const axiosServiceInfo = (0, index_1.compileService)(idService, this.config.services);
            let opts = this.applyTimeout(apiInfo.options, axiosServiceInfo.timeout);
            applyAbortControllerSignal(opts);
            const start = performance.now();
            const axiosCall = (_a = this.axiosInstance[apiInfo.method]) === null || _a === void 0 ? void 0 : _a.bind(this.axiosInstance);
            let rawResult;
            if (axiosCall) {
                if (BODYLESS_METHODS.has(apiInfo.method)) {
                    rawResult = await axiosCall(apiInfo.pathname, opts);
                }
                else {
                    rawResult = await axiosCall(apiInfo.pathname, payloadConvert, opts);
                }
            }
            else {
                rawResult = await this.axiosInstance.request(Object.assign({ method: apiInfo.method, url: apiInfo.pathname, data: payloadConvert }, opts));
            }
            const duration = Math.round((performance.now() - start) * 100) / 100;
            if (!rawResult) {
                return (0, index_1.responseFormat)({ ok: false, status: 500, headers: null, duration, data: null,
                    problem: "No response from service call", originalError: "No response from service call" });
            }
            if (typeof rawResult.ok === "boolean" && typeof rawResult.status === "number") {
                return rawResult;
            }
            return Driver.axiosResponseToResponseFormat(rawResult, duration);
        }
        catch (error) {
            if (error.isAxiosError) {
                const axErr = error;
                const axCode = String(axErr.code || "");
                const axName = String(axErr.name || "");
                if (axCode === "ERR_CANCELED" || axName === "CanceledError") {
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.TimeoutError()));
                }
                const axResponse = axErr.response;
                return (0, index_1.responseFormat)({ ok: false, status: (_b = axResponse === null || axResponse === void 0 ? void 0 : axResponse.status) !== null && _b !== void 0 ? _b : 0,
                    headers: Driver.normalizeAxiosHeaders((_c = axResponse === null || axResponse === void 0 ? void 0 : axResponse.headers) !== null && _c !== void 0 ? _c : null),
                    duration: 0, data: ((_d = axResponse === null || axResponse === void 0 ? void 0 : axResponse.data) !== null && _d !== void 0 ? _d : null),
                    problem: Driver.mapAxiosErrorToProblem(axErr), originalError: axErr.message, });
            }
            if (error instanceof Error) {
                const lower = error.message.toLowerCase();
                if (lower.includes("timeout"))
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.TimeoutError()));
                if (lower.includes("network"))
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.NetworkError()));
            }
            return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(error));
        }
    }
    async executeFetchCall(apiInfo, idService, options) {
        var _a;
        try {
            let url = apiInfo.url;
            let requestOptions = Object.assign({}, apiInfo.options);
            const fetchServiceInfo = (0, index_1.compileService)(idService, this.config.services);
            requestOptions = this.applyTimeout(requestOptions, fetchServiceInfo.timeout);
            applyAbortControllerSignal(requestOptions);
            if (!((_a = requestOptions.headers) === null || _a === void 0 ? void 0 : _a.hasOwnProperty("Content-Type"))) {
                requestOptions.headers = Object.assign(Object.assign({}, requestOptions.headers), { "Content-Type": "application/json" });
            }
            const methodUpper = apiInfo.method.toUpperCase();
            if (methodUpper !== "GET") {
                const ct = requestOptions.headers["Content-Type"];
                requestOptions = Object.assign(Object.assign({}, requestOptions), { method: methodUpper, body: (0, index_1.compileBodyFetchWithContentType)(ct.toLowerCase(), apiInfo.payload) });
                if (ct.toLowerCase() === "multipart/form-data")
                    delete requestOptions["headers"];
            }
            if (this.config.addRequestTransformFetch) {
                ({ url, requestOptions } = this.config.addRequestTransformFetch(url, requestOptions));
            }
            const startFetchTime = performance.now();
            const res = await fetch(url, requestOptions);
            const duration = Math.round((performance.now() - startFetchTime) * 100) / 100;
            let data;
            try {
                data = await (0, response_parser_1.parseFetchResponse)(res, options === null || options === void 0 ? void 0 : options.responseType);
            }
            catch (err) {
                if (err instanceof errors_1.MalformedResponseError)
                    throw err;
                throw new errors_1.MalformedResponseError("Failed to parse response");
            }
            const response = (0, index_1.responseFormat)({
                ok: res.ok, duration, status: res.status, headers: res.headers, data: data,
                problem: !res.ok ? res.statusText : null, originalError: !res.ok ? res.statusText : null,
            });
            return this.config.addTransformResponseFetch
                ? this.config.addTransformResponseFetch(response)
                : response;
        }
        catch (error) {
            if (error instanceof errors_1.MalformedResponseError) {
                return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(error));
            }
            if (error instanceof Error) {
                const lower = error.message.toLowerCase();
                if (error.name === "AbortError" || lower.includes("aborted") || lower.includes("canceled"))
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.TimeoutError()));
                if (lower.includes('timeout'))
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.TimeoutError()));
                if (lower.includes('network'))
                    return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.NetworkError()));
            }
            if (typeof error === "object" && error !== null && error.name === "AbortError")
                return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(new errors_1.TimeoutError()));
            return (0, index_1.responseFormat)((0, error_handler_1.handleErrorResponse)(error));
        }
    }
    static axiosResponseToResponseFormat(res, duration) {
        return (0, index_1.responseFormat)({ ok: res.status >= 200 && res.status <= 299, status: res.status, data: res.data,
            headers: Driver.normalizeAxiosHeaders(res.headers), duration,
            problem: res.status >= 400 ? res.statusText : null, originalError: null });
    }
    static normalizeAxiosHeaders(headers) {
        if (!headers || typeof headers !== "object")
            return null;
        const raw = typeof headers.toJSON === "function"
            ? headers.toJSON() : headers;
        const norm = {};
        for (const [k, v] of Object.entries(raw)) {
            if (typeof v === "string")
                norm[k.toLowerCase()] = v;
            else if (Array.isArray(v))
                norm[k.toLowerCase()] = v.join(", ");
        }
        return norm;
    }
    static mapAxiosToApiResponseLike(res) {
        const ok = res.status >= 200 && res.status <= 299;
        return { ok, problem: ok ? null : res.statusText, originalError: null,
            data: res.data, status: res.status, headers: res.headers, config: res.config, duration: 0 };
    }
    static mapAxiosErrorToProblem(error) {
        var _a;
        const code = ((_a = error.code) !== null && _a !== void 0 ? _a : "").toUpperCase();
        if (code.includes("ECONNABORTED") || code.includes("ETIMEDOUT"))
            return "TIMEOUT_ERROR";
        if (!error.response)
            return "NETWORK_ERROR";
        const status = error.response.status;
        if (status >= 500)
            return "SERVER_ERROR";
        if (status >= 400)
            return "CLIENT_ERROR";
        return "UNKNOWN_ERROR";
    }
}
class DriverBuilder {
    constructor() {
        this.config = { baseURL: "", services: [] };
    }
    withBaseURL(baseURL) { this.config.baseURL = baseURL; return this; }
    withServices(services) { this.config.services = services; return this; }
    // Version
    withVersionConfig(versionConfig) {
        this.config.versionConfig = Object.assign(Object.assign({}, versionConfig), { enabled: versionConfig.enabled !== undefined ? versionConfig.enabled : true });
        return this;
    }
    withGlobalVersion(version) {
        if (!this.config.versionConfig)
            this.config.versionConfig = {};
        this.config.versionConfig.defaultVersion = version;
        return this;
    }
    withVersionTemplate(template) {
        if (!this.config.versionConfig)
            this.config.versionConfig = {};
        this.config.versionConfig.template = template;
        this.config.versionConfig.position = 'custom';
        this.config.versionConfig.enabled = true;
        return this;
    }
    enableVersioning(enabled = true) {
        if (!this.config.versionConfig)
            this.config.versionConfig = {};
        this.config.versionConfig.enabled = enabled;
        return this;
    }
    // Retry, Cache, Timeout
    withRetry(config) { this.config.retry = config; return this; }
    withCache(config) { this.config.cache = config; return this; }
    withTimeout(ms) { this.config.timeout = ms; return this; }
    // Middleware
    use(middleware) {
        if (!this.config.middleware)
            this.config.middleware = [];
        this.config.middleware.push(middleware);
        return this;
    }
    // Observability
    onRequest(hook) { this.config.onRequest = hook; return this; }
    onResponse(hook) { this.config.onResponse = hook; return this; }
    // Axios transforms
    withAddAsyncRequestTransformAxios(callback) { this.config.addAsyncRequestTransform = callback; return this; }
    withAddAsyncResponseTransformAxios(callback) { this.config.addAsyncResponseTransform = callback; return this; }
    withAddRequestTransformAxios(callback) { this.config.addRequestTransformAxios = callback; return this; }
    withAddResponseTransformAxios(callback) { this.config.addTransformResponseAxios = callback; return this; }
    withHandleInterceptorErrorAxios(callback) { this.config.handleInterceptorErrorAxios = callback; return this; }
    // Fetch transforms
    withAddTransformResponseFetch(callback) { this.config.addTransformResponseFetch = callback; return this; }
    withAddRequestTransformFetch(callback) {
        this.config.addRequestTransformFetch = callback;
        return this;
    }
    build() {
        if (!this.config.baseURL || !this.config.services.length)
            throw new Error("Missing required configuration values");
        const driver = new Driver(this.config);
        return driver.appendExecService();
    }
}
exports.DriverBuilder = DriverBuilder;
