"use strict";

const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

describe("PendingActionStore — propose/peek/consume", () => {
  test("peek() returns null when nothing was ever proposed", () => {
    const store = new PendingActionStore();
    expect(store.peek("conv-1")).toBeNull();
  });

  test("propose() then peek() returns the action WITHOUT removing it", () => {
    const store = new PendingActionStore();
    store.propose("conv-1", { id: "a1", label: "Créer un rappel" });

    expect(store.peek("conv-1")).toEqual(expect.objectContaining({ id: "a1", label: "Créer un rappel" }));
    expect(store.peek("conv-1")).not.toBeNull(); // toujours là, peek() n'a pas consommé
  });

  test("consume() returns the action and removes it — a second consume() returns null", () => {
    const store = new PendingActionStore();
    store.propose("conv-1", { id: "a1" });

    expect(store.consume("conv-1")).toEqual(expect.objectContaining({ id: "a1" }));
    expect(store.consume("conv-1")).toBeNull();
    expect(store.peek("conv-1")).toBeNull();
  });

  test("scoped per conversation — a different conversationId never sees another's pending action", () => {
    const store = new PendingActionStore();
    store.propose("conv-1", { id: "a1" });
    expect(store.peek("conv-2")).toBeNull();
  });

  test("a new proposal REPLACES the previous one for the same conversation — never stacked", () => {
    const store = new PendingActionStore();
    store.propose("conv-1", { id: "a1" });
    store.propose("conv-1", { id: "a2" });

    expect(store.consume("conv-1")).toEqual(expect.objectContaining({ id: "a2" }));
    expect(store.peek("conv-1")).toBeNull();
  });

  test("propose()/peek()/consume() with a falsy conversationId are safe no-ops", () => {
    const store = new PendingActionStore();
    expect(store.propose(null, { id: "a1" })).toEqual({ id: "a1" });
    expect(store.peek(null)).toBeNull();
    expect(store.consume(undefined)).toBeNull();
  });
});

describe("PendingActionStore — expiration (TTL)", () => {
  test("an action older than ttlMs is treated as absent by peek(), and purged", () => {
    let currentTime = 1_000_000;
    const store = new PendingActionStore({ ttlMs: 60_000, now: () => currentTime });

    store.propose("conv-1", { id: "a1" });
    currentTime += 60_001; // just past the TTL

    expect(store.peek("conv-1")).toBeNull();
    // Purged: even resetting the clock back doesn't resurrect it.
    currentTime = 1_000_000;
    expect(store.peek("conv-1")).toBeNull();
  });

  test("an action still within ttlMs remains available", () => {
    let currentTime = 1_000_000;
    const store = new PendingActionStore({ ttlMs: 60_000, now: () => currentTime });

    store.propose("conv-1", { id: "a1" });
    currentTime += 30_000; // well within the TTL

    expect(store.peek("conv-1")).toEqual(expect.objectContaining({ id: "a1" }));
  });

  test("consume() also honors expiration — an expired action is neither returned nor left behind", () => {
    let currentTime = 1_000_000;
    const store = new PendingActionStore({ ttlMs: 60_000, now: () => currentTime });

    store.propose("conv-1", { id: "a1" });
    currentTime += 60_001;

    expect(store.consume("conv-1")).toBeNull();
  });
});
