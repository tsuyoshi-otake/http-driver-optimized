import type { RetryConfig, ResponseFormat } from "../types/driver";

const DEFAULT_RETRY_ON = [408, 429, 500, 502, 503, 504];

export function resolveRetryConfig(
  global?: RetryConfig,
  perService?: RetryConfig
): RetryConfig {
  const merged: RetryConfig = {
    maxAttempts: perService?.maxAttempts ?? global?.maxAttempts ?? 0,
    delay: perService?.delay ?? global?.delay ?? 1000,
    backoff: perService?.backoff ?? global?.backoff ?? "fixed",
    retryOn: perService?.retryOn ?? global?.retryOn ?? DEFAULT_RETRY_ON,
  };
  return merged;
}

export async function withRetry<T>(
  config: RetryConfig,
  fn: () => Promise<ResponseFormat<T>>
): Promise<ResponseFormat<T>> {
  const maxAttempts = config.maxAttempts ?? 0;
  if (maxAttempts <= 0) return fn();

  let lastResult: ResponseFormat<T> | undefined;
  const retryOn = config.retryOn ?? DEFAULT_RETRY_ON;

  for (let attempt = 0; attempt <= maxAttempts; attempt++) {
    lastResult = await fn();

    if (lastResult.ok || !retryOn.includes(lastResult.status)) {
      return lastResult;
    }

    if (attempt < maxAttempts) {
      const delay = config.backoff === "exponential"
        ? (config.delay ?? 1000) * Math.pow(2, attempt)
        : (config.delay ?? 1000);
      await sleep(delay);
    }
  }

  return lastResult!;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
