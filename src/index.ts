import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";
import * as qs from "qs";
import type {
  ApiResponseLike,
  AsyncRequestTransform,
  AsyncResponseTransform,
  CacheConfig,
  DriverConfig,
  HttpDriverInstance,
  MiddlewareContext,
  MiddlewareFn,
  NDJSONStreamResponseFormat,
  OnRequestHook,
  OnResponseHook,
  ResponseFormat,
  RetryConfig,
  ServiceApi,
  ServiceUrlCompile,
  StreamResponseFormat,
  VersionConfig,
} from "./types/driver";
import { MethodAPI } from "./types/driver";
import { MalformedResponseError, NetworkError, TimeoutError } from "./types/errors";
import { ResponseCache } from "./utils/cache";
import { RequestDedup } from "./utils/dedup";
import { handleErrorResponse } from "./utils/error-handler";
import { executeMiddleware } from "./utils/middleware";
import { parseFetchResponse } from "./utils/response-parser";
import { parseSSEStream } from "./utils/sse-parser";
import { parseNDJSONStream } from "./utils/ndjson-parser";
import { resolveRetryConfig, withRetry } from "./utils/retry";
import {
  buildUrlWithVersion,
  compileBodyFetchWithContentType,
  compileService,
  compileUrlByService,
  joinUrl,
  responseFormat,
} from "./utils/index";

export type {
  CacheConfig, DriverConfig, HttpDriverInstance, MiddlewareContext, MiddlewareFn,
  NDJSONStreamResponseFormat, OnRequestHook, OnResponseHook, ResponseFormat, RetryConfig,
  ServiceApi, ServiceUrlCompile, SSEEvent, StreamResponseFormat, VersionConfig
} from "./types/driver";

export { MethodAPI } from "./types/driver";

// Re-export utilities for standalone usage
export { createGraphQLClient } from "./utils/graphql";
export type { GraphQLRequest, GraphQLResponse } from "./utils/graphql";
export { parseNDJSONStream } from "./utils/ndjson-parser";
export { fetchWithDownloadProgress, createUploadProgressBody } from "./utils/progress";
export type { ProgressInfo, ProgressCallback } from "./utils/progress";
export { createWebSocketClient } from "./utils/websocket";
export type { WebSocketConfig, WebSocketClient, WebSocketMessage, Unsubscribe as WebSocketUnsubscribe } from "./utils/websocket";

const BODYLESS_METHODS = new Set(["get", "delete", "head"]);

/* istanbul ignore next -- defensive: only used when abortController is in options */
function applyAbortControllerSignal(opts: Record<string, any>): void {
  if (!opts.signal && opts.abortController) {
    opts.signal = opts.abortController.signal;
  }
}

class Driver {
  private config: DriverConfig;
  private axiosInstance: AxiosInstance;
  private cache: ResponseCache;
  private dedup: RequestDedup;

  constructor(config: DriverConfig) {
    this.config = config;
    this.cache = new ResponseCache(config.cache);
    this.dedup = new RequestDedup();

    this.axiosInstance = axios.create({
      withCredentials: config.withCredentials ?? true,
      baseURL: config.baseURL,
    });

    const isRefreshing = { value: false };
    const failedQueue: Array<{ resolve: (value: unknown) => void; reject: (reason: unknown) => void }> = [];
    const processQueue = (error: unknown, token: string | null = null) => {
      const queue = failedQueue.splice(0);
      for (const prom of queue) {
        if (error) prom.reject(error);
        else prom.resolve(token);
      }
    };
    const addToQueue = (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
      failedQueue.push({ resolve, reject });
    };
    const defaultInterceptorError = () => async (error: unknown) => Promise.reject(error);

    this.axiosInstance.interceptors.response.use(
      (response) => response,
      this.config.handleInterceptorErrorAxios
        ? this.config.handleInterceptorErrorAxios(this.axiosInstance, processQueue, isRefreshing, addToQueue)
        : defaultInterceptorError()
    );

    this.axiosInstance.interceptors.request.use(
      async (request) => {
        if (this.config.addRequestTransformAxios) {
          try { this.config.addRequestTransformAxios(request as AxiosRequestConfig); }
          catch (e) { throw e; }
        }
        if (this.config.addAsyncRequestTransform) {
          const transforms: Array<(req: AxiosRequestConfig) => Promise<void> | void> = [];
          const registrar = (transform: (req: AxiosRequestConfig) => Promise<void> | void) => { transforms.push(transform); };
          try {
            this.config.addAsyncRequestTransform(registrar as any);
            for (const t of transforms) { await t(request as AxiosRequestConfig); }
          } catch (e) { throw e; }
        }
        return request;
      },
      /* istanbul ignore next */
      (error: unknown) => Promise.reject(error)
    );

    this.axiosInstance.interceptors.response.use(
      async (response) => {
        if (this.config.addTransformResponseAxios) {
          const apiResponseLike = Driver.mapAxiosToApiResponseLike(response);
          try { this.config.addTransformResponseAxios(apiResponseLike); }
          catch { /* swallow */ }
        }
        if (this.config.addAsyncResponseTransform) {
          const transforms: Array<(res: AxiosResponse) => Promise<void> | void> = [];
          const registrar = (transform: (res: AxiosResponse) => Promise<void> | void) => { transforms.push(transform); };
          try {
            this.config.addAsyncResponseTransform(registrar as any);
            for (const t of transforms) { await t(response); }
          } catch { /* ignore */ }
        }
        return response;
      },
      /* istanbul ignore next */
      (error: unknown) => Promise.reject(error)
    );
    return this;
  }

