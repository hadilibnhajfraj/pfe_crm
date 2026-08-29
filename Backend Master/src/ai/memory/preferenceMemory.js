"use strict";

const { IPreferenceMemory } = require("./preferenceMemory.interface");
const { createHashBucket } = require("./hashMemoryBase");

/**
 * # PreferenceMemory — préférences durables de l'utilisateur pour le Copilot
 *
 * ## Rôle
 * Implémente `IPreferenceMemory` par-dessus `hashMemoryBase.js::createHashBucket`
 * — même mécanique que `LongTermMemory`, mais un espace de noms et un
 * contrat distincts (ISP) : une préférence (langue, verbosité des réponses,
 * module favori) est réglée explicitement par l'utilisateur, alors qu'un
 * fait `LongTermMemory` est déduit par le Copilot lui-même.
 *
 * ## Entrée/Sortie
 * `setPreference(userId, key, value)`, `getPreference(userId, key)` →
 * valeur ou `null`, `getAllPreferences(userId)` → `{key: value}`,
 * `deletePreference(userId, key)`.
 *
 * ## Mémoire
 * Une table de hachage Redis par utilisateur (`pref:user:{userId}`), sans
 * TTL par défaut (durable, comme `LongTermMemory`).
 */
class PreferenceMemory extends IPreferenceMemory {
  constructor({ store, ttlSeconds = null }) {
    super();
    this._bucket = createHashBucket({ store, buildKey: (userId) => `pref:user:${userId}`, ttlSeconds });
  }

  async setPreference(userId, key, value) {
    await this._bucket.setField(userId, key, value);
  }

  async getPreference(userId, key) {
    return this._bucket.getField(userId, key);
  }

  async getAllPreferences(userId) {
    return this._bucket.getAllFields(userId);
  }

  async deletePreference(userId, key) {
    await this._bucket.deleteField(userId, key);
  }
}

module.exports = { PreferenceMemory };
