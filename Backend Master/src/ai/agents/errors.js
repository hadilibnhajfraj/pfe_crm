"use strict";

const { AiError, ConfigurationError } = require("../utils/errors");

// Typed errors for concrete Agents (src/ai/agents). Mirrors the rest of the
// kernel: a base class per subsystem, plus the specific failure modes an
// Agent can hit.
class AgentError extends AiError {}

// Thrown by BaseAgent.execute() BEFORE any Chain/Tool runs — deliberately
// NOT caught into a graceful fallback answer (see BaseAgent._run's
// try/catch): an unauthorized caller must get a real, visible denial, the
// same "fails closed" rule PermissionDeniedError already enforces for MCP
// Tools (see mcp/errors.js) — see utils/authorization.js for the shared
// role-or-email predicate both delegate to.
class AgentPermissionError extends AgentError {
  constructor(agentName, role) {
    super(`Role "${role}" is not allowed to invoke agent "${agentName}".`);
    this.agent = agentName;
    this.role = role;
  }
}

module.exports = { AgentError, AgentPermissionError, ConfigurationError };
