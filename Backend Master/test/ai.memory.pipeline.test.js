"use strict";

const { createRedisMemoryPipeline } = require("../src/ai/memory/pipeline");
const { ShortTermMemory } = require("../src/ai/memory/shortTermMemory");
const { SessionMemory } = require("../src/ai/memory/sessionMemory");
const { ContextMemory } = require("../src/ai/memory/contextMemory");
const { LongTermMemory } = require("../src/ai/memory/longTermMemory");
const { PreferenceMemory } = require("../src/ai/memory/preferenceMemory");
const { RedisKeyValueStore } = require("../src/ai/memory/redis/redisKeyValueStore");

// A fake `redis` v4 client — real RedisKeyValueStore logic runs on top of
// it (only the socket-talking primitives are faked), so these tests prove
// createRedisMemoryPipeline wires the right config value (TTL, maxMessages,
// keyPrefix) all the way down to an actual Redis command, without needing a
// live server (see test/ai.memory.redisKeyValueStore.test.js for the same
// no-real-Redis-needed discipline at the adapter's own level).
function fakeClient() {
  let open = false;
  return {
    get isOpen() {
      return open;
    },
    connect: jest.fn(async () => {
      open = true;
    }),
    disconnect: jest.fn(async () => {
      open = false;
    }),
    get: jest.fn(async () => null),
    set: jest.fn(async () => "OK"),
    del: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    rPush: jest.fn(async () => 1),
    lTrim: jest.fn(async () => "OK"),
    lRange: jest.fn(async () => []),
    hGet: jest.fn(async () => null),
    hSet: jest.fn(async () => 1),
    hGetAll: jest.fn(async () => ({})),
    hDel: jest.fn(async () => 1),
  };
}

describe("createRedisMemoryPipeline — wiring", () => {
  test("builds all 5 requested memory components, backed by one shared RedisKeyValueStore", () => {
    const pipeline = createRedisMemoryPipeline({ client: fakeClient(), env: {} });
    expect(pipeline.store).toBeInstanceOf(RedisKeyValueStore);
    expect(pipeline.shortTermMemory).toBeInstanceOf(ShortTermMemory);
    expect(pipeline.sessionMemory).toBeInstanceOf(SessionMemory);
    expect(pipeline.contextMemory).toBeInstanceOf(ContextMemory);
    expect(pipeline.longTermMemory).toBeInstanceOf(LongTermMemory);
    expect(pipeline.preferenceMemory).toBeInstanceOf(PreferenceMemory);
  });

  test("performs no I/O at construction — the client stays closed until connect() is called", () => {
    const client = fakeClient();
    createRedisMemoryPipeline({ client, env: {} });
    expect(client.connect).not.toHaveBeenCalled();
    expect(client.isOpen).toBe(false);
  });

  test("reuses a supplied client instead of building a new one", () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: {} });
    expect(pipeline.client).toBe(client);
  });

  test("connect()/disconnect() are idempotent (guarded by client.isOpen)", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: {} });

    await pipeline.connect();
    await pipeline.connect();
    expect(client.connect).toHaveBeenCalledTimes(1);

    await pipeline.disconnect();
    await pipeline.disconnect();
    expect(client.disconnect).toHaveBeenCalledTimes(1);
  });

  test("default TTL/maxMessages config values reach the real Redis commands ShortTermMemory issues", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: {} });
    await pipeline.shortTermMemory.append("c1", { role: "user", content: "x" });
    expect(client.lTrim).toHaveBeenCalledWith("ai:stm:conv:c1", -50, -1);
    expect(client.expire).toHaveBeenCalledWith("ai:stm:conv:c1", 1800);
  });

  test("SessionMemory uses the configured session TTL", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: {} });
    await pipeline.sessionMemory.startSession("s1", { userId: "u1" });
    expect(client.set).toHaveBeenCalledWith("ai:session:s1", expect.any(String), { EX: 3600 });
  });

  test("ContextMemory uses the configured context TTL (applied to the whole hash on write)", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: {} });
    await pipeline.contextMemory.setContext("c1", "lastModule", "maintenance");
    expect(client.expire).toHaveBeenCalledWith("ai:ctx:conv:c1", 1800);
  });

  test("LongTermMemory/PreferenceMemory are durable by default — no expire() call at all", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: {} });
    await pipeline.longTermMemory.remember("u1", "fact", true);
    await pipeline.preferenceMemory.setPreference("u1", "language", "fr");
    expect(client.expire).not.toHaveBeenCalled();
  });

  test("respects MEMORY_*/REDIS_* env overrides", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({
      client,
      env: { MEMORY_KEY_PREFIX: "custom:", MEMORY_SHORT_TERM_TTL_SECONDS: "10", MEMORY_SHORT_TERM_MAX_MESSAGES: "2" },
    });
    expect(pipeline.config.keyPrefix).toBe("custom:");
    await pipeline.shortTermMemory.append("c1", { role: "user", content: "x" });
    expect(client.rPush).toHaveBeenCalledWith("custom:stm:conv:c1", expect.any(String));
    expect(client.lTrim).toHaveBeenCalledWith("custom:stm:conv:c1", -2, -1);
    expect(client.expire).toHaveBeenCalledWith("custom:stm:conv:c1", 10);
  });

  test("a long-term TTL, when explicitly configured, applies to the whole user bucket", async () => {
    const client = fakeClient();
    const pipeline = createRedisMemoryPipeline({ client, env: { MEMORY_LONG_TERM_TTL_SECONDS: "86400" } });
    await pipeline.longTermMemory.remember("u1", "fact", true);
    expect(client.expire).toHaveBeenCalledWith("ai:ltm:user:u1", 86400);
  });
});
