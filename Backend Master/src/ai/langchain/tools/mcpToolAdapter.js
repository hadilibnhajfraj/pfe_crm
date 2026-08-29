"use strict";

const { DynamicStructuredTool } = require("@langchain/core/tools");
const { z } = require("zod");
const { createLangChainLogger } = require("../logger");

const logger = createLangChainLogger("tools");

// Deliberately a permissive passthrough object, not a schema mirroring each
// tool's Joi inputSchema field-by-field: real validation already happens
// inside ValidationManager (Joi) on every "tools/call" — see func() below,
// which always goes through McpServer.handleMessage(). Re-deriving the
// same rules in Zod here would just be a second, driftable source of
// truth for one validation rule (see AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md
// §10.1 "réutiliser, ne pas dupliquer").
const PASSTHROUGH_SCHEMA = z.record(z.string(), z.any()).default({});

/**
 * Wraps ONE MCP tool (from the 69-tool registry built in the MCP server
 * pass) as a LangChain DynamicStructuredTool. Every invocation is routed
 * through the real MCP server's JSON-RPC handling
 * (McpServer.handleMessage) — Permission Manager, Validation Manager and
 * Error Handler all run exactly as they do for any other MCP client, so
 * this adapter adds no parallel authorization logic of its own (plan §4.5:
 * "le Copilot agit toujours au nom de l'utilisateur connecté, jamais avec
 * des privilèges élevés"). `actingUser` is fixed at construction time —
 * every tool built from this adapter can only ever act as that one CRM
 * identity.
 */
function createMcpToolAdapter({ mcpServer, toolDescriptor, actingUser }) {
  let callSequence = 0;

  return new DynamicStructuredTool({
    name: toolDescriptor.name,
    description: toolDescriptor.description,
    schema: PASSTHROUGH_SCHEMA,
    func: async (input) => {
      callSequence += 1;
      const response = await mcpServer.handleMessage({
        jsonrpc: "2.0",
        id: `langchain-${toolDescriptor.name}-${callSequence}`,
        method: "tools/call",
        params: { name: toolDescriptor.name, arguments: input, actingUser },
      });

      if (response.error) {
        logger.warn(`tool "${toolDescriptor.name}" failed: ${response.error.message}`);
        throw new Error(response.error.message);
      }

      const [content] = (response.result && response.result.content) || [];
      return content ? content.text : "";
    },
  });
}

// Builds one LangChain tool per tool currently registered on `mcpServer`
// (call this after ToolLoader has populated its registry — see
// mcp/server/start.js::createServer()).
function createMcpToolAdapters({ mcpServer, actingUser }) {
  return mcpServer.toolRegistry.list().map((toolDescriptor) =>
    createMcpToolAdapter({ mcpServer, toolDescriptor, actingUser })
  );
}

module.exports = { createMcpToolAdapter, createMcpToolAdapters, PASSTHROUGH_SCHEMA };
