"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executeMiddleware = executeMiddleware;
/**
 * Executes middleware pipeline in order, then calls the core function.
 * Each middleware calls next() to proceed to the next middleware or the core.
 */
async function executeMiddleware(middlewares, ctx, core) {
    let index = 0;
    const next = async () => {
        if (index < middlewares.length) {
            const mw = middlewares[index++];
            await mw(ctx, next);
        }
        else {
            await core();
        }
    };
    await next();
}
