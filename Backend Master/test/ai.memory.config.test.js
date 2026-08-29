"use strict";

const { loadMemoryConfig } = require("../src/ai/memory/config");
const { ConfigurationError } = require("../src/ai/memory/errors");

describe("loadMemoryConfig", () => {
  test("provides sane defaults when no env is set", () => {
    const config = loadMemoryConfig({});
    expect(config).toEqual({
      redisUrl: "redis://127.0.0.1:6379",
      keyPrefix: "ai:",
      shortTerm: { ttlSeconds: 1800, maxMessages: 50 },
      session: { ttlSeconds: 3600 },
      context: { ttlSeconds: 1800 },
      longTerm: { ttlSeconds: null },
      preference: { ttlSeconds: null },
    });
  });

  test("respects every override", () => {
    const config = loadMemoryConfig({
      REDIS_URL: "redis://redis.internal:6380",
      MEMORY_KEY_PREFIX: "copilot:",
      MEMORY_SHORT_TERM_TTL_SECONDS: "60",
      MEMORY_SHORT_TERM_MAX_MESSAGES: "5",
      MEMORY_SESSION_TTL_SECONDS: "120",
      MEMORY_CONTEXT_TTL_SECONDS: "90",
      MEMORY_LONG_TERM_TTL_SECONDS: "86400",
      MEMORY_PREFERENCE_TTL_SECONDS: "43200",
    });
    expect(config.redisUrl).toBe("redis://redis.internal:6380");
    expect(config.keyPrefix).toBe("copilot:");
    expect(config.shortTerm).toEqual({ ttlSeconds: 60, maxMessages: 5 });
    expect(config.session).toEqual({ ttlSeconds: 120 });
    expect(config.context).toEqual({ ttlSeconds: 90 });
    expect(config.longTerm).toEqual({ ttlSeconds: 86400 });
    expect(config.preference).toEqual({ ttlSeconds: 43200 });
  });

  test("0 for the long-term/preference TTLs means 'no TTL' (null), not a 0-second expiry", () => {
    const config = loadMemoryConfig({ MEMORY_LONG_TERM_TTL_SECONDS: "0", MEMORY_PREFERENCE_TTL_SECONDS: "0" });
    expect(config.longTerm.ttlSeconds).toBeNull();
    expect(config.preference.ttlSeconds).toBeNull();
  });

  test("rejects a malformed REDIS_URL", () => {
    expect(() => loadMemoryConfig({ REDIS_URL: "not-a-url" })).toThrow(ConfigurationError);
  });

  test("the returned config is frozen (and so are its nested objects)", () => {
    const config = loadMemoryConfig({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.shortTerm)).toBe(true);
  });
});
