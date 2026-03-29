/**
 * NDJSON (Newline-Delimited JSON) stream parser.
 * Parses a ReadableStream into an AsyncIterable of parsed JSON objects.
 * Used for streaming APIs that return one JSON object per line.
 */
export declare function parseNDJSONStream<T = unknown>(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<T, void, undefined>;
