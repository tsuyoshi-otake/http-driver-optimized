"use strict";
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
exports.parseNDJSONStream = parseNDJSONStream;
/**
 * NDJSON (Newline-Delimited JSON) stream parser.
 * Parses a ReadableStream into an AsyncIterable of parsed JSON objects.
 * Used for streaming APIs that return one JSON object per line.
 */
function parseNDJSONStream(stream, signal) {
    return __asyncGenerator(this, arguments, function* parseNDJSONStream_1() {
        const reader = stream.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        try {
            while (true) {
                if (signal === null || signal === void 0 ? void 0 : signal.aborted)
                    break;
                const { done, value } = yield __await(reader.read());
                if (done)
                    break;
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split("\n");
                buffer = lines.pop();
                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed)
                        continue;
                    try {
                        yield yield __await(JSON.parse(trimmed));
                    }
                    catch (_a) {
                        // Skip malformed lines
                    }
                }
            }
            // Flush remaining buffer
            if (buffer.trim()) {
                try {
                    yield yield __await(JSON.parse(buffer.trim()));
                }
                catch (_b) {
                    // Skip malformed final line
                }
            }
        }
        finally {
            try {
                reader.cancel();
            }
            catch ( /* ignore */_c) { /* ignore */ }
            reader.releaseLock();
        }
    });
}
