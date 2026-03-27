import { AxiosRequestConfig, AxiosResponse } from "axios";

export enum MethodAPI {
  get = "get",
  delete = "delete",
  head = "head",
  post = "post",
  put = "put",
  patch = "patch",
  link = "link",
  unlink = "unlink",
}

// --- Retry Config ---
export interface RetryConfig {
  /** Max number of retry attempts (default: 0 = no retry) */
  maxAttempts?: number;
  /** Delay in ms between retries (default: 1000) */
  delay?: number;
  /** Backoff strategy (default: "fixed") */
  backoff?: "fixed" | "exponential";
  /** HTTP status codes that trigger retry (default: [408, 429, 500, 502, 503, 504]) */
  retryOn?: number[];
}

// --- Cache Config ---
export interface CacheConfig {
  /** Enable caching (default: false) */
  enabled?: boolean;
  /** TTL in ms (default: 30000) */
  ttl?: number;
  /** Only cache GET requests (default: true) */
  getOnly?: boolean;
}

// --- Middleware ---
export type MiddlewareContext = {
  url: string;
  method: string;
  serviceId: string;
  payload?: Record<string, unknown>;
  options?: Record<string, unknown>;
  response?: ResponseFormat;
};

export type MiddlewareFn = (
  ctx: MiddlewareContext,
  next: () => Promise<void>
) => Promise<void>;

// --- Observability ---
export type OnRequestHook = (info: { url: string; method: string; serviceId: string; timestamp: number }) => void;
export type OnResponseHook = (info: { url: string; method: string; serviceId: string; status: number; duration: number; ok: boolean }) => void;

export interface ServiceApi {
  id: string;
  url: string;
  method: MethodAPI;
  version?: number | string;
  options?: Record<string, unknown>;
  /** Per-service timeout in ms */
  timeout?: number;
  /** Per-service retry config */
  retry?: RetryConfig;
}

export interface ServiceUrlCompile<T = string> {
  id: T | string;
  params?: Record<string, string | number>;
}

export type PROBLEM_CODE =
  | "CLIENT_ERROR"
  | "SERVER_ERROR"
  | "TIMEOUT_ERROR"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export type HEADERS = Record<string, string>;

export interface ApiResponseLike<T = unknown> {
  ok: boolean;
  status: number;
  data: T | null;
  headers?: Record<string, string> | Headers | null;
  config?: AxiosRequestConfig;
  problem?: string | null;
  originalError?: unknown;
  duration?: number;
}

export type AsyncRequestTransform = (
  transform: (request: AxiosRequestConfig) => void | Promise<void>
) => void;

export type AsyncResponseTransform = (
  transform: (response: AxiosResponse) => void | Promise<void>
) => void;

export interface VersionConfig {
  position?: 'after-base' | 'before-endpoint' | 'prefix' | 'custom';
  template?: string;
  prefix?: string;
  defaultVersion?: string | number;
  enabled?: boolean;
}

export interface DriverConfig {
  baseURL: string;
  services: ServiceApi[];
  withCredentials?: boolean;
  versionConfig?: VersionConfig;

  /** Global retry config (can be overridden per-service) */
  retry?: RetryConfig;
  /** Response cache config */
  cache?: CacheConfig;
  /** Global timeout in ms */
  timeout?: number;

  /** Middleware pipeline */
  middleware?: MiddlewareFn[];

  /** Observability hooks */
  onRequest?: OnRequestHook;
  onResponse?: OnResponseHook;

  addRequestTransformAxios?: (request: AxiosRequestConfig) => void;
  addTransformResponseAxios?: (response: ApiResponseLike) => void;
  addAsyncRequestTransform?: AsyncRequestTransform;
  addAsyncResponseTransform?: AsyncResponseTransform;

  handleInterceptorErrorAxios?: (
    axiosInstance: unknown,
    processQueue: (error: unknown, token: string | null) => void,
    isRefreshing: { value: boolean },
    addToQueue: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => void
  ) => (error: unknown) => Promise<unknown>;

  addTransformResponseFetch?: (response: ResponseFormat) => ResponseFormat;
  addRequestTransformFetch?: (
    url: string,
    requestOptions: Record<string, unknown>
  ) => { url: string; requestOptions: Record<string, unknown> };
}

export interface UrlBuilder {
  url: string;
  method: MethodAPI;
  param?: Record<string, string>;
}

export interface CompileUrlResult {
  url: string;
  payload: Record<string, unknown>;
  method: MethodAPI;
  pathname: string;
  options: Record<string, unknown>;
}

export interface ResponseFormat<T = unknown> {
  ok: boolean;
  problem: string | null;
  originalError: string | null;
  data: T;
  status: number;
  config?: AxiosRequestConfig;
  headers?: Headers | Record<string, string> | null;
  duration: number;
}

export interface CompiledServiceInfo {
  url: string;
  method: MethodAPI;
  version: number | string | undefined;
  options: Record<string, unknown>;
  timeout?: number;
  retry?: RetryConfig;
}

export interface HttpDriverInstance {
  execService: <T = unknown>(
    idService: ServiceUrlCompile,
    payload?: Record<string, unknown>,
    options?: Record<string, unknown>
  ) => Promise<ResponseFormat<T>>;

  execServiceByFetch: <T = unknown>(
    idService: ServiceUrlCompile,
    payload?: Record<string, unknown> | null,
    options?: Record<string, unknown>
  ) => Promise<ResponseFormat<T>>;

  getInfoURL: (
    idService: ServiceUrlCompile,
    payload?: Record<string, unknown>
  ) => {
    fullUrl: string | null;
    pathname: string | null;
    method: MethodAPI | null;
    payload: Record<string, unknown> | null;
  };
}
