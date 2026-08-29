"use strict";

const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

describe("InMemoryKeyValueStore — strings", () => {
  test("get returns null for a missing key", async () => {
    const store = new InMemoryKeyValueStore();
    await expect(store.get("missing")).resolves.toBeNull();
  });

  test("set then get round-trips the value", async () => {
    const store = new InMemoryKeyValueStore();
    await store.set("k", "v");
    await expect(store.get("k")).resolves.toBe("v");
  });

  test("delete removes the value", async () => {
    const store = new InMemoryKeyValueStore();
    await store.set("k", "v");
    await store.delete("k");
    await expect(store.get("k")).resolves.toBeNull();
  });

  test("a TTL'd value expires and reads back as null", async () => {
    jest.useFakeTimers();
    const store = new InMemoryKeyValueStore();
    await store.set("k", "v", { ttlSeconds: 1 });
    await expect(store.get("k")).resolves.toBe("v");
    jest.advanceTimersByTime(1001);
    await expect(store.get("k")).resolves.toBeNull();
    jest.useRealTimers();
  });

  test("expire() sets a TTL on an existing key", async () => {
    jest.useFakeTimers();
    const store = new InMemoryKeyValueStore();
    await store.set("k", "v");
    await store.expire("k", 1);
    jest.advanceTimersByTime(1001);
    await expect(store.get("k")).resolves.toBeNull();
    jest.useRealTimers();
  });
});

describe("InMemoryKeyValueStore — increment (fixed-window counter)", () => {
  test("starts at 1 for a new key and increments on each call", async () => {
    const store = new InMemoryKeyValueStore();
    await expect(store.increment("k")).resolves.toBe(1);
    await expect(store.increment("k")).resolves.toBe(2);
    await expect(store.increment("k")).resolves.toBe(3);
  });

  test("applies ttlSeconds only when the window opens (count === 1), never resetting it on later calls", async () => {
    jest.useFakeTimers();
    const store = new InMemoryKeyValueStore();
    await store.increment("k", { ttlSeconds: 2 });
    jest.advanceTimersByTime(1000);
    await store.increment("k", { ttlSeconds: 2 }); // must NOT push the expiry back to +2s from here
    jest.advanceTimersByTime(1100); // total 2.1s since window opened
    await expect(store.increment("k", { ttlSeconds: 2 })).resolves.toBe(1); // window expired, restarts at 1
    jest.useRealTimers();
  });

  test("a fresh window starts again after the previous one expires", async () => {
    jest.useFakeTimers();
    const store = new InMemoryKeyValueStore();
    await store.increment("k", { ttlSeconds: 1 });
    jest.advanceTimersByTime(1001);
    await expect(store.increment("k", { ttlSeconds: 1 })).resolves.toBe(1);
    jest.useRealTimers();
  });
});

describe("InMemoryKeyValueStore — lists", () => {
  test("pushToList/getList preserve insertion order", async () => {
    const store = new InMemoryKeyValueStore();
    await store.pushToList("l", "a");
    await store.pushToList("l", "b");
    await store.pushToList("l", "c");
    await expect(store.getList("l")).resolves.toEqual(["a", "b", "c"]);
  });

  test("getList honors an explicit limit (the LAST N elements)", async () => {
    const store = new InMemoryKeyValueStore();
    for (const v of ["a", "b", "c", "d"]) await store.pushToList("l", v);
    await expect(store.getList("l", { limit: 2 })).resolves.toEqual(["c", "d"]);
  });

  test("maxLength caps the list, evicting the oldest elements", async () => {
    const store = new InMemoryKeyValueStore();
    for (const v of ["a", "b", "c", "d"]) await store.pushToList("l", v, { maxLength: 3 });
    await expect(store.getList("l")).resolves.toEqual(["b", "c", "d"]);
  });

  test("getList on a missing key returns []", async () => {
    const store = new InMemoryKeyValueStore();
    await expect(store.getList("missing")).resolves.toEqual([]);
  });

  test("a TTL'd list expires", async () => {
    jest.useFakeTimers();
    const store = new InMemoryKeyValueStore();
    await store.pushToList("l", "a", { ttlSeconds: 1 });
    jest.advanceTimersByTime(1001);
    await expect(store.getList("l")).resolves.toEqual([]);
    jest.useRealTimers();
  });
});

describe("InMemoryKeyValueStore — hashes", () => {
  test("hashSet/hashGet round-trips a field", async () => {
    const store = new InMemoryKeyValueStore();
    await store.hashSet("h", "f1", "v1");
    await expect(store.hashGet("h", "f1")).resolves.toBe("v1");
  });

  test("hashGet on a missing field or key returns null", async () => {
    const store = new InMemoryKeyValueStore();
    await expect(store.hashGet("missing", "f1")).resolves.toBeNull();
    await store.hashSet("h", "f1", "v1");
    await expect(store.hashGet("h", "f2")).resolves.toBeNull();
  });

  test("hashGetAll returns every field", async () => {
    const store = new InMemoryKeyValueStore();
    await store.hashSet("h", "f1", "v1");
    await store.hashSet("h", "f2", "v2");
    await expect(store.hashGetAll("h")).resolves.toEqual({ f1: "v1", f2: "v2" });
  });

  test("hashGetAll on a missing key returns {}", async () => {
    const store = new InMemoryKeyValueStore();
    await expect(store.hashGetAll("missing")).resolves.toEqual({});
  });

  test("hashDelete removes only the named field", async () => {
    const store = new InMemoryKeyValueStore();
    await store.hashSet("h", "f1", "v1");
    await store.hashSet("h", "f2", "v2");
    await store.hashDelete("h", "f1");
    await expect(store.hashGetAll("h")).resolves.toEqual({ f2: "v2" });
  });

  test("a TTL applies to the whole hash, not a single field", async () => {
    jest.useFakeTimers();
    const store = new InMemoryKeyValueStore();
    await store.hashSet("h", "f1", "v1", { ttlSeconds: 1 });
    jest.advanceTimersByTime(1001);
    await expect(store.hashGetAll("h")).resolves.toEqual({});
    jest.useRealTimers();
  });
});

describe("InMemoryKeyValueStore — delete() clears all three keyspaces", () => {
  test("delete removes the string, list AND hash entry under the same key", async () => {
    const store = new InMemoryKeyValueStore();
    await store.set("k", "v");
    await store.pushToList("k", "a");
    await store.hashSet("k", "f", "v");
    await store.delete("k");
    await expect(store.get("k")).resolves.toBeNull();
    await expect(store.getList("k")).resolves.toEqual([]);
    await expect(store.hashGetAll("k")).resolves.toEqual({});
  });
});
