"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: the low-level primitives the 5 memory components need, and nothing
// else — every concrete Redis command they use maps to exactly one of
// these (string get/set, list push/range, hash get/set). None of the 5
// memory classes ever talks to a Redis client directly (DIP): they depend
// on this port, so `RedisKeyValueStore` (redis/redisKeyValueStore.js) can be
// swapped for `InMemoryKeyValueStore` (tests, offline dev) without a single
// line changing in ShortTermMemory/SessionMemory/LongTermMemory/
// ContextMemory/PreferenceMemory.
class IKeyValueStore {
  // Strings (used by SessionMemory).
  async get(_key) {
    throw new NotImplementedError("IKeyValueStore", "get");
  }

  async set(_key, _value, _options) {
    throw new NotImplementedError("IKeyValueStore", "set");
  }

  async delete(_key) {
    throw new NotImplementedError("IKeyValueStore", "delete");
  }

  async expire(_key, _ttlSeconds) {
    throw new NotImplementedError("IKeyValueStore", "expire");
  }

  // Atomic counter (used by security/rateLimiter.js: a fixed-window request
  // counter). `ttlSeconds`, if given, is applied ONLY the first time a
  // window is opened (when the returned count is 1) — subsequent calls
  // within the same window must never push the expiry back, or the window
  // would never actually close.
  async increment(_key, _options) {
    throw new NotImplementedError("IKeyValueStore", "increment");
  }

  // Lists (used by ShortTermMemory: an append-only, capped transcript).
  async pushToList(_key, _value, _options) {
    throw new NotImplementedError("IKeyValueStore", "pushToList");
  }

  async getList(_key, _options) {
    throw new NotImplementedError("IKeyValueStore", "getList");
  }

  // Hashes (used by LongTermMemory/ContextMemory/PreferenceMemory: a bag of
  // named fields under one bucket key — see memory/hashMemoryBase.js).
  async hashGet(_key, _field) {
    throw new NotImplementedError("IKeyValueStore", "hashGet");
  }

  async hashSet(_key, _field, _value, _options) {
    throw new NotImplementedError("IKeyValueStore", "hashSet");
  }

  async hashGetAll(_key) {
    throw new NotImplementedError("IKeyValueStore", "hashGetAll");
  }

  async hashDelete(_key, _field) {
    throw new NotImplementedError("IKeyValueStore", "hashDelete");
  }
}

module.exports = { IKeyValueStore };
