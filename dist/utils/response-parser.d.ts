/**
 * Shared response body parser for both execServiceByFetch and httpClientFetch.
 * Handles blob, arraybuffer, text, JSON, and auto-detection based on content-type.
 */
export declare function parseFetchResponse(res: Response, responseType?: string): Promise<unknown>;
