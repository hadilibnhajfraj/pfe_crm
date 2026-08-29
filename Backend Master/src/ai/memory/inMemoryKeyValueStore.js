"use strict";

const { IKeyValueStore } = require("./keyValueStore.interface");

// Reference adapter for tests and offline dev only — mirrors
// InMemoryConversationMemory: volatile (lost on restart), no persistence
// guarantee. Every one of the 5 memory classes is unit-tested against this
// fake rather than a real Redis server (same discipline as
// test/ai.rag.retrievalService.test.js using a `{embed, query}` double
// instead of a real vector database) — see redis/redisKeyValueStore.js for
// the adapter that actually talks to Redis.
//
// Simplification versus real Redis: this fake keeps strings/lists/hashes in
// separate maps, so the same key could theoretically hold a string AND a
// hash at once (real Redis would reject that as a WRONGTYPE error). None of
// the 5 memory classes ever reuses a key across types, so this never
// surfaces in practice — it's a test double, not a Redis reimplementation.
class InMemoryKeyValueStore extends IKeyValueStore {
  constructor() {
    super();
    this._strings = new Map();
    this._lists = new Map();
    this._hashes = new Map();
  }

  _isExpired(entry) {
    return Boolean(entry) && entry.expiresAt !== null && entry.expiresAt <= Date.now();
  }

  _expiresAt(ttlSeconds) {
    return ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
  }

  async get(key) {
    const entry = this._strings.get(key);
    if (!entry || this._isExpired(entry)) {
      this._strings.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key, value, { ttlSeconds = null } = {}) {
    this._strings.set(key, { value, expiresAt: this._expiresAt(ttlSeconds) });
  }

  async delete(key) {
    this._strings.delete(key);
    this._lists.delete(key);
    this._hashes.delete(key);
  }

  async expire(key, ttlSeconds) {
    const entry = this._strings.get(key) || this._lists.get(key) || this._hashes.get(key);
    if (entry) entry.expiresAt = this._expiresAt(ttlSeconds);
  }

  async increment(key, { ttlSeconds = null } = {}) {
    const entry = this._strings.get(key);
    const isNew = !entry || this._isExpired(entry);
    const current = isNew ? 0 : parseInt(entry.value, 10) || 0;
    const next = current + 1;
    this._strings.set(key, { value: String(next), expiresAt: isNew ? this._expiresAt(ttlSeconds) : entry.expiresAt });
    return next;
  }

  async pushToList(key, value, { maxLength = null, ttlSeconds = null } = {}) {
    let entry = this._lists.get(key);
    if (!entry || this._isExpired(entry)) entry = { values: [], expiresAt: null };
    entry.values.push(value);
    if (maxLength && entry.values.length > maxLength) entry.values = entry.values.slice(-maxLength);
    if (ttlSeconds) entry.expiresAt = this._expiresAt(ttlSeconds);
    this._lists.set(key, entry);
  }

  async getList(key, { limit = null } = {}) {
    const entry = this._lists.get(key);
    if (!entry || this._isExpired(entry)) {
      this._lists.delete(key);
      return [];
    }
    return limit ? entry.values.slice(-limit) : entry.values.slice();
  }

  async hashGet(key, field) {
    const entry = this._hashes.get(key);
    if (!entry || this._isExpired(entry)) {
      this._hashes.delete(key);
      return null;
    }
    return entry.fields.has(field) ? entry.fields.get(field) : null;
  }

  async hashSet(key, field, value, { ttlSeconds = null } = {}) {
    let entry = this._hashes.get(key);
    if (!entry || this._isExpired(entry)) entry = { fields: new Map(), expiresAt: null };
    entry.fields.set(field, value);
    if (ttlSeconds) entry.expiresAt = this._expiresAt(ttlSeconds);
    this._hashes.set(key, entry);
  }

  async hashGetAll(key) {
    const entry = this._hashes.get(key);
    if (!entry || this._isExpired(entry)) {
      this._hashes.delete(key);
      return {};
    }
    return Object.fromEntries(entry.fields);
  }

  async hashDelete(key, field) {
    const entry = this._hashes.get(key);
    if (entry) entry.fields.delete(field);
  }
}

module.exports = { InMemoryKeyValueStore };
