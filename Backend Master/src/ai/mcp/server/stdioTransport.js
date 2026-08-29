"use strict";

const readline = require("readline");
const { IServerTransport } = require("./transport.interface");
const { createMcpLogger } = require("../logger");

const logger = createMcpLogger("stdio-transport");

// MCP's local transport: one JSON-RPC message per line on stdin/stdout,
// UTF-8, newline-terminated. No Content-Length framing — that's the LSP
// convention, not MCP's. `input`/`output` are injectable so tests never
// need to touch real process.stdin/stdout.
class StdioTransport extends IServerTransport {
  constructor({ input = process.stdin, output = process.stdout } = {}) {
    super();
    this._input = input;
    this._output = output;
    this._rl = null;
  }

  start(onMessage) {
    this._rl = readline.createInterface({ input: this._input, terminal: false });
    this._rl.on("line", (line) => {
      const trimmed = line.trim();
      if (!trimmed) return;
      try {
        onMessage(JSON.parse(trimmed), null);
      } catch (err) {
        logger.warn(`dropped unparsable line: ${err.message}`);
        onMessage(null, err);
      }
    });
  }

  send(message) {
    this._output.write(`${JSON.stringify(message)}\n`);
  }

  close() {
    if (this._rl) this._rl.close();
  }
}

module.exports = { StdioTransport };
