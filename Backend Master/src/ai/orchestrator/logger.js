"use strict";

// Mirrors src/ai/mcp/logger.js, src/ai/rag/logger.js and
// src/ai/langchain/logger.js: a thin namespaced wrapper around the kernel's
// shared logger, not a new logging implementation.
const { withNamespace } = require("../utils/logger");

function createOrchestratorLogger(subsystem) {
  return withNamespace(`orchestrator:${subsystem}`);
}

module.exports = { createOrchestratorLogger };
