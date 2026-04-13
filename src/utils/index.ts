import * as qs from "qs";
import type {
  CompiledServiceInfo,
  CompileUrlResult,
  DriverConfig,
  MethodAPI,
  ResponseFormat,
  ServiceApi,
  ServiceUrlCompile,
  UrlBuilder,
  VersionConfig,
} from "../types/driver";
import { parseFetchResponse } from "./response-parser";

const TRAILING_SLASHES = /\/+$/;
const LEADING_SLASHES = /^\/+/;
const URL_PARAMS_PATTERN = /\{(\w+)\}/g;

export function replaceParamsInUrl(
  url: string,
  params: Record<string, string>
): string {
  return url.replace(
    URL_PARAMS_PATTERN,
    (_match: string, paramName: string) => {
      const value = params[paramName];
      return value !== undefined ? encodeURIComponent(value) : _match;
    }
  );
}

export function findServiceApi(
  services: ServiceApi[],
  idToFind: string
): ServiceApi | null {
  return services.find((service) => service.id === idToFind) ?? null;
}

export function joinUrl(...parts: (string | undefined | null)[]): string {
  const validParts = parts.filter((p): p is string => typeof p === 'string' && p.trim().length > 0);
  if (validParts.length === 0) return '';
  return validParts.reduce((acc, curr) => {
    return acc.replace(TRAILING_SLASHES, '') + '/' + curr.replace(LEADING_SLASHES, '');
  }) as string;
}

export function compileService(
  idService: ServiceUrlCompile,
  services: ServiceApi[]
): CompiledServiceInfo | null {
  const serviceExec = findServiceApi(services, idService.id);
  if (serviceExec) {
    return {
      url: replaceParamsInUrl(serviceExec.url, (idService.params ?? {}) as Record<string, string>),
      method: serviceExec.method,
      version: serviceExec.version,
      options: serviceExec.options ?? {},
      timeout: serviceExec.timeout,
      retry: serviceExec.retry,
    };
  }
  return null;
}

export function buildUrlWithVersion(
  baseURL: string,
  endpoint: string,
  version: string | number | undefined,
  versionConfig?: VersionConfig
): string {
  if (!versionConfig?.enabled) return joinUrl(baseURL, endpoint);
  if (!version) return joinUrl(baseURL, endpoint);

  const position = versionConfig.position || 'after-base';
  const prefix = versionConfig.prefix !== undefined ? versionConfig.prefix : 'v';
  const versionString = `${prefix}${version}`;

  switch (position) {
    case 'prefix': {
      const urlParts = baseURL.split('://');
      if (urlParts.length === 2) {
        return joinUrl(`${urlParts[0]}://${versionString}.${urlParts[1]}`, endpoint);
      }
      return joinUrl(`${versionString}.${baseURL}`, endpoint);
    }
    case 'before-endpoint':
      return joinUrl(baseURL, versionString, endpoint);
    case 'custom':
      if (versionConfig.template) {
        return versionConfig.template
          .replace('{baseURL}', baseURL)
          .replace('{version}', versionString)
          .replace('{endpoint}', endpoint);
      }
      throw new Error('Custom version position requires a template. Please provide a template in versionConfig.');
    case 'after-base':
    default:
      return joinUrl(baseURL, versionString, endpoint);
  }
}

export function compileUrlByService(
  configServices: DriverConfig,
  idService: ServiceUrlCompile,
  payload?: Record<string, unknown>,
  options?: Record<string, unknown>
): CompileUrlResult | null {
  const apiInfo = compileService(idService, configServices.services);
  if (apiInfo != null) {
    let finalUrl: string;
    if (configServices.versionConfig?.enabled) {
      const vCfg = configServices.versionConfig;
      const version = apiInfo.version || vCfg.defaultVersion;
      finalUrl = buildUrlWithVersion(configServices.baseURL, apiInfo.url, version, vCfg);
    } else {
      finalUrl = joinUrl(configServices.baseURL, apiInfo.url);
    }
    return compileUrl(finalUrl, apiInfo.method, payload ?? {}, options);
  }
  return null;
}

export function responseFormat<T = unknown>({
  status, data, headers, originalError, duration, problem,
}: ResponseFormat<T>): ResponseFormat<T> {
  return {
    ok: status >= 200 && status <= 299,
    problem, originalError, data, status, headers, duration,
  } as ResponseFormat<T>;
}

export function compileUrl(
  url: string,
  method: MethodAPI,
  payload?: Record<string, unknown>,
  options?: Record<string, unknown>
): CompileUrlResult {
  const optionRequest = options ?? {};
  if (Object.keys(payload ?? {}).length > 0 && method === "get") {
    const queryString = qs.stringify(payload);
    payload = {};
    url = url + "?" + queryString;
  }
  return { url, payload: payload ?? {}, method, pathname: url, options: optionRequest };
}

/**
 * Formats the payload based on the specified content type.
 */
