"use strict";

const { RateLimiter, defaultRateLimitKey } = require("../src/ai/security/rateLimiter");
const { RateLimitExceededError } = require("../src/ai/security/errors");
const { InMemoryKeyValueStore } = require("../src/ai/memory/inMemoryKeyValueStore");

describe("defaultRateLimitKey", () => {
  test("composes actingUser.id and action, never the email (PII)", () => {
    expect(defaultRateLimitKey({ actingUser: { id: "u1", email: "u1@x.com" }, action: "create_maintenance_request" })).toBe("u1:create_maintenance_request");
  });

  test("falls back to 'anonymous' when there is no actingUser", () => {
    expect(defaultRateLimitKey({ actingUser: null, action: "tools/call" })).toBe("anonymous:tools/call");
  });
});

describe("RateLimiter.consume", () => {
  test("allows calls under the limit, reporting the remaining budget", async () => {
    const limiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 3, windowSeconds: 60 });
    await expect(limiter.consume("u1:tool")).resolves.toEqual({ count: 1, remaining: 2 });
    await expect(limiter.consume("u1:tool")).resolves.toEqual({ count: 2, remaining: 1 });
    await expect(limiter.consume("u1:tool")).resolves.toEqual({ count: 3, remaining: 0 });
  });

  test("throws RateLimitExceededError (fails closed) once the limit is exceeded", async () => {
    const limiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 2, windowSeconds: 60 });
    await limiter.consume("u1:tool");
    await limiter.consume("u1:tool");
    await expect(limiter.consume("u1:tool")).rejects.toThrow(RateLimitExceededError);
  });

  test("never leaks the raw key in the error message (could contain a userId)", async () => {
    const limiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 60 });
    await limiter.consume("very-specific-user-id-42:tool");
    try {
      await limiter.consume("very-specific-user-id-42:tool");
      throw new Error("expected rejection");
    } catch (err) {
      expect(err).toBeInstanceOf(RateLimitExceededError);
      expect(err.message).not.toContain("very-specific-user-id-42");
      expect(err.message).toContain("1");
    }
  });

  test("different keys have entirely independent budgets", async () => {
    const limiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 60 });
    await expect(limiter.consume("u1:tool")).resolves.toMatchObject({ count: 1 });
    await expect(limiter.consume("u2:tool")).resolves.toMatchObject({ count: 1 });
  });

  test("the budget resets once the window expires", async () => {
    jest.useFakeTimers();
    const limiter = new RateLimiter({ store: new InMemoryKeyValueStore(), max: 1, windowSeconds: 1 });
    await limiter.consume("u1:tool");
    await expect(limiter.consume("u1:tool")).rejects.toThrow(RateLimitExceededError);
    jest.advanceTimersByTime(1001);
    await expect(limiter.consume("u1:tool")).resolves.toMatchObject({ count: 1 });
    jest.useRealTimers();
  });

  test("works identically against a shared store used elsewhere (e.g. memory/), proving IKeyValueStore reuse", async () => {
    const sharedStore = new InMemoryKeyValueStore();
    await sharedStore.set("unrelated:key", "untouched");
    const limiter = new RateLimiter({ store: sharedStore, max: 5, windowSeconds: 60 });
    await limiter.consume("u1:tool");
    await expect(sharedStore.get("unrelated:key")).resolves.toBe("untouched");
  });
});
