"use strict";

const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { ErrorCodes } = require("../src/ai/mcp/jsonRpc");
const { ToolNotFoundError, PermissionDeniedError } = require("../src/ai/mcp/errors");

describe("ErrorHandler.toResponse", () => {
  const handler = new ErrorHandler();

  test("maps an McpError to its own code/message, with data", () => {
    const err = new ToolNotFoundError("ghost_tool");
    const response = handler.toResponse("req-1", err);
    expect(response).toEqual({
      jsonrpc: "2.0",
      id: "req-1",
      error: { code: ErrorCodes.TOOL_NOT_FOUND, message: err.message },
    });
  });

  test("maps a PermissionDeniedError to PERMISSION_DENIED", () => {
    const response = handler.toResponse("req-2", new PermissionDeniedError("t", "user"));
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
  });

  test('maps the CRM service convention throw {status:403,...} to PERMISSION_DENIED', () => {
    const response = handler.toResponse("req-3", { status: 403, message: "Vous ne pouvez accéder qu'à vos propres demandes" });
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect(response.error.message).toBe("Vous ne pouvez accéder qu'à vos propres demandes");
  });

  test("maps {status:404,...} to a client-visible not-found code, not INTERNAL_ERROR", () => {
    const response = handler.toResponse("req-4", { status: 404, message: "Demande introuvable" });
    expect(response.error.code).not.toBe(ErrorCodes.INTERNAL_ERROR);
    expect(response.error.message).toBe("Demande introuvable");
  });

  test("maps other 4xx {status,...} to INVALID_PARAMS", () => {
    const response = handler.toResponse("req-5", { status: 400, message: "Champ manquant" });
    expect(response.error.code).toBe(ErrorCodes.INVALID_PARAMS);
  });

  test("maps a {status:500,...} to INTERNAL_ERROR but keeps the message (already CRM-authored, safe)", () => {
    const response = handler.toResponse("req-6", { status: 500, message: "Erreur serveur" });
    expect(response.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
  });

  test("never leaks a bare Error's stack/message — generic INTERNAL_ERROR text only", () => {
    const response = handler.toResponse("req-7", new Error("password=hunter2 leaked in stack"));
    expect(response.error.code).toBe(ErrorCodes.INTERNAL_ERROR);
    expect(response.error.message).toBe("Internal server error");
    expect(JSON.stringify(response)).not.toContain("hunter2");
  });

  test("handles a completely unexpected thrown value (string, undefined) without throwing itself", () => {
    expect(() => handler.toResponse("req-8", "oops")).not.toThrow();
    expect(() => handler.toResponse("req-9", undefined)).not.toThrow();
    expect(handler.toResponse("req-8", "oops").error.code).toBe(ErrorCodes.INTERNAL_ERROR);
  });
});
