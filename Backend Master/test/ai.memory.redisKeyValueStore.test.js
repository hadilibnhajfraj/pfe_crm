"use strict";

// Verifies RedisKeyValueStore's translation to real `redis` v4 commands
// against a FAKE client (jest mocks for every method it calls) — same
// discipline as test/ai.mcp.server.test.js (fictitious Tools, no real
// database) and test/ai.rag.retrievalService.test.js (a `{embed, query}`
// double instead of a real vector database): no live Redis server is
// required to prove this adapter builds the right commands with the right
// arguments. See test/ai.memory.pipeline.test.js for the composition-root
// wiring, and README.md for why a real, best-effort Redis integration test
// is a SEPARATE, self-skipping file rather than part of this one.

const { RedisKeyValueStore } = require("../src/ai/memory/redis/redisKeyValueStore");

function fakeClient() {
  return {
    get: jest.fn(async () => "value"),
    set: jest.fn(async () => "OK"),
    del: jest.fn(async () => 1),
    expire: jest.fn(async () => 1),
    incr: jest.fn(async () => 1),
    rPush: jest.fn(async () => 1),
    lTrim: jest.fn(async () => "OK"),
    lRange: jest.fn(async () => ["a", "b"]),
    hGet: jest.fn(async () => "hvalue"),
    hSet: jest.fn(async () => 1),
    hGetAll: jest.fn(async () => ({ f1: "v1" })),
    hDel: jest.fn(async () => 1),
  };
}

describe("RedisKeyValueStore — key prefixing", () => {
  test("every command is sent with the configured keyPrefix applied", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "myapp:" });
    await store.get("k");
    expect(client.get).toHaveBeenCalledWith("myapp:k");
  });
});

describe("RedisKeyValueStore — strings", () => {
  test("get returns the client's value as-is", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await expect(store.get("k")).resolves.toBe("value");
  });

  test("get returns null when the client resolves undefined (missing key)", async () => {
    const client = fakeClient();
    client.get = jest.fn(async () => undefined);
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await expect(store.get("k")).resolves.toBeNull();
  });

  test("set without ttlSeconds calls client.set with no options", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.set("k", "v");
    expect(client.set).toHaveBeenCalledWith("ai:k", "v", undefined);
  });

  test("set with ttlSeconds passes {EX: ttlSeconds}", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.set("k", "v", { ttlSeconds: 42 });
    expect(client.set).toHaveBeenCalledWith("ai:k", "v", { EX: 42 });
  });

  test("delete calls client.del with the prefixed key", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.delete("k");
    expect(client.del).toHaveBeenCalledWith("ai:k");
  });

  test("expire calls client.expire with the prefixed key and ttl", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.expire("k", 99);
    expect(client.expire).toHaveBeenCalledWith("ai:k", 99);
  });
});

describe("RedisKeyValueStore — increment", () => {
  test("calls client.incr with the prefixed key and returns its result", async () => {
    const client = fakeClient();
    client.incr = jest.fn(async () => 5);
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await expect(store.increment("k")).resolves.toBe(5);
    expect(client.incr).toHaveBeenCalledWith("ai:k");
  });

  test("applies the ttl only when the counter just opened a new window (count === 1)", async () => {
    const client = fakeClient();
    client.incr = jest.fn(async () => 1);
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.increment("k", { ttlSeconds: 60 });
    expect(client.expire).toHaveBeenCalledWith("ai:k", 60);
  });

  test("never re-applies the ttl on subsequent calls within the same window", async () => {
    const client = fakeClient();
    client.incr = jest.fn(async () => 2);
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.increment("k", { ttlSeconds: 60 });
    expect(client.expire).not.toHaveBeenCalled();
  });
});

describe("RedisKeyValueStore — lists", () => {
  test("pushToList always rPush's; only lTrim/expire when maxLength/ttlSeconds are given", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.pushToList("k", "v");
    expect(client.rPush).toHaveBeenCalledWith("ai:k", "v");
    expect(client.lTrim).not.toHaveBeenCalled();
    expect(client.expire).not.toHaveBeenCalled();
  });

  test("pushToList with maxLength trims to the last N elements", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.pushToList("k", "v", { maxLength: 50 });
    expect(client.lTrim).toHaveBeenCalledWith("ai:k", -50, -1);
  });

  test("pushToList with ttlSeconds refreshes the key's expiry", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.pushToList("k", "v", { ttlSeconds: 1800 });
    expect(client.expire).toHaveBeenCalledWith("ai:k", 1800);
  });

  test("getList without a limit ranges the whole list", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.getList("k");
    expect(client.lRange).toHaveBeenCalledWith("ai:k", 0, -1);
  });

  test("getList with a limit ranges the last N elements", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.getList("k", { limit: 10 });
    expect(client.lRange).toHaveBeenCalledWith("ai:k", -10, -1);
  });

  test("getList returns [] when the client resolves a falsy value", async () => {
    const client = fakeClient();
    client.lRange = jest.fn(async () => null);
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await expect(store.getList("k")).resolves.toEqual([]);
  });
});

describe("RedisKeyValueStore — hashes", () => {
  test("hashGet returns the client's value, or null for undefined", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await expect(store.hashGet("k", "f")).resolves.toBe("hvalue");
    client.hGet = jest.fn(async () => undefined);
    await expect(store.hashGet("k", "f")).resolves.toBeNull();
  });

  test("hashSet without ttlSeconds never calls expire", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.hashSet("k", "f", "v");
    expect(client.hSet).toHaveBeenCalledWith("ai:k", "f", "v");
    expect(client.expire).not.toHaveBeenCalled();
  });

  test("hashSet with ttlSeconds applies it to the whole hash key", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.hashSet("k", "f", "v", { ttlSeconds: 3600 });
    expect(client.expire).toHaveBeenCalledWith("ai:k", 3600);
  });

  test("hashGetAll returns {} when the client resolves a falsy value", async () => {
    const client = fakeClient();
    client.hGetAll = jest.fn(async () => null);
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await expect(store.hashGetAll("k")).resolves.toEqual({});
  });

  test("hashDelete calls client.hDel with the prefixed key and field", async () => {
    const client = fakeClient();
    const store = new RedisKeyValueStore({ client, keyPrefix: "ai:" });
    await store.hashDelete("k", "f");
    expect(client.hDel).toHaveBeenCalledWith("ai:k", "f");
  });
});
