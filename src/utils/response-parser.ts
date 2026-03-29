import { MalformedResponseError } from "../types/errors";

/**
 * Shared response body parser for both execServiceByFetch and httpClientFetch.
 * Handles blob, arraybuffer, text, JSON, and auto-detection based on content-type.
 */
export async function parseFetchResponse(
  res: Response,
  responseType?: string
): Promise<unknown> {
  const contentType = res.headers.get('content-type')?.toLowerCase() || '';

  if (responseType === 'blob') return res.blob();
  if (responseType === 'arraybuffer') return res.arrayBuffer();
  if (responseType === 'text') return res.text();

  // Auto-detect binary types
  if (contentType.startsWith('image/') || contentType.startsWith('application/pdf')) {
    return res.blob();
  }
  if (contentType.startsWith('application/octet-stream') && !responseType) {
    return res.blob();
  }

  // Auto-detect text types
  if (contentType.startsWith('text/') && !contentType.includes('application/json')) {
    return res.text();
  }

  // Default: try JSON, fallback to text
  const resText = await res.text();

  // Empty body is valid for 204 No Content and 304 Not Modified
  if (!resText) {
    if (res.status === 204 || res.status === 304) return null;
    throw new MalformedResponseError("Malformed response");
  }

  if (contentType.includes('application/json') || !contentType) {
    try {
      return JSON.parse(resText);
    } catch {
      throw new MalformedResponseError("Malformed response");
    }
  }

  return resText;
}
