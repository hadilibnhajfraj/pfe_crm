"use strict";

const { AiError, NotConfiguredError, ConfigurationError } = require("../utils/errors");

// Typed errors for the memory subsystem (src/ai/memory). Mirrors the rest
// of the kernel: a base class per subsystem, plus its specific failure
// modes.
class MemoryError extends AiError {}

// Thrown by RedisKeyValueStore when asked to do anything before connect()
// has resolved — fails closed rather than silently no-op'ing against a
// socket that was never opened (see redis/redisClient.js).
class MemoryNotConnectedError extends MemoryError {
  constructor(operation) {
    super(`Cannot perform "${operation}": the Redis client is not connected. Call pipeline.connect() first.`);
  }
}

module.exports = { MemoryError, MemoryNotConnectedError, NotConfiguredError, ConfigurationError };
