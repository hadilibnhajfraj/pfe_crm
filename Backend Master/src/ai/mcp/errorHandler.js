"use strict";

const { ErrorCodes, errorResponse } = require("./jsonRpc");
const { McpError } = require("./errors");
const { RateLimitExceededError } = require("../security/errors");
const { createMcpLogger } = require("./logger");

const logger = createMcpLogger("error-handler");

// Converts ANY thrown value into a valid JSON-RPC 2.0 error response and
// never leaks a stack trace or internal detail to the client. Handles four
// shapes: our own McpError (already carries the right code),
// RateLimitExceededError (security/rateLimiter.js — its own message is
// already safe, see security/errors.js, but it isn't an McpError so it
// needs its own branch to avoid collapsing into a generic 500-shaped
// internal error), the existing CRM service convention `throw { status,
// message }` (see e.g. modules/hr-requests/services/hrRequest.service.js
// assertOwnership — not an Error instance), and anything else (bare Error,
// string, undefined...).
class ErrorHandler {
  toResponse(id, error) {
    if (error instanceof McpError) {
      this._log(error.code, error);
      return errorResponse(id, error.code, error.message, error.data);
    }

    if (error instanceof RateLimitExceededError) {
      this._log(ErrorCodes.RATE_LIMIT_EXCEEDED, error);
      return errorResponse(id, ErrorCodes.RATE_LIMIT_EXCEEDED, error.message);
    }

    if (error && typeof error === "object" && typeof error.status === "number") {
      const code = this._codeForHttpStatus(error.status);
      this._log(code, error);
      return errorResponse(id, code, error.message || "Request failed");
    }

    this._log(ErrorCodes.INTERNAL_ERROR, error);
    return errorResponse(id, ErrorCodes.INTERNAL_ERROR, "Internal server error");
  }

  _codeForHttpStatus(status) {
    if (status === 403) return ErrorCodes.PERMISSION_DENIED;
    if (status === 404) return ErrorCodes.TOOL_EXECUTION_ERROR;
    if (status >= 400 && status < 500) return ErrorCodes.INVALID_PARAMS;
    return ErrorCodes.INTERNAL_ERROR;
  }

  _log(code, error) {
    const message = (error && error.message) || String(error);
    if (code === ErrorCodes.INTERNAL_ERROR) {
      logger.error("unhandled error", error);
      return;
    }
    logger.warn(`handled error (code=${code}): ${message}`);
    // ToolExecutionError deliberately strips the cause from its
    // client-facing message (see mcp/errors.js) — log it here, server-side
    // only, so operators can still debug it.
    if (error && error.cause) {
      logger.warn("underlying cause (server-side only, never sent to the client):", error.cause);
    }
  }
}

module.exports = { ErrorHandler };
