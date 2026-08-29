"use strict";

const { JSON_RPC_VERSION, ErrorCodes, successResponse, errorResponse } = require("../src/ai/mcp/jsonRpc");

describe("mcp/jsonRpc", () => {
  test("successResponse() builds a spec-compliant envelope", () => {
    expect(successResponse("req-1", { ok: true })).toEqual({
      jsonrpc: JSON_RPC_VERSION,
      id: "req-1",
      result: { ok: true },
    });
  });

  test("errorResponse() omits data when not provided", () => {
    const response = errorResponse("req-2", ErrorCodes.INVALID_PARAMS, "bad input");
    expect(response).toEqual({
      jsonrpc: JSON_RPC_VERSION,
      id: "req-2",
      error: { code: ErrorCodes.INVALID_PARAMS, message: "bad input" },
    });
    expect(response.error.data).toBeUndefined();
  });

  test("errorResponse() includes data when provided", () => {
    const response = errorResponse("req-3", ErrorCodes.TOOL_NOT_FOUND, "no such tool", { name: "x" });
    expect(response.error.data).toEqual({ name: "x" });
  });

  test("errorResponse() defaults id to null (JSON-RPC requirement when id is unknown)", () => {
    const response = errorResponse(undefined, ErrorCodes.PARSE_ERROR, "parse error");
    expect(response.id).toBeNull();
  });

  test("error codes stay within the JSON-RPC reserved/implementation-defined ranges", () => {
    Object.values(ErrorCodes).forEach((code) => {
      expect(code).toBeLessThanOrEqual(-32000);
      expect(code).toBeGreaterThanOrEqual(-32768);
    });
  });
});
