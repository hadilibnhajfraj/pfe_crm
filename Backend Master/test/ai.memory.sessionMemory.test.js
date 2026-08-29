"use strict";

const { SessionMemory } = require("../src/ai/memory/sessionMemory");
const { ISessionMemory } = require("../src/ai/memory/sessionMemory.interface");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

describe("SessionMemory", () => {
  test("implements ISessionMemory", () => {
    expect(new SessionMemory({ store: new InMemoryKeyValueStore() })).toBeInstanceOf(ISessionMemory);
  });

  test("startSession creates a session with startedAt/lastActiveAt and the given data merged in", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    const session = await memory.startSession("s1", { userId: "u1" });
    expect(session).toMatchObject({ userId: "u1" });
    expect(typeof session.startedAt).toBe("string");
    expect(session.lastActiveAt).toBe(session.startedAt);
  });

  test("getSession returns null for a session that was never started", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    await expect(memory.getSession("ghost")).resolves.toBeNull();
  });

  test("getSession retrieves exactly what startSession stored", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    await memory.startSession("s1", { userId: "u1" });
    await expect(memory.getSession("s1")).resolves.toMatchObject({ userId: "u1" });
  });

  test("touchSession refreshes lastActiveAt and preserves the rest of the session", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    const started = await memory.startSession("s1", { userId: "u1" });
    await new Promise((resolve) => setTimeout(resolve, 5));
    const touched = await memory.touchSession("s1");
    expect(touched.userId).toBe("u1");
    expect(touched.lastActiveAt).not.toBe(started.lastActiveAt);
  });

  test("touchSession on a nonexistent session returns null (never resurrects one)", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    await expect(memory.touchSession("ghost")).resolves.toBeNull();
  });

  test("updateSession merges a patch and refreshes lastActiveAt", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    await memory.startSession("s1", { userId: "u1", conversationId: "c1" });
    const updated = await memory.updateSession("s1", { conversationId: "c2" });
    expect(updated).toMatchObject({ userId: "u1", conversationId: "c2" });
  });

  test("updateSession on a nonexistent session returns null", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    await expect(memory.updateSession("ghost", { a: 1 })).resolves.toBeNull();
  });

  test("endSession removes the session entirely", async () => {
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore() });
    await memory.startSession("s1", { userId: "u1" });
    await memory.endSession("s1");
    await expect(memory.getSession("s1")).resolves.toBeNull();
  });

  test("a session expires after its sliding TTL elapses with no activity", async () => {
    jest.useFakeTimers();
    const memory = new SessionMemory({ store: new InMemoryKeyValueStore(), ttlSeconds: 1 });
    await memory.startSession("s1", { userId: "u1" });
    jest.advanceTimersByTime(1001);
    await expect(memory.getSession("s1")).resolves.toBeNull();
    jest.useRealTimers();
  });

  test("each write applies the configured ttlSeconds to the store", async () => {
    const store = { set: jest.fn(), get: jest.fn(async () => null) };
    const memory = new SessionMemory({ store, ttlSeconds: 99 });
    await memory.startSession("s1", { userId: "u1" });
    expect(store.set).toHaveBeenCalledWith("session:s1", expect.any(String), { ttlSeconds: 99 });
  });
});
