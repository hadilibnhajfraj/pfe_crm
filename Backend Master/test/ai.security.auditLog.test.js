"use strict";

const { AuditLog, VALID_OUTCOMES } = require("../src/ai/security/auditLog");
const { ConfigurationError } = require("../src/ai/security/errors");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

const ADMIN = { id: "a1", role: "admin" };

describe("VALID_OUTCOMES", () => {
  test("lists the recognized outcome values", () => {
    expect(VALID_OUTCOMES).toEqual(["allowed", "denied", "success", "failure", "flagged"]);
  });
});

describe("AuditLog.record", () => {
  test("rejects an unrecognized outcome", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore() });
    await expect(log.record({ actor: ADMIN, action: "tools/call", outcome: "not_a_real_outcome" })).rejects.toThrow(ConfigurationError);
  });

  test("records a structured entry with an ISO timestamp", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore() });
    const entry = await log.record({ actor: ADMIN, action: "tools/call", resource: "create_maintenance_request", outcome: "allowed" });
    expect(entry).toMatchObject({ actorId: "a1", actorRole: "admin", action: "tools/call", resource: "create_maintenance_request", outcome: "allowed" });
    expect(new Date(entry.at).toISOString()).toBe(entry.at);
  });

  test("defaults actorId/actorRole to null when no actor is given (e.g. an anonymous/system event)", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore() });
    const entry = await log.record({ action: "tools/call", outcome: "denied" });
    expect(entry.actorId).toBeNull();
    expect(entry.actorRole).toBeNull();
  });

  test("redacts secret-shaped metadata before it is ever persisted", async () => {
    const store = new InMemoryKeyValueStore();
    const log = new AuditLog({ store });
    await log.record({ actor: ADMIN, action: "tools/call", outcome: "allowed", metadata: { apiKey: "sk-should-not-be-stored" } });
    const raw = await store.getList("audit:log");
    expect(raw[0]).not.toContain("sk-should-not-be-stored");
    expect(JSON.parse(raw[0]).metadata.apiKey).toBe("[REDACTED]");
  });
});

describe("AuditLog.list", () => {
  test("returns entries in the order they were recorded", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore() });
    await log.record({ actor: ADMIN, action: "a1", outcome: "allowed" });
    await log.record({ actor: ADMIN, action: "a2", outcome: "denied" });
    const entries = await log.list();
    expect(entries.map((e) => e.action)).toEqual(["a1", "a2"]);
  });

  test("honors an explicit limit (the most recent N entries)", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore() });
    for (let i = 0; i < 5; i++) await log.record({ actor: ADMIN, action: `a${i}`, outcome: "allowed" });
    const entries = await log.list({ limit: 2 });
    expect(entries.map((e) => e.action)).toEqual(["a3", "a4"]);
  });

  test("is capped at maxEntries, dropping the oldest entries first", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore(), maxEntries: 3 });
    for (let i = 0; i < 5; i++) await log.record({ actor: ADMIN, action: `a${i}`, outcome: "allowed" });
    const entries = await log.list();
    expect(entries.map((e) => e.action)).toEqual(["a2", "a3", "a4"]);
  });

  test("returns [] when nothing has been recorded yet", async () => {
    const log = new AuditLog({ store: new InMemoryKeyValueStore() });
    await expect(log.list()).resolves.toEqual([]);
  });
});
