"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the orchestration layer (src/ai/orchestrator) — the
// component that composes MCP + RAG + LangChain into one conversation turn.
class OrchestratorError extends AiError {}

class IntentDetectionError extends OrchestratorError {
  constructor(reason) {
    super(`IntentDetector failed to classify the message: ${reason}`);
  }
}

// Mirrors agents/errors.js::AgentPermissionError — thrown by AIManager right
// after intent detection when the intent declares requiredRoles/allowedEmails
// (utils/authorization.js::isAuthorized) that actingUser doesn't satisfy.
// Never echoes the message itself, only the intent name and role — same
// "safe to show the client" discipline as every other typed AiError here.
class OrchestratorPermissionError extends OrchestratorError {
  constructor(intentName, role) {
    super(`Role "${role || "anonymous"}" is not allowed to use intent "${intentName}".`);
  }
}

module.exports = {
  OrchestratorError,
  IntentDetectionError,
  OrchestratorPermissionError,
  NotConfiguredError,
  ConfigurationError,
};
