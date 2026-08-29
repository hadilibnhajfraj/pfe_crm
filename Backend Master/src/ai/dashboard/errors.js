"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the AI Dashboard subsystem (src/ai/dashboard).
class DashboardError extends AiError {}

// Thrown when a DomainAnalyzer tries to call a Tool outside its own
// declared dataSources — same "outils autorisés" discipline as
// agents/baseAgent.js and automations/baseAutomation.js.
class UnknownAnalyzerToolError extends DashboardError {
  constructor(domain, toolName) {
    super(`Domain analyzer "${domain}" is not allowed to call Tool "${toolName}".`);
  }
}

// Thrown by DomainAnalyzer.analyze() BEFORE any Tool is called — mirrors
// AgentPermissionError/AutomationPermissionError: a caller unauthorized to
// view this domain's analysis at all must get a real, visible denial.
class DashboardPermissionError extends DashboardError {
  constructor(domain, role) {
    super(`Role "${role}" is not allowed to view the "${domain}" domain analysis.`);
  }
}

module.exports = {
  DashboardError,
  UnknownAnalyzerToolError,
  DashboardPermissionError,
  NotConfiguredError,
  ConfigurationError,
};
