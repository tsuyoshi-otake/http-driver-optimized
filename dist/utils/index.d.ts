import type { CompiledServiceInfo, CompileUrlResult, DriverConfig, MethodAPI, ResponseFormat, ServiceApi, ServiceUrlCompile, UrlBuilder, VersionConfig } from "../types/driver";
export declare function replaceParamsInUrl(url: string, params: Record<string, string>): string;
export declare function findServiceApi(services: ServiceApi[], idToFind: string): ServiceApi | null;
export declare function joinUrl(...parts: (string | undefined | null)[]): string;
export declare function compileService(idService: ServiceUrlCompile, services: ServiceApi[]): CompiledServiceInfo | null;
export declare function buildUrlWithVersion(baseURL: string, endpoint: string, version: string | number | undefined, versionConfig?: VersionConfig): string;
export declare function compileUrlByService(configServices: DriverConfig, idService: ServiceUrlCompile, payload?: Record<string, unknown>, options?: Record<string, unknown>): CompileUrlResult | null;
export declare function responseFormat<T = unknown>({ status, data, headers, originalError, duration, problem, }: ResponseFormat<T>): ResponseFormat<T>;
export declare function compileUrl(url: string, method: MethodAPI, payload?: Record<string, unknown>, options?: Record<string, unknown>): CompileUrlResult;
/**
 * Formats the payload based on the specified content type.
 */
export declare function compileBodyFetchWithContentType(contentType: string, payload: Record<string, unknown>): string | FormData;
/** @deprecated Use compileBodyFetchWithContentType instead */
export declare const compileBodyFetchWithContextType: typeof compileBodyFetchWithContentType;
export declare function httpClientFetch<T = unknown>(urlBuilder: UrlBuilder, payload?: Record<string, unknown>, options?: Record<string, unknown>): Promise<ResponseFormat<T>>;
export declare function removeNullValues<T extends Record<string, any>>(obj: T): T;
