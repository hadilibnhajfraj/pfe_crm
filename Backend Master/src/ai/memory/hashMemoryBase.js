"use strict";

// Internal helper, NOT a public port: LongTermMemory, ContextMemory and
// PreferenceMemory are all, underneath, "a bag of named JSON fields under
// one bucket key, with an optional TTL applied to the whole bucket" —
// `IKeyValueStore.hash*` plus JSON (de)serialization, three times over with
// only the key-building convention and TTL differing. Factored here once
// (DRY — the same reasoning already applied to utils/authorization.js) and
// composed, rather than reimplemented, by each of the three classes.
//
// Deliberately a plain function returning an object, not a class to
// extend: composition over inheritance keeps LongTermMemory/ContextMemory/
// PreferenceMemory free to each implement their OWN named port
// (ILongTermMemory/IContextMemory/IPreferenceMemory) with their own method
// names, while sharing this exact same underlying behavior.
function createHashBucket({ store, buildKey, ttlSeconds = null }) {
  return {
    async getField(id, field) {
      const raw = await store.hashGet(buildKey(id), field);
      return raw === null ? null : JSON.parse(raw);
    },

    async getAllFields(id) {
      const raw = await store.hashGetAll(buildKey(id));
      const result = {};
      for (const [field, value] of Object.entries(raw)) {
        result[field] = JSON.parse(value);
      }
      return result;
    },

    async setField(id, field, value) {
      await store.hashSet(buildKey(id), field, JSON.stringify(value), { ttlSeconds });
    },

    async deleteField(id, field) {
      await store.hashDelete(buildKey(id), field);
    },

    async clear(id) {
      await store.delete(buildKey(id));
    },
  };
}

module.exports = { createHashBucket };
