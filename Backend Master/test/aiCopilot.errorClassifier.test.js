"use strict";

// Unit tests for the classifier that fixed the "Le Copilot IA n'est pas
// configuré côté serveur" shown for a REAL SequelizeDatabaseError (missing
// "dateExpiration" column — see
// AI-Business-Copilot/07_INCIDENT_COPILOT_DATEEXPIRATION.md). Each family
// is tested against the REAL error class it's meant to recognise — never a
// plain object shaped to look like one.

const { Sequelize } = require("sequelize");
const { AI_COPILOT_ERROR, classifyAiCopilotError } = require("../src/modules/ai-copilot/services/errorClassifier");
const { NotConfiguredError } = require("../src/ai/utils/errors");
const { OrchestratorPermissionError } = require("../src/ai/orchestrator/errors");
const { PermissionDeniedError, ToolExecutionError, ToolNotFoundError, ToolValidationError } = require("../src/ai/mcp/errors");

describe("classifyAiCopilotError — the two families actually reachable through this bug (ÉTAPE 1-6)", () => {
  test("NotConfiguredError -> AI_PROVIDER_NOT_CONFIGURED, 503", () => {
    const result = classifyAiCopilotError(new NotConfiguredError("ILlmProvider adapter"));
    expect(result).toEqual({ code: AI_COPILOT_ERROR.PROVIDER_NOT_CONFIGURED, status: 503, message: "Le Copilot IA n'est pas configuré côté serveur." });
  });

  test("a real Sequelize.DatabaseError (e.g. a missing column) -> AI_DATABASE_ERROR, 500 — NEVER the provider-not-configured message", () => {
    const dbError = new Sequelize.DatabaseError(new Error('column "dateExpiration" does not exist'));
    const result = classifyAiCopilotError(dbError);
    expect(result.code).toBe(AI_COPILOT_ERROR.DATABASE_ERROR);
    expect(result.status).toBe(500);
    expect(result.message).not.toMatch(/configuré/i);
    expect(result.message).not.toContain("dateExpiration");
  });

  test("other real Sequelize.BaseError subclasses (ForeignKeyConstraintError, UniqueConstraintError) also classify as AI_DATABASE_ERROR", () => {
    expect(classifyAiCopilotError(new Sequelize.ForeignKeyConstraintError({})).code).toBe(AI_COPILOT_ERROR.DATABASE_ERROR);
    expect(classifyAiCopilotError(new Sequelize.UniqueConstraintError({})).code).toBe(AI_COPILOT_ERROR.DATABASE_ERROR);
  });

  test("a Sequelize timeout (pool exhausted / slow connection) -> AI_TIMEOUT, distinct from a generic database error", () => {
    const result = classifyAiCopilotError(new Sequelize.TimeoutError(new Error("query timed out")));
    expect(result.code).toBe(AI_COPILOT_ERROR.TIMEOUT);
    expect(result.code).not.toBe(AI_COPILOT_ERROR.DATABASE_ERROR);
  });

  test("a plain network ETIMEDOUT error also classifies as AI_TIMEOUT", () => {
    const err = new Error("connect ETIMEDOUT");
    err.code = "ETIMEDOUT";
    expect(classifyAiCopilotError(err).code).toBe(AI_COPILOT_ERROR.TIMEOUT);
  });

  test("a genuinely unexpected error (a plain bug) -> AI_INTERNAL_ERROR, 500, generic message", () => {
    const result = classifyAiCopilotError(new TypeError("Cannot read property 'x' of undefined"));
    expect(result).toEqual({ code: AI_COPILOT_ERROR.INTERNAL_ERROR, status: 500, message: "Internal server error" });
  });
});

// These two are real classes of this kernel but not proven reachable
// through this controller's current call sites (see errorClassifier.js's
// own header comment) — tested here as a correct, defensive mapping,
// not claimed as an exercised production path.
describe("classifyAiCopilotError — defensive mappings for real (not yet proven reachable) error types", () => {
  test("OrchestratorPermissionError -> AI_PERMISSION_DENIED, 403", () => {
    const result = classifyAiCopilotError(new OrchestratorPermissionError("commercial_agent", "user"));
    expect(result.code).toBe(AI_COPILOT_ERROR.PERMISSION_DENIED);
    expect(result.status).toBe(403);
  });

  test("mcp PermissionDeniedError -> AI_PERMISSION_DENIED, 403", () => {
    const result = classifyAiCopilotError(new PermissionDeniedError("list_projects", "user"));
    expect(result.code).toBe(AI_COPILOT_ERROR.PERMISSION_DENIED);
    expect(result.status).toBe(403);
  });

  test("ToolExecutionError/ToolNotFoundError/ToolValidationError -> AI_TOOL_ERROR", () => {
    expect(classifyAiCopilotError(new ToolExecutionError("list_projects", new Error("boom"))).code).toBe(AI_COPILOT_ERROR.TOOL_ERROR);
    expect(classifyAiCopilotError(new ToolNotFoundError("unknown_tool")).code).toBe(AI_COPILOT_ERROR.TOOL_ERROR);
    expect(classifyAiCopilotError(new ToolValidationError("list_projects", "bad input")).code).toBe(AI_COPILOT_ERROR.TOOL_ERROR);
  });
});

describe("classifyAiCopilotError — never leaks internal detail", () => {
  test("none of the 6 classified messages ever include the raw err.message", () => {
    const secretish = "column \"dateExpiration\" does not exist — table project_devis, host db-prod-01";
    const cases = [
      new NotConfiguredError("x"),
      new Sequelize.DatabaseError(new Error(secretish)),
      new Sequelize.TimeoutError(new Error(secretish)),
      new OrchestratorPermissionError("a", "b"),
      new ToolExecutionError("t", new Error(secretish)),
      new TypeError(secretish),
    ];
    for (const err of cases) {
      const { message } = classifyAiCopilotError(err);
      expect(message).not.toContain("db-prod-01");
      expect(message).not.toContain("project_devis");
    }
  });

  test("every code is a stable string constant from AI_COPILOT_ERROR — never an ad-hoc string", () => {
    expect(Object.values(AI_COPILOT_ERROR)).toEqual([
      "AI_PROVIDER_NOT_CONFIGURED",
      "AI_DATABASE_ERROR",
      "AI_PERMISSION_DENIED",
      "AI_TOOL_ERROR",
      "AI_TIMEOUT",
      "AI_INTERNAL_ERROR",
    ]);
  });
});
