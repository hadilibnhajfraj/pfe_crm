"use strict";

const { ConfigurationError } = require("../utils/errors");
const { createMcpLogger } = require("./logger");

const logger = createMcpLogger("tool-loader");

const REQUIRED_TOOL_MEMBERS = ["name", "description", "inputSchema", "execute"];

// Explicit, auditable registration only — deliberately NOT a filesystem
// auto-discovery mechanism (e.g. "require every file in tools/"). A CRM
// that already flagged an unauthenticated notification endpoint as a P0
// security finding (see AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §2,
// §14) must not silently expose every file dropped into a folder as a
// callable tool — the manifest of what's exposed has to be reviewable in a
// diff. Each factory is a zero-arg function returning a fresh ITool
// instance (see src/ai/mcp/tools/index.js for the manifest).
class ToolLoader {
  constructor(toolFactories = []) {
    this._toolFactories = toolFactories;
  }

  loadInto(toolRegistry) {
    for (const factory of this._toolFactories) {
      const tool = this._build(factory);
      toolRegistry.register(tool);
      logger.info(`registered tool "${tool.name}"`);
    }
    return toolRegistry;
  }

  _build(factory) {
    if (typeof factory !== "function") {
      throw new ConfigurationError("Tool factory must be a function returning an ITool instance.");
    }
    const tool = factory();
    this._assertValidTool(tool);
    return tool;
  }

  _assertValidTool(tool) {
    for (const member of REQUIRED_TOOL_MEMBERS) {
      if (tool[member] === undefined) {
        throw new ConfigurationError(`Tool is missing required member "${member}".`);
      }
    }
  }
}

module.exports = { ToolLoader };
