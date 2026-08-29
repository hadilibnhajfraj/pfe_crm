"use strict";

const { loadMemoryConfig } = require("./config");
const { createRedisClient } = require("./redis/redisClient");
const { RedisKeyValueStore } = require("./redis/redisKeyValueStore");
const { ShortTermMemory } = require("./shortTermMemory");
const { SessionMemory } = require("./sessionMemory");
const { ContextMemory } = require("./contextMemory");
const { LongTermMemory } = require("./longTermMemory");
const { PreferenceMemory } = require("./preferenceMemory");

/**
 * Composition root for the Redis-backed memory subsystem (mirrors
 * manager/index.js, rag/pipeline.js, langchain/pipeline.js and
 * orchestrator/pipeline.js): wires one Redis client + one
 * `RedisKeyValueStore` into the 5 requested memory components.
 *
 * Performs NO I/O by construction (same "inert until asked" discipline as
 * every other pipeline in this kernel — see `createRedisClient`) : the
 * returned `connect()`/`disconnect()` are the explicit, opt-in steps that
 * actually open/close the Redis socket. Pass your own already-connected
 * `client` (e.g. a single client shared with other subsystems) to skip
 * `createRedisClient` entirely — `connect()`/`disconnect()` stay safe to
 * call either way (no-op if already open/closed, via `client.isOpen`).
 */
function createRedisMemoryPipeline({ client = null, env = process.env } = {}) {
  const config = loadMemoryConfig(env);
  const redisClient = client || createRedisClient(env);
  const store = new RedisKeyValueStore({ client: redisClient, keyPrefix: config.keyPrefix });

  return {
    config,
    client: redisClient,
    store,
    shortTermMemory: new ShortTermMemory({ store, ttlSeconds: config.shortTerm.ttlSeconds, maxMessages: config.shortTerm.maxMessages }),
    sessionMemory: new SessionMemory({ store, ttlSeconds: config.session.ttlSeconds }),
    contextMemory: new ContextMemory({ store, ttlSeconds: config.context.ttlSeconds }),
    longTermMemory: new LongTermMemory({ store, ttlSeconds: config.longTerm.ttlSeconds }),
    preferenceMemory: new PreferenceMemory({ store, ttlSeconds: config.preference.ttlSeconds }),

    async connect() {
      if (!redisClient.isOpen) await redisClient.connect();
      return redisClient;
    },

    async disconnect() {
      if (redisClient.isOpen) await redisClient.disconnect();
    },
  };
}

module.exports = { createRedisMemoryPipeline };
