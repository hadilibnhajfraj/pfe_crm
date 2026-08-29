"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the LangChain.js integration layer.
class LangChainError extends AiError {}

class UnknownToolError extends LangChainError {
  constructor(name) {
    super(`No MCP tool named "${name}" is registered.`);
    this.tool = name;
  }
}

class PlanningError extends LangChainError {
  constructor(reason) {
    super(`Planner failed to produce a usable plan: ${reason}`);
  }
}

class RoutingError extends LangChainError {
  constructor(reason) {
    super(`Router failed to select a destination: ${reason}`);
  }
}

class WorkflowError extends LangChainError {
  constructor(stepName, cause) {
    super(`Workflow step "${stepName}" failed: ${(cause && cause.message) || cause}`);
    this.step = stepName;
    this.cause = cause;
  }
}

class ToolCallLimitExceededError extends LangChainError {
  constructor(limit) {
    super(`Tool-calling chain exceeded the maximum of ${limit} tool call(s) for a single run.`);
  }
}

module.exports = {
  LangChainError,
  UnknownToolError,
  PlanningError,
  RoutingError,
  WorkflowError,
  ToolCallLimitExceededError,
  NotConfiguredError,
  ConfigurationError,
};
