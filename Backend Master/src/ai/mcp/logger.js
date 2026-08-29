"use strict";

// The MCP server's Logger component. Deliberately not a new logging
// implementation: it delegates to the kernel's shared namespaced logger
// (src/ai/utils/logger.js), and simply gives every MCP subsystem its own
// sub-namespace (mcp:server, mcp:permission, mcp:validation, ...) so log
// lines stay greppable per component.
const { withNamespace } = require("../utils/logger");

function createMcpLogger(subsystem) {
  return withNamespace(`mcp:${subsystem}`);
}

module.exports = { createMcpLogger };
