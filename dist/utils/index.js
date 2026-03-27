"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.compileBodyFetchWithContextType = void 0;
exports.replaceParamsInUrl = replaceParamsInUrl;
exports.findServiceApi = findServiceApi;
exports.joinUrl = joinUrl;
exports.compileService = compileService;
exports.buildUrlWithVersion = buildUrlWithVersion;
exports.compileUrlByService = compileUrlByService;
exports.responseFormat = responseFormat;
exports.compileUrl = compileUrl;
exports.compileBodyFetchWithContentType = compileBodyFetchWithContentType;
exports.httpClientFetch = httpClientFetch;
exports.removeNullValues = removeNullValues;
const qs = __importStar(require("qs"));
const response_parser_1 = require("./response-parser");
const TRAILING_SLASHES = /\/+$/;
const LEADING_SLASHES = /^\/+/;
const URL_PARAMS_PATTERN = /\{(\w+)\}/g;
function replaceParamsInUrl(url, params) {
    return url.replace(URL_PARAMS_PATTERN, (_match, paramName) => params[paramName]);
}
function findServiceApi(services, idToFind) {
    var _a;
    return (_a = services.find((service) => service.id === idToFind)) !== null && _a !== void 0 ? _a : null;
}
function joinUrl(...parts) {
    const validParts = parts.filter((p) => typeof p === 'string' && p.trim().length > 0);
    if (validParts.length === 0)
        return '';
    return validParts.reduce((acc, curr) => {
        return acc.replace(TRAILING_SLASHES, '') + '/' + curr.replace(LEADING_SLASHES, '');
    });
}
function compileService(idService, services) {
    var _a, _b;
    const serviceExec = findServiceApi(services, idService.id);
    if (serviceExec) {
        return {
            url: replaceParamsInUrl(serviceExec.url, ((_a = idService.params) !== null && _a !== void 0 ? _a : {})),
            method: serviceExec.method,
            version: serviceExec.version,
            options: (_b = serviceExec.options) !== null && _b !== void 0 ? _b : {},
            timeout: serviceExec.timeout,
            retry: serviceExec.retry,
        };
    }
    return null;
}
function buildUrlWithVersion(baseURL, endpoint, version, versionConfig) {
    if (!(versionConfig === null || versionConfig === void 0 ? void 0 : versionConfig.enabled))
        return joinUrl(baseURL, endpoint);
    if (!version)
        return joinUrl(baseURL, endpoint);
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
            return joinUrl(baseURL, endpoint, versionString);
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
function compileUrlByService(configServices, idService, payload, options) {
    var _a;
    const apiInfo = compileService(idService, configServices.services);
    if (apiInfo != null) {
        let finalUrl;
        if ((_a = configServices.versionConfig) === null || _a === void 0 ? void 0 : _a.enabled) {
            const vCfg = configServices.versionConfig;
            const version = apiInfo.version || vCfg.defaultVersion;
            finalUrl = buildUrlWithVersion(configServices.baseURL, apiInfo.url, version, vCfg);
        }
        else {
            finalUrl = joinUrl(configServices.baseURL, apiInfo.url);
        }
        return compileUrl(finalUrl, apiInfo.method, payload !== null && payload !== void 0 ? payload : {}, options);
    }
    return null;
}
function responseFormat({ status, data, headers, originalError, duration, problem, }) {
    return {
        ok: status >= 200 && status <= 299,
        problem, originalError, data, status, headers, duration,
    };
}
function compileUrl(url, method, payload, options) {
    const optionRequest = options !== null && options !== void 0 ? options : {};
    if (Object.keys(payload !== null && payload !== void 0 ? payload : {}).length > 0 && method === "get") {
        const queryString = qs.stringify(payload);
        payload = {};
        url = url + "?" + queryString;
    }
    return { url, payload: payload !== null && payload !== void 0 ? payload : {}, method, pathname: url, options: optionRequest };
}
/**
 * Formats the payload based on the specified content type.
 */
function compileBodyFetchWithContentType(contentType, payload) {
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
exports.compileBodyFetchWithContextType = compileBodyFetchWithContentType;
async function httpClientFetch(urlBuilder, payload, options) {
    var _a;
    const finalUrl = replaceParamsInUrl(urlBuilder.url, ((_a = urlBuilder.param) !== null && _a !== void 0 ? _a : {}));
    const request = compileUrl(finalUrl, urlBuilder.method, payload, options);
    let requestOptions = Object.assign({}, options);
    if (!requestOptions.headers || !Object.prototype.hasOwnProperty.call(requestOptions.headers, "Content-Type")) {
        requestOptions.headers = Object.assign(Object.assign({}, (requestOptions.headers || {})), { "Content-Type": "application/json" });
    }
    try {
        if (request.method.toUpperCase() != "GET") {
            const contentType = requestOptions.headers["Content-Type"];
            requestOptions = Object.assign(Object.assign({}, requestOptions), { method: request.method.toUpperCase(), body: compileBodyFetchWithContentType(contentType.toLowerCase(), request.payload) });
            if (contentType.toLowerCase() === "multipart/form-data") {
                delete requestOptions["headers"];
            }
        }
        const startFetchTime = performance.now();
        const res = await fetch(request.url, requestOptions);
        const duration = Math.round((performance.now() - startFetchTime) * 100) / 100;
        let data;
        try {
            data = await (0, response_parser_1.parseFetchResponse)(res, options === null || options === void 0 ? void 0 : options.responseType);
        }
        catch (_b) {
            // Fallback: try text
            try {
                data = await res.text();
            }
            catch (_c) {
                data = null;
            }
        }
        if (!res.ok) {
            return responseFormat({
                ok: res.ok, duration, status: res.status, headers: res.headers,
                data: data, problem: res.statusText, originalError: res.statusText,
            });
        }
        return responseFormat({
            ok: res.ok, duration, status: res.status, headers: res.headers,
            data: data, problem: null, originalError: null,
        });
    }
    catch (error) {
        return responseFormat({
            ok: false, duration: 0, originalError: `${error}`,
            problem: `Error fetching data ${error}`, data: null, status: 500,
        });
    }
}
function removeNullValues(obj) {
    const result = {};
    for (const key in obj) {
        const value = obj[key];
        if (value !== null && value !== undefined) {
            if (typeof value === "object" && !Array.isArray(value)) {
                if (isFileOrBlob(value)) {
                    result[key] = value;
                }
                else {
                    result[key] = removeNullValues(value);
                }
            }
            else {
                result[key] = value;
            }
        }
    }
    return result;
}
/**
 * Duck-type check for File/Blob-like objects.
 * Uses property checks only - no hardcoded constructor names.
 */
function isFileOrBlob(value) {
    var _a, _b;
    if (!value || typeof value !== 'object')
        return false;
    const v = value;
    // File-like: has name (string) + lastModified (number)
    const hasFileProps = typeof v.name === 'string' && typeof v.lastModified === 'number';
    // Blob-like: has size (number) + type (string) + stream/text function
    const hasBlobProps = typeof v.size === 'number' && typeof v.type === 'string'
        && (typeof v.stream === 'function' || typeof v.text === 'function');
    if (hasFileProps || hasBlobProps)
        return true;
    // Fallback: check constructor name and toString representation
    const ctorName = (_b = (_a = v.constructor) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '';
    const str = typeof v.toString === 'function' ? v.toString() : '';
    return ctorName === 'File' || ctorName === 'Blob'
        || str === '[object File]' || str === '[object Blob]';
}
function objectToFormData(payload, formData = new FormData(), parentKey = null) {
    if (parentKey === null) {
        payload = removeNullValues(payload);
    }
    for (const key in payload) {
        if (payload.hasOwnProperty(key)) {
            const value = payload[key];
            const formKey = parentKey ? `${parentKey}.${key}` : key;
            if (Array.isArray(value)) {
                value.forEach((subValue, index) => {
                    if (isFileOrBlob(subValue)) {
                        formData.append(`${formKey}[${index}]`, subValue);
                    }
                    else if (typeof subValue === "object" && subValue !== null) {
                        objectToFormData(subValue, formData, `${formKey}[${index}]`);
                    }
                    else {
                        formData.append(`${formKey}[${index}]`, String(subValue));
                    }
                });
            }
            else if (isFileOrBlob(value)) {
                formData.append(formKey, value);
            }
            else if (typeof value === "object" && value !== null) {
                objectToFormData(value, formData, formKey);
            }
            else {
                formData.append(formKey, String(value));
            }
        }
    }
    return formData;
}
