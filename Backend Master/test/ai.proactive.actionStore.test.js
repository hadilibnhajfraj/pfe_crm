"use strict";

const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
const { getProactiveActionStore, _resetProactiveActionStoreForTests, WORKFLOW_TTL_MS } = require("../src/ai/proactive/proactiveActionStore");

describe("proactiveActionStore — réutilise TEL QUEL PendingActionStore, jamais une deuxième implémentation", () => {
  beforeEach(() => _resetProactiveActionStoreForTests());

  test("getProactiveActionStore() renvoie le MÊME singleton à chaque appel", () => {
    expect(getProactiveActionStore()).toBe(getProactiveActionStore());
  });

  test("le singleton est une vraie instance de PendingActionStore (même classe que le chat)", () => {
    expect(getProactiveActionStore()).toBeInstanceOf(PendingActionStore);
  });

  test("propose()/peek()/consume() fonctionnent exactement comme PendingActionStore, clés par workflowId", () => {
    const store = getProactiveActionStore();

    store.propose("w1", { recipientUserId: "u1", tool: "create_project_action", input: { projectId: "p1" }, label: "Créer un rappel" });

    expect(store.peek("w1")).toMatchObject({ recipientUserId: "u1", tool: "create_project_action" });
    expect(store.consume("w1")).toMatchObject({ recipientUserId: "u1" });
    expect(store.peek("w1")).toBeNull(); // consommé une seule fois
  });

  test("TTL 48h — un workflow proactif reste valide bien plus longtemps qu'une confirmation en conversation (15 min)", () => {
    expect(WORKFLOW_TTL_MS).toBe(48 * 60 * 60 * 1000);
  });

  test("le TTL configuré est réellement honoré par l'instance construite (peek() expire après ttlMs)", () => {
    let now = Date.parse("2026-01-01T00:00:00.000Z");
    const store = new PendingActionStore({ ttlMs: 48 * 60 * 60 * 1000, now: () => now });

    store.propose("w1", { recipientUserId: "u1", tool: "create_project_action", input: {}, label: "A" });
    now += 47 * 60 * 60 * 1000; // +47h : encore valide
    expect(store.peek("w1")).not.toBeNull();

    now += 2 * 60 * 60 * 1000; // +49h au total : expiré
    expect(store.peek("w1")).toBeNull();
  });

  test("deux workflows différents (2 alertes/destinataires) coexistent sans collision", () => {
    const store = getProactiveActionStore();

    store.propose("w1", { recipientUserId: "u1", tool: "create_project_action", input: {}, label: "A" });
    store.propose("w2", { recipientUserId: "u2", tool: "create_project_action", input: {}, label: "B" });

    expect(store.peek("w1").recipientUserId).toBe("u1");
    expect(store.peek("w2").recipientUserId).toBe("u2");
  });
});
