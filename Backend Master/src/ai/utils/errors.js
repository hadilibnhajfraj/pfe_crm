"use strict";

// Typed errors for the AI kernel (src/ai). Keeps failure modes explicit
// instead of throwing bare Error() from deep inside ports/adapters.

class AiError extends Error {
  constructor(message) {
    super(message);
    this.name = this.constructor.name;
  }
}

// Thrown by a port's default method body — signals "this is a contract
// only, no adapter has been wired for it yet" (agents/mcp/rag ports throw
// this unconditionally in this infrastructure pass).
class NotImplementedError extends AiError {
  constructor(portName, methodName) {
    super(`${portName}.${methodName}() has no adapter — this port is a contract only.`);
  }
}

// Thrown by the manager when a caller reaches a capability that depends on
// a runtime decision not yet made (e.g. LLM provider not chosen/configured).
class NotConfiguredError extends AiError {
  constructor(what) {
    super(`${what} is not configured. Set the required AI_* environment variables before use.`);
  }
}

class ConfigurationError extends AiError {}

module.exports = { AiError, NotImplementedError, NotConfiguredError, ConfigurationError };
