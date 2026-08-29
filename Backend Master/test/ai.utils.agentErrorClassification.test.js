"use strict";

// Unit tests for the agent-level error classification added while
// diagnosing "kpi_agent n'a pas pu traiter cette demande" (see
// AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md). Each family is tested
// against the REAL error class it's meant to recognise — never a plain
// object shaped to look like one — including through the ONE level of
// `WorkflowError` wrapping every ToolCallingChain failure actually goes
// through in production (see langchain/workflow/langChainWorkflowEngine.js).

const { Sequelize } = require("sequelize");
const { AGENT_ERROR, classifyAgentError } = require("../src/ai/utils/agentErrorClassification");
const { AgentError } = require("../src/ai/agents/errors");
const { PermissionDeniedError, ToolExecutionError, ToolNotFoundError, ToolValidationError } = require("../src/ai/mcp/errors");
const { LlmProviderAuthError, LlmProviderUnavailableError, LlmProviderTimeoutError, LlmProviderRequestError } = require("../src/ai/services/providers/errors");
const { WorkflowError } = require("../src/ai/langchain/errors");

describe("classifyAgentError — direct (unwrapped) errors", () => {
  test("PermissionDeniedError -> AI_PERMISSION_ERROR", () => {
    expect(classifyAgentError(new PermissionDeniedError("list_projects", "user"))).toBe(AGENT_ERROR.PERMISSION_ERROR);
  });

  test("ToolValidationError -> AI_VALIDATION_ERROR", () => {
    expect(classifyAgentError(new ToolValidationError("list_projects", "bad input"))).toBe(AGENT_ERROR.VALIDATION_ERROR);
  });

  test("ToolExecutionError/ToolNotFoundError -> AI_TOOL_ERROR", () => {
    expect(classifyAgentError(new ToolExecutionError("get_dashboard_kpis", new Error("boom")))).toBe(AGENT_ERROR.TOOL_ERROR);
    expect(classifyAgentError(new ToolNotFoundError("unknown_tool"))).toBe(AGENT_ERROR.TOOL_ERROR);
  });

  test("auth/unavailable/generic LlmProviderRequestError -> AI_LLM_ERROR", () => {
    expect(classifyAgentError(new LlmProviderAuthError("OpenAI"))).toBe(AGENT_ERROR.LLM_ERROR);
    expect(classifyAgentError(new LlmProviderUnavailableError("OpenAI"))).toBe(AGENT_ERROR.LLM_ERROR);
    expect(classifyAgentError(new LlmProviderRequestError("OpenAI"))).toBe(AGENT_ERROR.LLM_ERROR);
  });

  // AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md, étape 14 — un
  // timeout est distingué du reste de la famille LlmProviderRequestError
  // (auth/quota/indisponibilité) : opérationnellement différent (un
  // timeout suggère de raccourcir/simplifier la requête, pas seulement
  // réessayer plus tard). `LlmProviderTimeoutError extends
  // LlmProviderRequestError` — vérifie que la branche spécifique est bien
  // atteinte AVANT la branche générique dans classifyAgentError().
  test("LlmProviderTimeoutError -> AI_TIMEOUT_ERROR, jamais le AI_LLM_ERROR générique", () => {
    expect(classifyAgentError(new LlmProviderTimeoutError("OpenAI"))).toBe(AGENT_ERROR.TIMEOUT_ERROR);
  });

  test("a real Sequelize.DatabaseError -> AI_DATABASE_ERROR", () => {
    expect(classifyAgentError(new Sequelize.DatabaseError(new Error("column does not exist")))).toBe(AGENT_ERROR.DATABASE_ERROR);
  });

  test("a plain AgentError -> AI_AGENT_ERROR", () => {
    expect(classifyAgentError(new AgentError("kpi_agent needs a Tool it doesn't have"))).toBe(AGENT_ERROR.AGENT_ERROR);
  });

  // The ACTUAL root cause of AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md —
  // a plain JS TypeError (bad array destructuring), never a Sequelize/Tool/
  // LLM error. Confirms the classifier never leaves a real bug uncategorised.
  test("a generic TypeError (e.g. a destructuring bug) -> AI_AGENT_ERROR, never silently unclassified", () => {
    expect(classifyAgentError(new TypeError("object is not iterable (cannot read property Symbol(Symbol.iterator))"))).toBe(AGENT_ERROR.AGENT_ERROR);
  });
});

describe("classifyAgentError — unwraps WorkflowError.cause (the REAL shape every ToolCallingChain failure has in production)", () => {
  test("a WorkflowError wrapping a real LlmProviderUnavailableError (e.g. a live 429) classifies as AI_LLM_ERROR, not AI_AGENT_ERROR", () => {
    const cause = new LlmProviderUnavailableError("OpenAI");
    const wrapped = new WorkflowError("chain:tool_calling_chain", cause);
    expect(classifyAgentError(wrapped)).toBe(AGENT_ERROR.LLM_ERROR);
  });

  test("a WorkflowError wrapping a real LlmProviderTimeoutError classifies as AI_TIMEOUT_ERROR", () => {
    const cause = new LlmProviderTimeoutError("OpenAI");
    const wrapped = new WorkflowError("chain:tool_calling_chain", cause);
    expect(classifyAgentError(wrapped)).toBe(AGENT_ERROR.TIMEOUT_ERROR);
  });

  test("a WorkflowError wrapping a real Sequelize error classifies as AI_DATABASE_ERROR", () => {
    const cause = new Sequelize.DatabaseError(new Error("boom"));
    const wrapped = new WorkflowError("chain:tool_calling_chain", cause);
    expect(classifyAgentError(wrapped)).toBe(AGENT_ERROR.DATABASE_ERROR);
  });

  // mcpToolAdapter.js deliberately flattens every MCP-layer error
  // (PermissionDeniedError/ToolExecutionError/...) into a plain `Error`
  // BEFORE it reaches WorkflowError — documented, not a bug this file
  // introduces. A WorkflowError wrapping a plain Error (the real shape a
  // failed Tool call has today) correctly falls back to AI_AGENT_ERROR.
  test("a WorkflowError wrapping a plain Error (the real shape of a flattened MCP Tool failure today) falls back to AI_AGENT_ERROR", () => {
    const wrapped = new WorkflowError("chain:tool_calling_chain", new Error('Tool "get_dashboard_kpis" failed to execute.'));
    expect(classifyAgentError(wrapped)).toBe(AGENT_ERROR.AGENT_ERROR);
  });
});

describe("AGENT_ERROR — stable string constants", () => {
  test("exactly the 7 codes requested, never an ad-hoc string", () => {
    expect(Object.values(AGENT_ERROR)).toEqual([
      "AI_AGENT_ERROR",
      "AI_TOOL_ERROR",
      "AI_DATABASE_ERROR",
      "AI_PERMISSION_ERROR",
      "AI_VALIDATION_ERROR",
      "AI_LLM_ERROR",
      "AI_TIMEOUT_ERROR",
    ]);
  });
});
