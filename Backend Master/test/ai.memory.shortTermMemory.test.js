"use strict";

const { ShortTermMemory } = require("../src/ai/memory/shortTermMemory");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");
const { IConversationMemory } = require("../src/ai/memory/conversationMemory.interface");

describe("ShortTermMemory", () => {
  test("implements the existing IConversationMemory port (drop-in for InMemoryConversationMemory)", () => {
    const memory = new ShortTermMemory({ store: new InMemoryKeyValueStore() });
    expect(memory).toBeInstanceOf(IConversationMemory);
  });

  test("append then getHistory round-trips messages in order, with an 'at' timestamp added", async () => {
    const memory = new ShortTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.append("c1", { role: "user", content: "bonjour" });
    await memory.append("c1", { role: "assistant", content: "salut" });

    const history = await memory.getHistory("c1");
    expect(history).toHaveLength(2);
    expect(history[0]).toMatchObject({ role: "user", content: "bonjour" });
    expect(typeof history[0].at).toBe("string");
  });

  test("getHistory honors an explicit limit", async () => {
    const memory = new ShortTermMemory({ store: new InMemoryKeyValueStore() });
    for (const content of ["a", "b", "c"]) await memory.append("c1", { role: "user", content });
    const history = await memory.getHistory("c1", { limit: 2 });
    expect(history.map((m) => m.content)).toEqual(["b", "c"]);
  });

  test("maxMessages caps the transcript, evicting the oldest message first", async () => {
    const memory = new ShortTermMemory({ store: new InMemoryKeyValueStore(), maxMessages: 2 });
    for (const content of ["a", "b", "c"]) await memory.append("c1", { role: "user", content });
    const history = await memory.getHistory("c1");
    expect(history.map((m) => m.content)).toEqual(["b", "c"]);
  });

  test("clear removes the entire transcript", async () => {
    const memory = new ShortTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.append("c1", { role: "user", content: "x" });
    await memory.clear("c1");
    await expect(memory.getHistory("c1")).resolves.toEqual([]);
  });

  test("two conversations never share a transcript", async () => {
    const memory = new ShortTermMemory({ store: new InMemoryKeyValueStore() });
    await memory.append("c1", { role: "user", content: "for c1" });
    await memory.append("c2", { role: "user", content: "for c2" });
    expect((await memory.getHistory("c1")).map((m) => m.content)).toEqual(["for c1"]);
    expect((await memory.getHistory("c2")).map((m) => m.content)).toEqual(["for c2"]);
  });

  test("each append refreshes the TTL (sliding window) — the store receives ttlSeconds every time", async () => {
    const store = { pushToList: jest.fn(), getList: jest.fn(async () => []), delete: jest.fn() };
    const memory = new ShortTermMemory({ store, ttlSeconds: 42, maxMessages: 7 });
    await memory.append("c1", { role: "user", content: "x" });
    expect(store.pushToList).toHaveBeenCalledWith("stm:conv:c1", expect.any(String), { maxLength: 7, ttlSeconds: 42 });
  });
});