  private emitRequest(serviceId: string, url: string, method: string) {
    this.config.onRequest?.({ url, method, serviceId, timestamp: Date.now() });
  }

  private emitResponse(serviceId: string, url: string, method: string, status: number, duration: number, ok: boolean) {
    this.config.onResponse?.({ url, method, serviceId, status, duration, ok });
  }

  private applyTimeout(options: Record<string, any>, serviceTimeout?: number): Record<string, any> {
    const timeout = serviceTimeout ?? this.config.timeout;
    if (timeout && !options.signal) {
      // Use AbortSignal.timeout when available (Node 17.3+, modern browsers)
      // It automatically cleans up the internal timer when the signal is GC'd
      if (typeof AbortSignal.timeout === 'function') {
        return { ...options, signal: AbortSignal.timeout(timeout) };
      }
      // Fallback: manual AbortController + setTimeout
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeout);
      // Prevent timer from keeping Node.js process alive
      if (timer && typeof timer === 'object' && 'unref' in timer) {
        (timer as NodeJS.Timeout).unref();
      }
      return { ...options, signal: controller.signal };
    }
    return options;
  }

  appendExecService(): HttpDriverInstance & AxiosInstance {
    const httpDriver = Object.assign(this.axiosInstance, {
      execService: async <T = unknown>(
        idService: ServiceUrlCompile,
        payload?: Record<string, unknown>,
        options?: Record<string, unknown>
      ): Promise<ResponseFormat<T>> => {
        const apiInfo = compileUrlByService(this.config, idService, payload, options);
        if (apiInfo == null) {
          return responseFormat(handleErrorResponse(new Error(`Service ${idService.id} in driver not found`))) as ResponseFormat<T>;
        }

        const serviceInfo = compileService(idService, this.config.services);
        /* istanbul ignore next */
        if (!serviceInfo) {
          return responseFormat(handleErrorResponse(new Error(`Service ${idService.id} in driver not found`))) as ResponseFormat<T>;
        }
        const retryConfig = resolveRetryConfig(this.config.retry, serviceInfo.retry);

        // Middleware context
        const ctx: MiddlewareContext = {
          url: apiInfo.url, method: apiInfo.method, serviceId: String(idService.id),
          payload, options,
        };

        // Cache check
        const cacheKey = this.cache.buildKey(apiInfo.method, apiInfo.url, payload);
        if (this.cache.shouldCache(apiInfo.method)) {
          const cached = this.cache.get<T>(cacheKey);
          if (cached) return cached;
        }

        // Dedup for bodyless methods (GET, HEAD, DELETE)
        const isBodyless = BODYLESS_METHODS.has(apiInfo.method);
        const dedupKey = isBodyless ? this.dedup.buildKey(apiInfo.method, apiInfo.url, payload) : "";

        const execute = async (): Promise<ResponseFormat<T>> => {
          return withRetry(retryConfig, async () => {
            let result: ResponseFormat<T> | undefined;

            const core = async () => {
              result = await this.executeAxiosCall<T>(apiInfo, idService);
            };

            if (this.config.middleware?.length) {
              await executeMiddleware(this.config.middleware, ctx, core);
              if (result) ctx.response = result;
            } else {
              await core();
            }

            return result!;
          });
        };

        try {
          this.emitRequest(String(idService.id), apiInfo.url, apiInfo.method);
          const result = isBodyless && dedupKey
            ? await this.dedup.execute<T>(dedupKey, execute)
            : await execute();

          this.emitResponse(String(idService.id), apiInfo.url, apiInfo.method, result.status, result.duration, result.ok);

          if (result.ok && this.cache.shouldCache(apiInfo.method)) {
            this.cache.set(cacheKey, result as ResponseFormat);
          }
          return result;
        } catch (error) {
          return responseFormat(handleErrorResponse(error)) as ResponseFormat<T>;
        }
      },

      execServiceByFetch: async <T = unknown>(
        idService: ServiceUrlCompile,
        payload?: Record<string, unknown> | null,
        options?: Record<string, unknown>
      ): Promise<ResponseFormat<T>> => {
        const apiInfo = compileUrlByService(this.config, idService, payload ?? undefined, options);
        if (apiInfo == null) {
          return responseFormat(handleErrorResponse(new Error(`Service ${idService.id} in driver not found`))) as ResponseFormat<T>;
        }

        const serviceInfo = compileService(idService, this.config.services);
        /* istanbul ignore next */
        if (!serviceInfo) {
          return responseFormat(handleErrorResponse(new Error(`Service ${idService.id} in driver not found`))) as ResponseFormat<T>;
        }
        const retryConfig = resolveRetryConfig(this.config.retry, serviceInfo.retry);

        const ctx: MiddlewareContext = {
          url: apiInfo.url, method: apiInfo.method, serviceId: String(idService.id),
          payload: payload ?? undefined, options,
        };

        const cacheKey = this.cache.buildKey(apiInfo.method, apiInfo.url, payload ?? undefined);
        if (this.cache.shouldCache(apiInfo.method)) {
          const cached = this.cache.get<T>(cacheKey);
          if (cached) return cached;
        }

        const isBodyless = BODYLESS_METHODS.has(apiInfo.method);
        const dedupKey = isBodyless ? this.dedup.buildKey(apiInfo.method, apiInfo.url, payload ?? undefined) : "";

        const execute = async (): Promise<ResponseFormat<T>> => {
          return withRetry(retryConfig, async () => {
            let result: ResponseFormat<T> | undefined;
            const core = async () => {
              result = await this.executeFetchCall<T>(apiInfo, idService, options);
            };
            if (this.config.middleware?.length) {
              await executeMiddleware(this.config.middleware, ctx, core);
              if (result) ctx.response = result;
            } else {
              await core();
            }
            return result!;
          });
        };

        try {
          this.emitRequest(String(idService.id), apiInfo.url, apiInfo.method);
          const result = isBodyless && dedupKey
            ? await this.dedup.execute<T>(dedupKey, execute)
            : await execute();

          this.emitResponse(String(idService.id), apiInfo.url, apiInfo.method, result.status, result.duration, result.ok);

          if (result.ok && this.cache.shouldCache(apiInfo.method)) {
            this.cache.set(cacheKey, result as ResponseFormat);
          }
          return result;
        } catch (error) {
          return responseFormat(handleErrorResponse(error)) as ResponseFormat<T>;
        }
      },

      execServiceByStream: async (
        idService: ServiceUrlCompile,
        payload?: Record<string, unknown> | null,
        options?: Record<string, unknown>
      ): Promise<StreamResponseFormat> => {
        const apiInfo = compileUrlByService(this.config, idService, payload ?? undefined, options);
        if (apiInfo == null) {
          const emptyStream = (async function* () {})();
          return { ok: false, status: 500, headers: null, problem: `Service ${idService.id} in driver not found`, stream: emptyStream, abort: () => {} };
        }

        let url: string = apiInfo.url;
        let requestOptions: Record<string, any> = { ...apiInfo.options };

        const serviceInfo = compileService(idService, this.config.services);
        requestOptions = this.applyTimeout(requestOptions, serviceInfo!.timeout);
        applyAbortControllerSignal(requestOptions);

        // SSE typically uses Accept: text/event-stream
        if (!requestOptions.headers?.hasOwnProperty("Accept")) {
          requestOptions.headers = { ...requestOptions.headers, "Accept": "text/event-stream" };
        }
        if (!requestOptions.headers.hasOwnProperty("Content-Type") && apiInfo.method !== "get") {
          requestOptions.headers = { ...requestOptions.headers, "Content-Type": "application/json" };
        }

        const methodUpper = apiInfo.method.toUpperCase();
        if (methodUpper !== "GET") {
          requestOptions = {
            ...requestOptions, method: methodUpper,
            body: JSON.stringify(apiInfo.payload),
          };
        }

        if (this.config.addRequestTransformFetch) {
          ({ url, requestOptions } = this.config.addRequestTransformFetch(url, requestOptions) as any);
        }

        // Create an AbortController for manual abort
        const abortController = new AbortController();
        if (requestOptions.signal) {
          const existingSignal = requestOptions.signal as AbortSignal;
          existingSignal.addEventListener("abort", () => abortController.abort(), { once: true });
        }
        requestOptions.signal = abortController.signal;

        try {
          this.emitRequest(String(idService.id), url, apiInfo.method);

          const res = await fetch(url, requestOptions);

          if (!res.ok) {
            this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
            const emptyStream = (async function* () {})();
            return {
              ok: false, status: res.status, headers: res.headers,
              problem: res.statusText || "Request failed",
              stream: emptyStream, abort: () => abortController.abort(),
            };
          }

          if (!res.body) {
            this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
            const emptyStream = (async function* () {})();
            return {
              ok: false, status: res.status, headers: res.headers,
              problem: "No readable stream in response",
              stream: emptyStream, abort: () => abortController.abort(),
            };
          }

          this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, true);
          const stream = parseSSEStream(res.body, abortController.signal);

          return {
            ok: true, status: res.status, headers: res.headers, problem: null,
            stream, abort: () => abortController.abort(),
          };
        } catch (error) {
          const emptyStream = (async function* () {})();
          const problem = error instanceof Error ? error.message : String(error);
          return { ok: false, status: 0, headers: null, problem, stream: emptyStream, abort: () => abortController.abort() };
        }
      },

      execServiceByNDJSON: async <T = unknown>(
        idService: ServiceUrlCompile,
        payload?: Record<string, unknown> | null,
        options?: Record<string, unknown>
      ): Promise<NDJSONStreamResponseFormat<T>> => {
        const apiInfo = compileUrlByService(this.config, idService, payload ?? undefined, options);
        if (apiInfo == null) {
          const emptyStream = (async function* () {})() as AsyncGenerator<T, void, undefined>;
          return { ok: false, status: 500, headers: null, problem: `Service ${idService.id} in driver not found`, stream: emptyStream, abort: () => {} };
        }

        let url: string = apiInfo.url;
        let requestOptions: Record<string, any> = { ...apiInfo.options };

        const serviceInfo = compileService(idService, this.config.services);
        requestOptions = this.applyTimeout(requestOptions, serviceInfo!.timeout);
        applyAbortControllerSignal(requestOptions);
        if (!requestOptions.headers?.hasOwnProperty("Accept")) {
          requestOptions.headers = { ...requestOptions.headers, "Accept": "application/x-ndjson" };
        }
        if (!requestOptions.headers.hasOwnProperty("Content-Type") && apiInfo.method !== "get") {
          requestOptions.headers = { ...requestOptions.headers, "Content-Type": "application/json" };
        }

        const methodUpper = apiInfo.method.toUpperCase();
        if (methodUpper !== "GET") {
          requestOptions = { ...requestOptions, method: methodUpper, body: JSON.stringify(apiInfo.payload) };
        }

        if (this.config.addRequestTransformFetch) {
          ({ url, requestOptions } = this.config.addRequestTransformFetch(url, requestOptions) as any);
        }

        const abortController = new AbortController();
        if (requestOptions.signal) {
          const existingSignal = requestOptions.signal as AbortSignal;
          existingSignal.addEventListener("abort", () => abortController.abort(), { once: true });
        }
        requestOptions.signal = abortController.signal;

        try {
          this.emitRequest(String(idService.id), url, apiInfo.method);
          const res = await fetch(url, requestOptions);

          if (!res.ok) {
            this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
            const emptyStream = (async function* () {})() as AsyncGenerator<T, void, undefined>;
            return { ok: false, status: res.status, headers: res.headers, problem: res.statusText || "Request failed", stream: emptyStream, abort: () => abortController.abort() };
          }
          if (!res.body) {
            this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, false);
            const emptyStream = (async function* () {})() as AsyncGenerator<T, void, undefined>;
            return { ok: false, status: res.status, headers: res.headers, problem: "No readable stream in response", stream: emptyStream, abort: () => abortController.abort() };
          }

          this.emitResponse(String(idService.id), url, apiInfo.method, res.status, 0, true);
          const stream = parseNDJSONStream<T>(res.body, abortController.signal);
          return { ok: true, status: res.status, headers: res.headers, problem: null, stream, abort: () => abortController.abort() };
        } catch (error) {
          const emptyStream = (async function* () {})() as AsyncGenerator<T, void, undefined>;
          const problem = error instanceof Error ? error.message : String(error);
          return { ok: false, status: 0, headers: null, problem, stream: emptyStream, abort: () => abortController.abort() };
        }
      },

      getInfoURL: (idService: ServiceUrlCompile, payload: Record<string, unknown> = {}) => {
        const apiInfo = compileService(idService, this.config.services);
        if (apiInfo != null) {
          let fullUrl: string;
          if (this.config.versionConfig?.enabled) {
            const vCfg = this.config.versionConfig;
            const version = apiInfo.version || vCfg.defaultVersion;
            fullUrl = buildUrlWithVersion(this.config.baseURL, apiInfo.url, version, vCfg);
          } else {
            fullUrl = joinUrl(this.config.baseURL, apiInfo.url);
          }
          if (payload && Object.keys(payload).length > 0 && apiInfo.method === MethodAPI.get) {
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

  private async executeAxiosCall<T>(apiInfo: any, idService: ServiceUrlCompile): Promise<ResponseFormat<T>> {
    try {
      const payloadConvert = apiInfo.payload;
      const optHeaders = apiInfo.options.headers as Record<string, unknown> | undefined;
      if (optHeaders && typeof optHeaders === "object" && optHeaders.hasOwnProperty("Content-Type")) {
        const contentType = optHeaders["Content-Type"];
        if (typeof contentType === "string" && contentType.toLowerCase() === "multipart/form-data") {
          // axios handles multipart boundaries automatically
        }
      }

      const axiosServiceInfo = compileService(idService, this.config.services);
      let opts = this.applyTimeout(apiInfo.options as Record<string, any>, axiosServiceInfo!.timeout);
      applyAbortControllerSignal(opts);

      const start = performance.now();
      const axiosCall = (this.axiosInstance as any)[apiInfo.method]?.bind(this.axiosInstance);
      let rawResult: any;
      if (axiosCall) {
        if (BODYLESS_METHODS.has(apiInfo.method)) {
          rawResult = await axiosCall(apiInfo.pathname, opts);
        } else {
          rawResult = await axiosCall(apiInfo.pathname, payloadConvert, opts);
        }
      } else {
        rawResult = await this.axiosInstance.request({
          method: apiInfo.method, url: apiInfo.pathname, data: payloadConvert, ...opts,
        });
      }
      const duration = Math.round((performance.now() - start) * 100) / 100;

      if (!rawResult) {
        return responseFormat({ ok: false, status: 500, headers: null, duration, data: null,
          problem: "No response from service call", originalError: "No response from service call" } as ResponseFormat<T>);
      }
      if (typeof rawResult.ok === "boolean" && typeof rawResult.status === "number") {
        return rawResult as ResponseFormat<T>;
      }
      return Driver.axiosResponseToResponseFormat<T>(rawResult as AxiosResponse, duration);
    } catch (error: unknown) {
      if ((error as AxiosError).isAxiosError) {
        const axErr = error as AxiosError;
        const axCode = String((axErr as any).code || "");
        const axName = String((axErr as any).name || "");
        if (axCode === "ERR_CANCELED" || axName === "CanceledError") {
          return responseFormat(handleErrorResponse(new TimeoutError())) as ResponseFormat<T>;
        }
        const axResponse = axErr.response;
        return responseFormat({ ok: false, status: axResponse?.status ?? 0,
          headers: Driver.normalizeAxiosHeaders(axResponse?.headers ?? null),
          duration: 0, data: (axResponse?.data ?? null) as T,
          problem: Driver.mapAxiosErrorToProblem(axErr), originalError: axErr.message,
        } as ResponseFormat<T>);
      }
      if (error instanceof Error) {
        const lower = error.message.toLowerCase();
        if (lower.includes("timeout")) return responseFormat(handleErrorResponse(new TimeoutError())) as ResponseFormat<T>;
        if (lower.includes("network")) return responseFormat(handleErrorResponse(new NetworkError())) as ResponseFormat<T>;
      }
      return responseFormat(handleErrorResponse(error)) as ResponseFormat<T>;
    }
  }

  private async executeFetchCall<T>(apiInfo: any, idService: ServiceUrlCompile, options?: Record<string, unknown>): Promise<ResponseFormat<T>> {
    try {
      let url: string = apiInfo.url;
      let requestOptions: Record<string, any> = { ...apiInfo.options };

      const fetchServiceInfo = compileService(idService, this.config.services);
      requestOptions = this.applyTimeout(requestOptions, fetchServiceInfo!.timeout);
      applyAbortControllerSignal(requestOptions);
      if (!requestOptions.headers?.hasOwnProperty("Content-Type")) {
        requestOptions.headers = { ...requestOptions.headers, "Content-Type": "application/json" };
      }

      const methodUpper = apiInfo.method.toUpperCase();
      if (methodUpper !== "GET") {
        const ct: string = requestOptions.headers["Content-Type"];
        requestOptions = { ...requestOptions, method: methodUpper,
          body: compileBodyFetchWithContentType(ct.toLowerCase(), apiInfo.payload) };
        if (ct.toLowerCase() === "multipart/form-data") delete requestOptions["headers"];
      }

      if (this.config.addRequestTransformFetch) {
        ({ url, requestOptions } = this.config.addRequestTransformFetch(url, requestOptions) as any);
      }

      const startFetchTime = performance.now();
      const res = await fetch(url, requestOptions);
      const duration = Math.round((performance.now() - startFetchTime) * 100) / 100;

      let data: unknown;
      try {
        data = await parseFetchResponse(res, (options as any)?.responseType);
      } catch (err) {
        if (err instanceof MalformedResponseError) throw err;
        throw new MalformedResponseError("Failed to parse response");
      }

      const response = responseFormat({
        ok: res.ok, duration, status: res.status, headers: res.headers, data: data as T,
        problem: !res.ok ? res.statusText : null, originalError: !res.ok ? res.statusText : null,
      });

      return this.config.addTransformResponseFetch
        ? this.config.addTransformResponseFetch(response) as ResponseFormat<T>
        : response as ResponseFormat<T>;
    } catch (error) {
      if (error instanceof MalformedResponseError) {
        return responseFormat(handleErrorResponse(error)) as ResponseFormat<T>;
      }
      if (error instanceof Error) {
        const lower = error.message.toLowerCase();
        if (error.name === "AbortError" || lower.includes("aborted") || lower.includes("canceled"))
          return responseFormat(handleErrorResponse(new TimeoutError())) as ResponseFormat<T>;
        if (lower.includes('timeout')) return responseFormat(handleErrorResponse(new TimeoutError())) as ResponseFormat<T>;
        if (lower.includes('network')) return responseFormat(handleErrorResponse(new NetworkError())) as ResponseFormat<T>;
      }
      if (typeof error === "object" && error !== null && (error as any).name === "AbortError")
        return responseFormat(handleErrorResponse(new TimeoutError())) as ResponseFormat<T>;
      return responseFormat(handleErrorResponse(error)) as ResponseFormat<T>;
    }
  }

  private static axiosResponseToResponseFormat<T = unknown>(res: AxiosResponse<T>, duration: number): ResponseFormat<T> {
    return responseFormat({ ok: res.status >= 200 && res.status <= 299, status: res.status, data: res.data,
      headers: Driver.normalizeAxiosHeaders(res.headers), duration,
      problem: res.status >= 400 ? res.statusText : null, originalError: null } as ResponseFormat<T>);
  }

  private static normalizeAxiosHeaders(headers: unknown): Record<string, string> | null {
    if (!headers || typeof headers !== "object") return null;
    const raw: Record<string, unknown> = typeof (headers as any).toJSON === "function"
      ? (headers as any).toJSON() : headers as Record<string, unknown>;
    const norm: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (typeof v === "string") norm[k.toLowerCase()] = v;
      else if (Array.isArray(v)) norm[k.toLowerCase()] = v.join(", ");
    }
    return norm;
  }

  private static mapAxiosToApiResponseLike(res: AxiosResponse): ApiResponseLike {
    const ok = res.status >= 200 && res.status <= 299;
    return { ok, problem: ok ? null : res.statusText, originalError: null,
      data: res.data, status: res.status, headers: res.headers as any, config: res.config, duration: 0 };
  }

  private static mapAxiosErrorToProblem(error: AxiosError): string {
    const code = (error.code ?? "").toUpperCase();
    if (code.includes("ECONNABORTED") || code.includes("ETIMEDOUT")) return "TIMEOUT_ERROR";
    if (!error.response) return "NETWORK_ERROR";
    const status = error.response.status;
    if (status >= 500) return "SERVER_ERROR";
    if (status >= 400) return "CLIENT_ERROR";
    return "UNKNOWN_ERROR";
  }
}

export class DriverBuilder {
  private config: DriverConfig = { baseURL: "", services: [] };

  withBaseURL(baseURL: string) { this.config.baseURL = baseURL; return this; }
  withServices(services: ServiceApi[]) { this.config.services = services; return this; }

  // Version
  withVersionConfig(versionConfig: VersionConfig) {
    this.config.versionConfig = { ...versionConfig, enabled: versionConfig.enabled !== undefined ? versionConfig.enabled : true };
    return this;
  }
  withGlobalVersion(version: string | number) {
    if (!this.config.versionConfig) this.config.versionConfig = {};
    this.config.versionConfig.defaultVersion = version; return this;
  }
  withVersionTemplate(template: string) {
    if (!this.config.versionConfig) this.config.versionConfig = {};
    this.config.versionConfig.template = template;
    this.config.versionConfig.position = 'custom';
    this.config.versionConfig.enabled = true; return this;
  }
  enableVersioning(enabled: boolean = true) {
    if (!this.config.versionConfig) this.config.versionConfig = {};
    this.config.versionConfig.enabled = enabled; return this;
  }

  // Retry, Cache, Timeout
  withRetry(config: RetryConfig) { this.config.retry = config; return this; }
  withCache(config: CacheConfig) { this.config.cache = config; return this; }
  withTimeout(ms: number) { this.config.timeout = ms; return this; }

  // Middleware
  use(middleware: MiddlewareFn) {
    if (!this.config.middleware) this.config.middleware = [];
    this.config.middleware.push(middleware); return this;
  }

  // Observability
  onRequest(hook: OnRequestHook) { this.config.onRequest = hook; return this; }
  onResponse(hook: OnResponseHook) { this.config.onResponse = hook; return this; }

  // Axios transforms
  withAddAsyncRequestTransformAxios(callback: AsyncRequestTransform) { this.config.addAsyncRequestTransform = callback; return this; }
  withAddAsyncResponseTransformAxios(callback: AsyncResponseTransform) { this.config.addAsyncResponseTransform = callback; return this; }
  withAddRequestTransformAxios(callback: (request: AxiosRequestConfig) => void) { this.config.addRequestTransformAxios = callback; return this; }
  withAddResponseTransformAxios(callback: (response: ApiResponseLike) => void) { this.config.addTransformResponseAxios = callback; return this; }
  withHandleInterceptorErrorAxios(
    callback: (axiosInstance: unknown, processQueue: (error: unknown, token: string | null) => void, isRefreshing: { value: boolean }, addToQueue: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => void) => (error: unknown) => Promise<unknown>
  ) { this.config.handleInterceptorErrorAxios = callback; return this; }

  // Fetch transforms
  withAddTransformResponseFetch(callback: (response: ResponseFormat) => ResponseFormat) { this.config.addTransformResponseFetch = callback; return this; }
  withAddRequestTransformFetch(callback: (url: string, requestOptions: Record<string, unknown>) => { url: string; requestOptions: Record<string, unknown> }) {
    this.config.addRequestTransformFetch = callback; return this;
  }

  build(): HttpDriverInstance & AxiosInstance {
    if (!this.config.baseURL || !this.config.services.length) throw new Error("Missing required configuration values");
    const driver = new Driver(this.config);
    return driver.appendExecService();
  }
}
