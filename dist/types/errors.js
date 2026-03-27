"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.TLSError = exports.AuthenticationError = exports.MalformedResponseError = exports.RedirectError = exports.NetworkError = exports.TimeoutError = exports.HTTPError = void 0;
class HTTPError extends Error {
    constructor(message, status, data) {
        super(message);
        this.status = status;
        this.data = data;
        // Ensure proper prototype chain
        Object.setPrototypeOf(this, HTTPError.prototype);
    }
}
exports.HTTPError = HTTPError;
class TimeoutError extends HTTPError {
    constructor(message = 'timeout') {
        super(message, 408); // HTTP 408 Request Timeout
        Object.setPrototypeOf(this, TimeoutError.prototype);
    }
}
exports.TimeoutError = TimeoutError;
class NetworkError extends HTTPError {
    constructor(message = 'Network error occurred') {
        super(message, 503); // HTTP 503 Service Unavailable
        Object.setPrototypeOf(this, NetworkError.prototype);
    }
}
exports.NetworkError = NetworkError;
class RedirectError extends HTTPError {
    constructor(message = 'Maximum redirects exceeded') {
        super(message, 310); // HTTP 310 Too many redirects
        Object.setPrototypeOf(this, RedirectError.prototype);
    }
}
exports.RedirectError = RedirectError;
class MalformedResponseError extends HTTPError {
    constructor(message = 'Malformed response') {
        super(message, 500); // HTTP 500 Internal Server Error
        Object.setPrototypeOf(this, MalformedResponseError.prototype);
    }
}
exports.MalformedResponseError = MalformedResponseError;
class AuthenticationError extends HTTPError {
    constructor(message = 'Authentication failed') {
        super(message, 401); // HTTP 401 Unauthorized
        Object.setPrototypeOf(this, AuthenticationError.prototype);
    }
}
exports.AuthenticationError = AuthenticationError;
class TLSError extends HTTPError {
    constructor(message = 'TLS/SSL error occurred') {
        super(message, 525); // HTTP 525 SSL Handshake Failed
        Object.setPrototypeOf(this, TLSError.prototype);
    }
}
exports.TLSError = TLSError;
