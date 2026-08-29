"use strict";

// Thin namespaced wrapper around the project's existing logger
// (src/utils/logger.js) — the AI kernel does not introduce a second logging
// convention, it only prefixes messages so they're greppable independently.
//
// Every message/arg is passed through secretRedaction.js before it ever
// reaches the base logger — "protection des secrets" applied ONCE, here,
// rather than trusted to every individual `logger.warn(...)` call site
// across mcp/, rag/, langchain/, orchestrator/, agents/, memory/,
// automations/, dashboard/ and security/ itself.

const baseLogger = require("../../utils/logger");
const { redact } = require("./secretRedaction");

function withNamespace(namespace) {
  const prefix = `[ai:${namespace}]`;
  return {
    error: (message, ...args) => baseLogger.error(`${prefix} ${redact(message)}`, ...args.map((arg) => redact(arg))),
    warn: (message, ...args) => baseLogger.warn(`${prefix} ${redact(message)}`, ...args.map((arg) => redact(arg))),
    info: (message, ...args) => baseLogger.info(`${prefix} ${redact(message)}`, ...args.map((arg) => redact(arg))),
  };
}

module.exports = { withNamespace };
