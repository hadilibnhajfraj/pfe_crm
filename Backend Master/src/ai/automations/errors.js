"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the automations subsystem (src/ai/automations).
class AutomationError extends AiError {}

// Thrown when an automation tries to call a Tool outside its own declared
// whitelist (see BaseAutomation._tool) — same "outils autorisés" discipline
// as agents/baseAgent.js, fails closed rather than silently widening scope.
class UnknownAutomationToolError extends AutomationError {
  constructor(automationName, toolName) {
    super(`Automation "${automationName}" is not allowed to call Tool "${toolName}".`);
  }
}

// Thrown by BaseAutomation.run() BEFORE any Tool is called — mirrors
// AgentPermissionError (agents/errors.js): a caller unauthorized to trigger
// this automation at all must get a real, visible denial, never a silently
// degraded report.
class AutomationPermissionError extends AutomationError {
  constructor(automationName, role) {
    super(`Role "${role}" is not allowed to run automation "${automationName}".`);
  }
}

module.exports = {
  AutomationError,
  UnknownAutomationToolError,
  AutomationPermissionError,
  NotConfiguredError,
  ConfigurationError,
};