export function compileBodyFetchWithContentType(
  contentType: string,
  payload: Record<string, unknown>
): string | FormData {
  switch (contentType) {
    case "multipart/form-data":
      return objectToFormData(payload);
    case "application/json":
      return JSON.stringify(payload);
    default:
      return JSON.stringify(payload);
  }
}

/** @deprecated Use compileBodyFetchWithContentType instead */
export const compileBodyFetchWithContextType = compileBodyFetchWithContentType;

export async function httpClientFetch<T = unknown>(
  urlBuilder: UrlBuilder,
  payload?: Record<string, unknown>,
  options?: Record<string, unknown>
): Promise<ResponseFormat<T>> {
  const finalUrl = replaceParamsInUrl(urlBuilder.url, (urlBuilder.param ?? {}) as Record<string, string>);
  const request = compileUrl(finalUrl, urlBuilder.method, payload, options);
  let requestOptions: Record<string, any> = { ...options };

  if (!requestOptions.headers || !Object.prototype.hasOwnProperty.call(requestOptions.headers, "Content-Type")) {
    requestOptions.headers = { ...(requestOptions.headers || {}), "Content-Type": "application/json" };
  }

  try {
    if (request.method.toUpperCase() != "GET") {
      const contentType: string = requestOptions.headers["Content-Type"];
      requestOptions = {
        ...requestOptions,
        method: request.method.toUpperCase(),
        body: compileBodyFetchWithContentType(contentType.toLowerCase(), request.payload),
      };
      if (contentType.toLowerCase() === "multipart/form-data") {
        delete requestOptions["headers"];
      }
    }

    const startFetchTime = performance.now();
    const res = await fetch(request.url, requestOptions);
    const duration = Math.round((performance.now() - startFetchTime) * 100) / 100;

    let data: unknown;
    try {
      data = await parseFetchResponse(res, (options as any)?.responseType);
    } catch {
      // Fallback: try text
      try { data = await res.text(); } catch { data = null; }
    }

    if (!res.ok) {
      return responseFormat<T>({
        ok: res.ok, duration, status: res.status, headers: res.headers,
        data: data as T, problem: res.statusText, originalError: res.statusText,
      });
    }
    return responseFormat<T>({
      ok: res.ok, duration, status: res.status, headers: res.headers,
      data: data as T, problem: null, originalError: null,
    });
  } catch (error) {
    return responseFormat<T>({
      ok: false, duration: 0, originalError: `${error}`,
      problem: `Error fetching data ${error}`, data: null as T, status: 500,
    });
  }
}

export function removeNullValues<T extends Record<string, any>>(obj: T): T {
  const result: Record<string, any> = {};
  for (const key in obj) {
    const value = obj[key];
    if (value !== null && value !== undefined) {
      if (typeof value === "object" && !Array.isArray(value)) {
        if (isFileOrBlob(value)) {
          result[key] = value;
        } else {
          result[key] = removeNullValues(value as Record<string, any>);
        }
      } else {
        result[key] = value;
      }
    }
  }
  return result as T;
}

/**
 * Duck-type check for File/Blob-like objects.
 * Uses property checks only - no hardcoded constructor names.
 */
function isFileOrBlob(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;

  // File-like: has name (string) + lastModified (number)
  const hasFileProps = typeof v.name === 'string' && typeof v.lastModified === 'number';
  // Blob-like: has size (number) + type (string) + stream/text function
  const hasBlobProps = typeof v.size === 'number' && typeof v.type === 'string'
    && (typeof v.stream === 'function' || typeof v.text === 'function');

  if (hasFileProps || hasBlobProps) return true;

  // Fallback: check constructor name and toString representation
  const ctorName = (v as any).constructor?.name ?? '';
  const str = typeof (v as any).toString === 'function' ? (v as any).toString() : '';
  return ctorName === 'File' || ctorName === 'Blob'
    || str === '[object File]' || str === '[object Blob]';
}

function objectToFormData(
  payload: Record<string, unknown>,
  formData: FormData = new FormData(),
  parentKey: string | null = null,
  skipNullishObjectValues = true
): FormData {
  for (const key in payload) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;

    const value = payload[key];
    if (skipNullishObjectValues && (value === null || value === undefined)) continue;

    const formKey = parentKey ? `${parentKey}[${key}]` : key;

    if (Array.isArray(value)) {
      value.forEach((subValue: unknown, index: number) => {
        if (isFileOrBlob(subValue)) {
          formData.append(`${formKey}[${index}]`, subValue as any);
        } else if (typeof subValue === "object" && subValue !== null) {
          objectToFormData(
            subValue as Record<string, unknown>,
            formData,
            `${formKey}[${index}]`,
            false
          );
        } else {
          formData.append(`${formKey}[${index}]`, String(subValue));
        }
      });
    } else if (isFileOrBlob(value)) {
      formData.append(formKey, value as any);
    } else if (typeof value === "object" && value !== null) {
      objectToFormData(
        value as Record<string, unknown>,
        formData,
        formKey,
        skipNullishObjectValues
      );
    } else {
      formData.append(formKey, String(value));
    }
  }
  return formData;
}
