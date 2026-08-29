"use strict";

// IMcpClient: the *client*-side port (for a future Copilot orchestrator to
// consume an external MCP server — see AiManager.mcpClient). Everything
// else below is this CRM acting as an MCP *server*, exposing its own
// capabilities to MCP clients. The two are deliberately independent: this
// barrel does not wire one into the other.
const { IMcpClient } = require("./mcpClient.interface");

const { McpServer, PROTOCOL_VERSION, IServerTransport, StdioTransport } = require("./server");
const { ToolLoader } = require("./toolLoader");
const { PermissionManager } = require("./permissionManager");
const { ValidationManager } = require("./validationManager");
const { ErrorHandler } = require("./errorHandler");
const { createMcpLogger } = require("./logger");
const { describeJoiSchema } = require("./schemaDescriptor");
const { JSON_RPC_VERSION, ErrorCodes, successResponse, errorResponse } = require("./jsonRpc");
const {
  McpError,
  ToolNotFoundError,
  PermissionDeniedError,
  ToolValidationError,
  ToolExecutionError,
} = require("./errors");

module.exports = {
  // Client-side port
  IMcpClient,
  // Server
  McpServer,
  PROTOCOL_VERSION,
  IServerTransport,
  StdioTransport,
  ToolLoader,
  PermissionManager,
  ValidationManager,
  ErrorHandler,
  createMcpLogger,
  describeJoiSchema,
  JSON_RPC_VERSION,
  ErrorCodes,
  successResponse,
  errorResponse,
  McpError,
  ToolNotFoundError,
  PermissionDeniedError,
  ToolValidationError,
  ToolExecutionError,
};
