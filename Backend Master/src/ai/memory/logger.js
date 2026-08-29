"use strict";

// Mirrors src/ai/mcp/logger.js, rag/logger.js, langchain/logger.js,
// orchestrator/logger.js and agents/logger.js: a thin namespaced wrapper
// around the kernel's shared logger, not a new logging implementation.
const { withNamespace } = require("../utils/logger");

function createMemoryLogger(subsystem) {
  return withNamespace(`memory:${subsystem}`);
}

module.exports = { createMemoryLogger };
