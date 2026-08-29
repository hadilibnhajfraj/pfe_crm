"use strict";

const { createClient } = require("redis");
const { loadMemoryConfig } = require("../config");

/**
 * Builds a `redis` v4 client from `REDIS_URL` (see memory/config.js).
 * Deliberately performs NO I/O — `createClient()` only configures the
 * client, it does not open a socket (same "construction is inert" contract
 * as `new Sequelize(...)` in src/db.js, or `createRagPipeline()` in this
 * kernel). The caller must `await client.connect()` before the client is
 * usable — see memory/pipeline.js::createRedisMemoryPipeline(), which wraps
 * that as an explicit `pipeline.connect()` step.
 */
function createRedisClient(env = process.env) {
  const config = loadMemoryConfig(env);
  return createClient({ url: config.redisUrl });
}

module.exports = { createRedisClient };
