"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port only — no MCP transport/protocol client is implemented in this
// infrastructure pass (scope: "Ne développer aucun MCP", see
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md).
class IMcpClient {
  async connect(_serverConfig) {
    throw new NotImplementedError("IMcpClient", "connect");
  }

  async disconnect() {
    throw new NotImplementedError("IMcpClient", "disconnect");
  }

  async listTools() {
    throw new NotImplementedError("IMcpClient", "listTools");
  }

  async callTool(_name, _input) {
    throw new NotImplementedError("IMcpClient", "callTool");
  }
}

module.exports = { IMcpClient };
