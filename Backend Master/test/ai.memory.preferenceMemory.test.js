"use strict";

const { PreferenceMemory } = require("../src/ai/memory/preferenceMemory");
const { IPreferenceMemory } = require("../src/ai/memory/preferenceMemory.interface");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

describe("PreferenceMemory", () => {
  test("implements IPreferenceMemory", () => {
    expect(new PreferenceMemory({ store: new InMemoryKeyValueStore() })).toBeInstanceOf(IPreferenceMemory);
  });

  test("setPreference/getPreference round-trips a value", async () => {
    const memory = new PreferenceMemory({ store: new InMemoryKeyValueStore() });
    await memory.setPreference("u1", "language", "fr");
    await expect(memory.getPreference("u1", "language")).resolves.toBe("fr");
  });

  test("getPreference for an unset key returns null", async () => {
    const memory = new PreferenceMemory({ store: new InMemoryKeyValueStore() });
    await expect(memory.getPreference("u1", "language")).resolves.toBeNull();
  });

  test("getAllPreferences returns every preference for the user", async () => {
    const memory = new PreferenceMemory({ store: new InMemoryKeyValueStore() });
    await memory.setPreference("u1", "language", "fr");
    await memory.setPreference("u1", "verbosity", "concise");
    await expect(memory.getAllPreferences("u1")).resolves.toEqual({ language: "fr", verbosity: "concise" });
  });

  test("two users never share preferences", async () => {
    const memory = new PreferenceMemory({ store: new InMemoryKeyValueStore() });
    await memory.setPreference("u1", "language", "fr");
    await memory.setPreference("u2", "language", "en");
    await expect(memory.getPreference("u1", "language")).resolves.toBe("fr");
    await expect(memory.getPreference("u2", "language")).resolves.toBe("en");
  });

  test("deletePreference removes a single preference without touching the others", async () => {
    const memory = new PreferenceMemory({ store: new InMemoryKeyValueStore() });
    await memory.setPreference("u1", "language", "fr");
    await memory.setPreference("u1", "verbosity", "concise");
    await memory.deletePreference("u1", "language");
    await expect(memory.getAllPreferences("u1")).resolves.toEqual({ verbosity: "concise" });
  });

  test("setPreference overwrites a previous value for the same key", async () => {
    const memory = new PreferenceMemory({ store: new InMemoryKeyValueStore() });
    await memory.setPreference("u1", "language", "fr");
    await memory.setPreference("u1", "language", "en");
    await expect(memory.getPreference("u1", "language")).resolves.toBe("en");
  });
});
