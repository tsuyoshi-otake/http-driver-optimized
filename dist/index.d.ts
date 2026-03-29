import { AxiosInstance, AxiosRequestConfig } from "axios";
import type { ApiResponseLike, AsyncRequestTransform, AsyncResponseTransform, CacheConfig, HttpDriverInstance, MiddlewareFn, OnRequestHook, OnResponseHook, ResponseFormat, RetryConfig, ServiceApi, VersionConfig } from "./types/driver";
export type { CacheConfig, DriverConfig, HttpDriverInstance, MiddlewareContext, MiddlewareFn, NDJSONStreamResponseFormat, OnRequestHook, OnResponseHook, ResponseFormat, RetryConfig, ServiceApi, ServiceUrlCompile, SSEEvent, StreamResponseFormat, VersionConfig } from "./types/driver";
export { MethodAPI } from "./types/driver";
export { createGraphQLClient } from "./utils/graphql";
export type { GraphQLRequest, GraphQLResponse } from "./utils/graphql";
export { parseNDJSONStream } from "./utils/ndjson-parser";
export { fetchWithDownloadProgress, createUploadProgressBody } from "./utils/progress";
export type { ProgressInfo, ProgressCallback } from "./utils/progress";
export { createWebSocketClient } from "./utils/websocket";
export type { WebSocketConfig, WebSocketClient, WebSocketMessage, Unsubscribe as WebSocketUnsubscribe } from "./utils/websocket";
export declare class DriverBuilder {
    private config;
    withBaseURL(baseURL: string): this;
    withServices(services: ServiceApi[]): this;
    withVersionConfig(versionConfig: VersionConfig): this;
    withGlobalVersion(version: string | number): this;
    withVersionTemplate(template: string): this;
    enableVersioning(enabled?: boolean): this;
    withRetry(config: RetryConfig): this;
    withCache(config: CacheConfig): this;
    withTimeout(ms: number): this;
    use(middleware: MiddlewareFn): this;
    onRequest(hook: OnRequestHook): this;
    onResponse(hook: OnResponseHook): this;
    withAddAsyncRequestTransformAxios(callback: AsyncRequestTransform): this;
    withAddAsyncResponseTransformAxios(callback: AsyncResponseTransform): this;
    withAddRequestTransformAxios(callback: (request: AxiosRequestConfig) => void): this;
    withAddResponseTransformAxios(callback: (response: ApiResponseLike) => void): this;
    withHandleInterceptorErrorAxios(callback: (axiosInstance: unknown, processQueue: (error: unknown, token: string | null) => void, isRefreshing: {
        value: boolean;
    }, addToQueue: (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => void) => (error: unknown) => Promise<unknown>): this;
    withAddTransformResponseFetch(callback: (response: ResponseFormat) => ResponseFormat): this;
    withAddRequestTransformFetch(callback: (url: string, requestOptions: Record<string, unknown>) => {
        url: string;
        requestOptions: Record<string, unknown>;
    }): this;
    build(): HttpDriverInstance & AxiosInstance;
}
