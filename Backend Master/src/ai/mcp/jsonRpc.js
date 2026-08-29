"use strict";

// JSON-RPC 2.0 constants and message builders — the wire format MCP uses.
// Pure, stateless helpers; envelope *validation* lives in
// validationManager.js (Joi, consistent with the rest of the backend).

const JSON_RPC_VERSION = "2.0";

// -32768..-32000 is the JSON-RPC-reserved range; -32000..-32099 is the
// sub-range JSON-RPC explicitly leaves for implementation-defined errors,
// which is where our MCP/CRM-specific codes below live.
const ErrorCodes = Object.freeze({
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  TOOL_NOT_FOUND: -32001,
  PERMISSION_DENIED: -32002,
  VALIDATION_ERROR: -32003,
  TOOL_EXECUTION_ERROR: -32004,
  RATE_LIMIT_EXCEEDED: -32005,
});

function successResponse(id, result) {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

function errorResponse(id, code, message, data) {
  const error = { code, message };
  if (data !== undefined) error.data = data;
  return { jsonrpc: JSON_RPC_VERSION, id: id === undefined ? null : id, error };
}

module.exports = { JSON_RPC_VERSION, ErrorCodes, successResponse, errorResponse };
