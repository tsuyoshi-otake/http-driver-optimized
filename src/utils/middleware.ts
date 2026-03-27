import type { MiddlewareContext, MiddlewareFn } from "../types/driver";

/**
 * Executes middleware pipeline in order, then calls the core function.
 * Each middleware calls next() to proceed to the next middleware or the core.
 */
export async function executeMiddleware(
  middlewares: MiddlewareFn[],
  ctx: MiddlewareContext,
  core: () => Promise<void>
): Promise<void> {
  let index = 0;

  const next = async (): Promise<void> => {
    if (index < middlewares.length) {
      const mw = middlewares[index++];
      await mw(ctx, next);
    } else {
      await core();
    }
  };

  await next();
}
