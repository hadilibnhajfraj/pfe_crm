"use strict";

// Mirrors every other subsystem's logger.js (mcp/, rag/, langchain/,
// orchestrator/, agents/, memory/, automations/, dashboard/): a thin
// namespaced wrapper around the kernel's shared logger — which itself now
// redacts secrets (see utils/logger.js + utils/secretRedaction.js), so
// every security log line benefits from that same protection.
const { withNamespace } = require("../utils/logger");

function createSecurityLogger(subsystem) {
  return withNamespace(`security:${subsystem}`);
}

module.exports = { createSecurityLogger };
