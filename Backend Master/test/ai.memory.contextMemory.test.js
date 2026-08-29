"use strict";

const { ContextMemory } = require("../src/ai/memory/contextMemory");
const { IContextMemory } = require("../src/ai/memory/contextMemory.interface");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

describe("ContextMemory", () => {
  test("implements IContextMemory", () => {
    expect(new ContextMemory({ store: new InMemoryKeyValueStore() })).toBeInstanceOf(IContextMemory);
  });

  test("setContext/getContext round-trips a value, preserving its type (not stringified)", async () => {
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore() });
    await memory.setContext("c1", "lastEntityId", "MR-42");
    await memory.setContext("c1", "lastEntityRef", { module: "maintenance", id: 42 });
    await expect(memory.getContext("c1", "lastEntityId")).resolves.toBe("MR-42");
    await expect(memory.getContext("c1", "lastEntityRef")).resolves.toEqual({ module: "maintenance", id: 42 });
  });

  test("getContext for an unset key returns null", async () => {
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore() });
    await expect(memory.getContext("c1", "unset")).resolves.toBeNull();
  });

  test("setContext overwrites a previous value for the same key (a slot, not a log)", async () => {
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore() });
    await memory.setContext("c1", "lastModule", "maintenance");
    await memory.setContext("c1", "lastModule", "hr");
    await expect(memory.getContext("c1", "lastModule")).resolves.toBe("hr");
  });

  test("getAllContext returns every slot for the conversation", async () => {
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore() });
    await memory.setContext("c1", "lastModule", "maintenance");
    await memory.setContext("c1", "lastEntityId", "MR-42");
    await expect(memory.getAllContext("c1")).resolves.toEqual({ lastModule: "maintenance", lastEntityId: "MR-42" });
  });

  test("two conversations never share context slots", async () => {
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore() });
    await memory.setContext("c1", "lastModule", "maintenance");
    await memory.setContext("c2", "lastModule", "hr");
    await expect(memory.getContext("c1", "lastModule")).resolves.toBe("maintenance");
    await expect(memory.getContext("c2", "lastModule")).resolves.toBe("hr");
  });

  test("clearContext removes every slot for the conversation", async () => {
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore() });
    await memory.setContext("c1", "lastModule", "maintenance");
    await memory.clearContext("c1");
    await expect(memory.getAllContext("c1")).resolves.toEqual({});
  });

  test("context expires after its TTL (dies with the conversation's active window)", async () => {
    jest.useFakeTimers();
    const memory = new ContextMemory({ store: new InMemoryKeyValueStore(), ttlSeconds: 1 });
    await memory.setContext("c1", "lastModule", "maintenance");
    jest.advanceTimersByTime(1001);
    await expect(memory.getAllContext("c1")).resolves.toEqual({});
    jest.useRealTimers();
  });
});
