import { executeMiddleware } from "../../src/utils/middleware";
import type { MiddlewareContext } from "../../src/types/driver";

describe("executeMiddleware", () => {
  const baseCtx: MiddlewareContext = { url: "/api", method: "get", serviceId: "test" };

  test("executes core when no middleware", async () => {
    const core = jest.fn();
    await executeMiddleware([], baseCtx, core);
    expect(core).toHaveBeenCalledTimes(1);
  });

  test("executes single middleware then core", async () => {
    const order: string[] = [];
    const mw = async (_ctx: MiddlewareContext, next: () => Promise<void>) => {
      order.push("mw-before");
      await next();
      order.push("mw-after");
    };
    const core = async () => { order.push("core"); };
    await executeMiddleware([mw], baseCtx, core);
    expect(order).toEqual(["mw-before", "core", "mw-after"]);
  });

  test("executes multiple middleware in order", async () => {
    const order: string[] = [];
    const mw1 = async (_ctx: MiddlewareContext, next: () => Promise<void>) => {
      order.push("mw1-before"); await next(); order.push("mw1-after");
    };
    const mw2 = async (_ctx: MiddlewareContext, next: () => Promise<void>) => {
      order.push("mw2-before"); await next(); order.push("mw2-after");
    };
    const core = async () => { order.push("core"); };
    await executeMiddleware([mw1, mw2], baseCtx, core);
    expect(order).toEqual(["mw1-before", "mw2-before", "core", "mw2-after", "mw1-after"]);
  });

  test("middleware can modify context", async () => {
    const mw = async (ctx: MiddlewareContext, next: () => Promise<void>) => {
      ctx.url = "/modified";
      await next();
    };
    const ctx = { ...baseCtx };
    await executeMiddleware([mw], ctx, async () => {});
    expect(ctx.url).toBe("/modified");
  });

  test("middleware can short-circuit by not calling next", async () => {
    const core = jest.fn();
    const mw = async (_ctx: MiddlewareContext, _next: () => Promise<void>) => {
      // Don't call next - short circuit
    };
    await executeMiddleware([mw], baseCtx, core);
    expect(core).not.toHaveBeenCalled();
  });
});
