import type { MiddlewareContext, MiddlewareFn } from "../types/driver";
/**
 * Executes middleware pipeline in order, then calls the core function.
 * Each middleware calls next() to proceed to the next middleware or the core.
 */
export declare function executeMiddleware(middlewares: MiddlewareFn[], ctx: MiddlewareContext, core: () => Promise<void>): Promise<void>;
