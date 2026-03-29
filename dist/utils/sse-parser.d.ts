/**
 * SSE (Server-Sent Events) stream parser.
 * Parses a ReadableStream into an AsyncIterable of SSE events.
 */
export interface SSEEvent {
    /** Event type (default: "message") */
    event: string;
    /** Event data (may span multiple lines) */
    data: string;
    /** Event ID */
    id: string;
    /** Reconnection time in ms (if server sent retry:) */
    retry?: number;
}
/**
 * Parse a ReadableStream<Uint8Array> into an async iterable of SSE events.
 * Follows the SSE spec: https://html.spec.whatwg.org/multipage/server-sent-events.html
 */
export declare function parseSSEStream(stream: ReadableStream<Uint8Array>, signal?: AbortSignal): AsyncGenerator<SSEEvent, void, undefined>;
