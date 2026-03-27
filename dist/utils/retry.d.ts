import type { RetryConfig, ResponseFormat } from "../types/driver";
export declare function resolveRetryConfig(global?: RetryConfig, perService?: RetryConfig): RetryConfig;
export declare function withRetry<T>(config: RetryConfig, fn: () => Promise<ResponseFormat<T>>): Promise<ResponseFormat<T>>;
