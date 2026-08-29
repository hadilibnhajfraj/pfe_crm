"use strict";

// Best-effort, opt-in integration test against a REAL Redis server — the
// only file in this suite that needs one. Every other test/ai.memory.*
// file proves this subsystem's logic without any live Redis (see
// test/ai.memory.redisKeyValueStore.test.js and
// test/ai.memory.pipeline.test.js, both built on a fake client shaped like
// one). This file exists in addition, to prove RedisKeyValueStore's calls
// are also valid against an actual `redis` server, not just a faithful fake.
//
// Skips itself (each test becomes a documented no-op) rather than failing
// the whole suite when no Redis server is reachable — most dev machines/CI
// runners for this repo don't have one running, and `npm test` must stay
// green without it. Point REDIS_URL at a real server to actually exercise
// this file; a short, non-retrying connect attempt keeps the no-server case
// fast (~500ms) instead of hanging on node-redis's default reconnect
// strategy.

const { createClient } = require("redis");
const { createRedisMemoryPipeline } = require("../src/ai/memory/pipeline");

let pipeline = null;
let redisAvailable = false;

beforeAll(async () => {
  const client = createClient({
    url: process.env.REDIS_URL || "redis://127.0.0.1:6379",
    socket: { connectTimeout: 500, reconnectStrategy: false },
  });
  // node-redis emits 'error' on a failed/lost connection; without a
  // listener, Node treats that as an uncaught exception and crashes the
  // whole test process — swallow it here, connect()'s own rejection below
  // is how this file learns the attempt failed.
  client.on("error", () => {});

  pipeline = createRedisMemoryPipeline({ client, env: process.env });
  try {
    await pipeline.connect();
    redisAvailable = true;
  } catch (err) {
    redisAvailable = false;
    // eslint-disable-next-line no-console
    console.warn(`[ai.memory.redisIntegration] no reachable Redis server (${err.message}) — skipping this file's tests.`);
  }
}, 10000);

afterAll(async () => {
  if (redisAvailable) await pipeline.disconnect();
});

function itIfRedis(name, fn) {
  test(name, async () => {
    if (!redisAvailable) return;
    await fn();
  });
}

describe("Redis integration (best-effort, requires a real REDIS_URL)", () => {
  itIfRedis("ShortTermMemory round-trips a message through a real Redis list, then clears it", async () => {
    const conversationId = `test-conv-${Date.now()}`;
    await pipeline.shortTermMemory.append(conversationId, { role: "user", content: "bonjour" });
    const history = await pipeline.shortTermMemory.getHistory(conversationId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({ role: "user", content: "bonjour" });
    await pipeline.shortTermMemory.clear(conversationId);
    await expect(pipeline.shortTermMemory.getHistory(conversationId)).resolves.toEqual([]);
  });

  itIfRedis("SessionMemory starts, touches and ends a real Redis-backed session", async () => {
    const sessionId = `test-session-${Date.now()}`;
    await pipeline.sessionMemory.startSession(sessionId, { userId: "u1" });
    const touched = await pipeline.sessionMemory.touchSession(sessionId);
    expect(touched).toMatchObject({ userId: "u1" });
    await pipeline.sessionMemory.endSession(sessionId);
    await expect(pipeline.sessionMemory.getSession(sessionId)).resolves.toBeNull();
  });

  itIfRedis("ContextMemory sets and clears a real Redis-backed context slot", async () => {
    const conversationId = `test-ctx-${Date.now()}`;
    await pipeline.contextMemory.setContext(conversationId, "lastModule", "maintenance");
    await expect(pipeline.contextMemory.getContext(conversationId, "lastModule")).resolves.toBe("maintenance");
    await pipeline.contextMemory.clearContext(conversationId);
  });

  itIfRedis("LongTermMemory/PreferenceMemory round-trip through real Redis hashes, then forget/delete", async () => {
    const userId = `test-user-${Date.now()}`;
    await pipeline.longTermMemory.remember(userId, "prefers_concise", true);
    await pipeline.preferenceMemory.setPreference(userId, "language", "fr");
    await expect(pipeline.longTermMemory.recall(userId, "prefers_concise")).resolves.toBe(true);
    await expect(pipeline.preferenceMemory.getPreference(userId, "language")).resolves.toBe("fr");
    await pipeline.longTermMemory.forget(userId, "prefers_concise");
    await pipeline.preferenceMemory.deletePreference(userId, "language");
  });
});
