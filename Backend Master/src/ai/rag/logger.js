"use strict";

// Mirrors src/ai/mcp/logger.js: a thin namespaced wrapper around the
// kernel's shared logger, not a new logging implementation.
const { withNamespace } = require("../utils/logger");

function createRagLogger(subsystem) {
  return withNamespace(`rag:${subsystem}`);
}

module.exports = { createRagLogger };
