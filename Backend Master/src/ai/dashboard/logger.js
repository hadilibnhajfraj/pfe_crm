"use strict";

// Mirrors every other subsystem's logger.js (mcp/, rag/, langchain/,
// orchestrator/, agents/, memory/, automations/): a thin namespaced wrapper
// around the kernel's shared logger, not a new logging implementation.
const { withNamespace } = require("../utils/logger");

function createDashboardLogger(domain) {
  return withNamespace(`dashboard:${domain}`);
}

module.exports = { createDashboardLogger };
