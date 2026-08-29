"use strict";

const { AiError } = require("../utils/errors");
const { ErrorCodes } = require("./jsonRpc");

// Base class for every error the MCP server itself raises — carries a
// JSON-RPC error code so ErrorHandler can turn it into a spec-compliant
// response without guessing.
class McpError extends AiError {
  constructor(code, message, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

class ToolNotFoundError extends McpError {
  constructor(name) {
    super(ErrorCodes.TOOL_NOT_FOUND, `Tool "${name}" is not registered.`);
  }
}

class PermissionDeniedError extends McpError {
  constructor(name, role) {
    super(ErrorCodes.PERMISSION_DENIED, `Role "${role}" is not allowed to call tool "${name}".`);
  }
}

class ToolValidationError extends McpError {
  constructor(name, details) {
    super(ErrorCodes.VALIDATION_ERROR, `Invalid input for tool "${name}": ${details}`);
  }
}

class ToolExecutionError extends McpError {
  // Deliberately does NOT interpolate cause.message into the client-facing
  // message — an unexpected error inside a tool (e.g. a raw DB error) must
  // never leak its detail over the wire (see ErrorHandler, which applies
  // the same rule to any other unknown error). `cause` is kept only for
  // server-side logging (ErrorHandler._log logs the full McpError, and
  // `cause` travels with it via the `err` argument at the call site).
  constructor(name, cause) {
    super(ErrorCodes.TOOL_EXECUTION_ERROR, `Tool "${name}" failed to execute.`);
    this.cause = cause;
  }
}

module.exports = {
  McpError,
  ToolNotFoundError,
  PermissionDeniedError,
  ToolValidationError,
  ToolExecutionError,
};
