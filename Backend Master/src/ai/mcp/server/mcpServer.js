"use strict";

const { ErrorCodes, successResponse } = require("../jsonRpc");
const { McpError, ToolNotFoundError, ToolExecutionError } = require("../errors");
const { describeJoiSchema } = require("../schemaDescriptor");
const { createMcpLogger } = require("../logger");
const { defaultRateLimitKey } = require("../../security");

const logger = createMcpLogger("server");

// The MCP protocol version this server speaks (date-versioned, per the MCP
// spec convention).
const PROTOCOL_VERSION = "2025-06-18";

/**
 * Orchestrates the MCP JSON-RPC methods (initialize, ping, tools/list,
 * tools/call) against injected collaborators — ToolRegistry (reused as-is
 * from ../../tools, not recreated), PermissionManager, ValidationManager,
 * ErrorHandler. Depends only on those abstractions (constructor injection,
 * SOLID-DIP); knows nothing about stdio, HTTP, or any concrete tool.
 *
 * `handleMessage()` is the pure, transport-agnostic protocol core — it
 * takes one raw JSON-RPC message and resolves to a response object (or
 * null for a notification, which must never receive a reply). `listen()`
 * is the only method that touches a transport, and it's a thin adapter
 * over `handleMessage()`.
 *
 * `rateLimiter`/`auditLog` (security/rateLimiter.js, security/auditLog.js)
 * are OPTIONAL — every existing construction site (mcp/server/start.js, all
 * of test/ai.mcp.*.test.js) keeps working unchanged without them. When
 * provided, EVERY `tools/call` — conversational, Agent, Automation or
 * Dashboard, since they all funnel through this one `handleMessage()` — is
 * rate-limited per `{actingUser, tool}` and recorded to the audit trail
 * (denied-by-permission, denied-by-rate-limit, success, failure). This is
 * the single highest-leverage integration point in the whole kernel for
 * "limitation des appels"/"audit": one change here covers every caller.
 */
class McpServer {
  constructor({ name, version, toolRegistry, permissionManager, validationManager, errorHandler, rateLimiter = null, auditLog = null }) {
    this.name = name;
    this.version = version;
    this.toolRegistry = toolRegistry;
    this.permissionManager = permissionManager;
    this.validationManager = validationManager;
    this.errorHandler = errorHandler;
    this.rateLimiter = rateLimiter;
    this.auditLog = auditLog;
  }

  listen(transport) {
    transport.start((message, parseError) => {
      if (parseError) {
        transport.send(this.errorHandler.toResponse(null, new McpError(ErrorCodes.PARSE_ERROR, "Parse error")));
        return;
      }
      this.handleMessage(message).then((response) => {
        if (response) transport.send(response);
      });
    });
    logger.info(`${this.name}@${this.version} listening`);
  }

  async handleMessage(rawMessage) {
    let request;
    try {
      request = this.validationManager.validateEnvelope(rawMessage);
    } catch (err) {
      // A malformed envelope may not even have a usable id — best effort.
      const id = rawMessage && typeof rawMessage === "object" ? rawMessage.id : undefined;
      return this.errorHandler.toResponse(id, err);
    }

    const { id, method, params } = request;
    const isNotification = id === undefined;

    try {
      const result = await this._dispatch(method, params || {});
      return isNotification ? null : successResponse(id, result);
    } catch (err) {
      return isNotification ? null : this.errorHandler.toResponse(id, err);
    }
  }

  async _dispatch(method, params) {
    switch (method) {
      case "initialize":
        return this._handleInitialize();
      case "ping":
        return {};
      case "tools/list":
        return this._handleToolsList();
      case "tools/call":
        return this._handleToolsCall(params);
      default:
        throw new McpError(ErrorCodes.METHOD_NOT_FOUND, `Unknown method "${method}"`);
    }
  }

  _handleInitialize() {
    return {
      protocolVersion: PROTOCOL_VERSION,
      serverInfo: { name: this.name, version: this.version },
      capabilities: { tools: {} },
    };
  }

  _handleToolsList() {
    return {
      tools: this.toolRegistry.list().map((tool) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: describeJoiSchema(tool.inputSchema),
      })),
    };
  }

  async _handleToolsCall(params) {
    const { name, arguments: args, actingUser } = params || {};
    if (!name || typeof name !== "string") {
      throw new McpError(ErrorCodes.INVALID_PARAMS, '"name" is required and must be a string.');
    }

    const tool = this.toolRegistry.get(name);
    if (!tool) throw new ToolNotFoundError(name);

    // Order matters: identity/authorization is checked BEFORE business
    // input validation, so an unauthorized caller never learns anything
    // about a tool's input contract from a validation error message.
    try {
      this.validationManager.validateActingUser(actingUser);
      this.permissionManager.assertCanCall(tool, actingUser);
    } catch (err) {
      await this._audit({ actor: actingUser, action: "tools/call", resource: name, outcome: "denied", metadata: { reason: err.message } });
      throw err;
    }

    // Rate limiting runs AFTER permission (an unauthorized caller shouldn't
    // burn a legitimate caller's budget or learn anything from timing), but
    // BEFORE input validation/execution — consuming a call's budget for
    // input this server is about to reject anyway would be wasteful.
    if (this.rateLimiter) {
      try {
        await this.rateLimiter.consume(defaultRateLimitKey({ actingUser, action: name }));
      } catch (err) {
        await this._audit({ actor: actingUser, action: "tools/call", resource: name, outcome: "denied", metadata: { reason: "rate_limited" } });
        throw err;
      }
    }

    const validatedInput = this.validationManager.validateToolInput(tool, args);

    try {
      const output = await tool.execute(validatedInput, { actingUser });
      await this._audit({ actor: actingUser, action: "tools/call", resource: name, outcome: "success" });
      return { content: [{ type: "text", text: JSON.stringify(output) }], isError: false };
    } catch (err) {
      await this._audit({ actor: actingUser, action: "tools/call", resource: name, outcome: "failure", metadata: { reason: err.message } });
      if (err instanceof McpError) throw err;
      // CRM service convention: `throw { status, message }` (see e.g.
      // hrRequest.service.js assertOwnership()). Rethrow as-is so
      // ErrorHandler.toResponse() classifies it by status (403 -> PERMISSION_
      // DENIED, 404 -> not-found, ...) instead of collapsing every business
      // error into a generic TOOL_EXECUTION_ERROR.
      if (err && typeof err === "object" && typeof err.status === "number") throw err;
      throw new ToolExecutionError(name, err);
    }
  }

  // Never lets an audit-logging failure (store unavailable, ...) mask or
  // crash the real tool-call outcome — a no-op when `auditLog` wasn't
  // provided, and a logged warning (never a throw) if it was but failed.
  async _audit(event) {
    if (!this.auditLog) return;
    try {
      await this.auditLog.record(event);
    } catch (err) {
      logger.warn(`audit log recording failed: ${err.message}`);
    }
  }
}

module.exports = { McpServer, PROTOCOL_VERSION };
