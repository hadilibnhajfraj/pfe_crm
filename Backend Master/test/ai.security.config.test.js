"use strict";

const { loadSecurityConfig } = require("../src/ai/security/config");
const { ConfigurationError } = require("../src/ai/security/errors");

describe("loadSecurityConfig", () => {
  test("provides sane defaults when no env is set", () => {
    const config = loadSecurityConfig({});
    expect(config).toEqual({
      rateLimit: { max: 30, windowSeconds: 60 },
      audit: { maxEntries: 10000, ttlSeconds: 60 * 60 * 24 * 90 },
      promptInjectionMode: "sanitize",
    });
  });

  test("respects every override", () => {
    const config = loadSecurityConfig({
      AI_SECURITY_RATE_LIMIT_MAX: "10",
      AI_SECURITY_RATE_LIMIT_WINDOW_SECONDS: "30",
      AI_SECURITY_AUDIT_MAX_ENTRIES: "500",
      AI_SECURITY_AUDIT_TTL_SECONDS: "3600",
      AI_SECURITY_PROMPT_INJECTION_MODE: "block",
    });
    expect(config.rateLimit).toEqual({ max: 10, windowSeconds: 30 });
    expect(config.audit).toEqual({ maxEntries: 500, ttlSeconds: 3600 });
    expect(config.promptInjectionMode).toBe("block");
  });

  test("rejects an invalid promptInjectionMode", () => {
    expect(() => loadSecurityConfig({ AI_SECURITY_PROMPT_INJECTION_MODE: "delete_everything" })).toThrow(ConfigurationError);
  });

  test("the returned config is frozen (and so are its nested objects)", () => {
    const config = loadSecurityConfig({});
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.rateLimit)).toBe(true);
    expect(Object.isFrozen(config.audit)).toBe(true);
  });
});
