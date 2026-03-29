export interface ProgressInfo {
    loaded: number;
    total: number;
    percent: number;
}
export type ProgressCallback = (info: ProgressInfo) => void;
/**
 * Reads a fetch Response body with download progress tracking.
 * Returns the complete body as an ArrayBuffer.
 */
export declare function fetchWithDownloadProgress(response: Response, onProgress: ProgressCallback): Promise<ArrayBuffer>;
/**
 * Creates a Request body wrapper that tracks upload progress.
 * Uses pull-based reading to avoid buffering entire source in memory.
 */
export declare function createUploadProgressBody(body: BodyInit, onProgress: ProgressCallback): {
    body: ReadableStream<Uint8Array>;
    headers?: Record<string, string>;
};
