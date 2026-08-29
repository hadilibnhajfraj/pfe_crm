"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: how the MCP server receives/sends JSON-RPC messages. The stdio
// adapter (StdioTransport) is the one concrete implementation shipped here
// — an HTTP/SSE adapter can be added later behind this same port without
// touching McpServer at all (Dependency Inversion).
class IServerTransport {
  start(_onMessage) {
    throw new NotImplementedError("IServerTransport", "start");
  }

  send(_message) {
    throw new NotImplementedError("IServerTransport", "send");
  }

  close() {
    throw new NotImplementedError("IServerTransport", "close");
  }
}

module.exports = { IServerTransport };
