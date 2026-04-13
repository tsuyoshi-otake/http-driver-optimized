"use strict";
/**
 * SSE (Server-Sent Events) stream parser.
 * Parses a ReadableStream into an AsyncIterable of SSE events.
 */
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseSSEStream = parseSSEStream;
/**
 * Parse a ReadableStream<Uint8Array> into an async iterable of SSE events.
 * Follows the SSE spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
function parseSSEStream(stream, signal) {
    return __asyncGenerator(this, arguments, function* parseSSEStream_1() {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let currentEvent = "message";
        let currentData = [];
        let currentId = "";
        let currentRetry;
        const processLine = (line) => {
            if (line === "" || line === "\r") {
                if (currentData.length === 0) {
                    currentEvent = "message";
                    currentData = [];
                    currentRetry = undefined;
                    return null;
                }
                const event = {
                    event: currentEvent,
                    data: currentData.join("\n"),
                    id: currentId,
                    retry: currentRetry,
                };
                currentEvent = "message";
                currentData = [];
                currentRetry = undefined;
                return event;
            }
            const stripped = line.endsWith("\r") ? line.slice(0, -1) : line;
            if (stripped.startsWith(":")) {
                return null;
            }
            const colonIdx = stripped.indexOf(":");
            let field;
            let val;
            if (colonIdx === -1) {
                field = stripped;
                val = "";
            }
            else {
                field = stripped.slice(0, colonIdx);
                val = stripped.slice(colonIdx + 1);
                if (val.startsWith(" "))
                    val = val.slice(1);
            }
            switch (field) {
                case "event":
                    currentEvent = val;
                    break;
                case "data":
                    currentData.push(val);
                    break;
                case "id":
                    currentId = val;
                    break;
                case "retry": {
                    const n = parseInt(val, 10);
                    if (!isNaN(n))
                        currentRetry = n;
                    break;
                }
            }
            return null;
        };
        try {
            while (true) {
                if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                    break;
                const { done, value } = yield __await(reader.read());
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                let lineStart = 0;
                let lineEnd = buffer.indexOf("\n", lineStart);
                while (lineEnd !== -1) {
                    const event = processLine(buffer.slice(lineStart, lineEnd));
                    if (event) {
                        yield yield __await(event);
                    }
                    lineStart = lineEnd + 1;
                    lineEnd = buffer.indexOf("\n", lineStart);
                }
                buffer = buffer.slice(lineStart);
            }
            // Process any remaining buffer content
            if (buffer) {
                processLine(buffer);
            }
            // Flush remaining data
            if (currentData.length > 0) {
                yield yield __await({
                    event: currentEvent,
                    data: currentData.join("\n"),
                    id: currentId,
                    retry: currentRetry,
                });
            }
        }
        finally {
            try {
                reader.cancel();
            }
            catch ( /* ignore */_a) { /* ignore */ }
            reader.releaseLock();
        }
    });
}
