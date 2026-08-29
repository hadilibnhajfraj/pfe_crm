"use strict";

const { LongTermMemory } = require("../src/ai/memory/longTermMemory");
const { ILongTermMemory } = require("../src/ai/memory/longTermMemory.interface");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

describe("LongTermMemory", () => {
  test("implements ILongTermMemory", () => {
    expect(new LongTermMemory({ store: new InMemoryKeyValueStore() })).toBeInstanceOf(ILongTermMemory);
  });

  test("remember/recall round-trips a fact, preserving its type", async () => {
    const memory = new LongTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.remember("u1", "prefers_concise", true);
    await memory.remember("u1", "favorite_module", "maintenance");
    await expect(memory.recall("u1", "prefers_concise")).resolves.toBe(true);
    await expect(memory.recall("u1", "favorite_module")).resolves.toBe("maintenance");
  });

  test("recall for an unknown fact returns null", async () => {
    const memory = new LongTermMemory({ store: new InMemoryKeyValueStore() });
    await expect(memory.recall("u1", "unknown")).resolves.toBeNull();
  });

  test("recallAll returns every fact for the user", async () => {
    const memory = new LongTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.remember("u1", "a", 1);
    await memory.remember("u1", "b", 2);
    await expect(memory.recallAll("u1")).resolves.toEqual({ a: 1, b: 2 });
  });

  test("two users never share facts", async () => {
    const memory = new LongTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.remember("u1", "favorite_module", "maintenance");
    await memory.remember("u2", "favorite_module", "hr");
    await expect(memory.recall("u1", "favorite_module")).resolves.toBe("maintenance");
    await expect(memory.recall("u2", "favorite_module")).resolves.toBe("hr");
  });

  test("forget removes a single fact without touching the others", async () => {
    const memory = new LongTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.remember("u1", "a", 1);
    await memory.remember("u1", "b", 2);
    await memory.forget("u1", "a");
    await expect(memory.recallAll("u1")).resolves.toEqual({ b: 2 });
  });

  test("is durable by default: no TTL means it survives an arbitrarily long time", async () => {
    jest.useFakeTimers();
    const memory = new LongTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.remember("u1", "a", 1);
    jest.advanceTimersByTime(1000 * 60 * 60 * 24 * 365); // one year
    await expect(memory.recall("u1", "a")).resolves.toBe(1);
    jest.useRealTimers();
  });
});
