"use strict";

// Mirrors every other subsystem's logger.js (mcp/, rag/, langchain/,
// orchestrator/, agents/, memory/): a thin namespaced wrapper around the
// kernel's shared logger, not a new logging implementation.
const { withNamespace } = require("../utils/logger");

function createAutomationLogger(automationName) {
  return withNamespace(`automation:${automationName}`);
}

module.exports = { createAutomationLogger };
