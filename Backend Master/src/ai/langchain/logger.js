"use strict";

// Mirrors src/ai/mcp/logger.js and src/ai/rag/logger.js: a thin namespaced
// wrapper around the kernel's shared logger, not a new logging
// implementation.
const { withNamespace } = require("../utils/logger");

function createLangChainLogger(subsystem) {
  return withNamespace(`langchain:${subsystem}`);
}

module.exports = { createLangChainLogger };
