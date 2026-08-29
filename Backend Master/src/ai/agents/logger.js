"use strict";

// Mirrors src/ai/mcp/logger.js, rag/logger.js, langchain/logger.js and
// orchestrator/logger.js: a thin namespaced wrapper around the kernel's
// shared logger, not a new logging implementation.
const { withNamespace } = require("../utils/logger");

function createAgentLogger(agentName) {
  return withNamespace(`agent:${agentName}`);
}

module.exports = { createAgentLogger };
