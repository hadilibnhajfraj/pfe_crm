"use strict";

const { PassThrough } = require("stream");
const { StdioTransport } = require("../src/ai/mcp/server/stdioTransport");

function collectWrites(stream) {
  const chunks = [];
  stream.on("data", (chunk) => chunks.push(chunk.toString("utf8")));
  return chunks;
}

describe("StdioTransport", () => {
  test("parses a newline-delimited JSON-RPC message from input", (done) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });

    transport.start((message, parseError) => {
      expect(parseError).toBeNull();
      expect(message).toEqual({ jsonrpc: "2.0", id: 1, method: "ping" });
      done();
    });

    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
  });

  test("reports a parse error for an unparsable line instead of crashing", (done) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });

    transport.start((message, parseError) => {
      expect(message).toBeNull();
      expect(parseError).toBeInstanceOf(Error);
      done();
    });

    input.write("{ not valid json\n");
  });

  test("ignores blank lines", (done) => {
    const input = new PassThrough();
    const output = new PassThrough();
    const transport = new StdioTransport({ input, output });
    const received = [];

    transport.start((message) => {
      received.push(message);
      if (received.length === 1) {
        expect(received[0].method).toBe("ping");
        done();
      }
    });

    input.write("\n");
    input.write("   \n");
    input.write(`${JSON.stringify({ jsonrpc: "2.0", id: 1, method: "ping" })}\n`);
  });

  test("send() writes one JSON message per line to output", () => {
    const input = new PassThrough();
    const output = new PassThrough();
    const chunks = collectWrites(output);
    const transport = new StdioTransport({ input, output });

    transport.send({ jsonrpc: "2.0", id: 1, result: {} });

    expect(chunks.join("")).toBe(`${JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} })}\n`);
  });
});
