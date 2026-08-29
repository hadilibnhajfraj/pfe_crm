"use strict";

const { IKeyValueStore } = require("../keyValueStore.interface");

/**
 * # RedisKeyValueStore — l'adaptateur Redis demandé ("Utiliser Redis")
 *
 * ## Rôle
 * Implémente `IKeyValueStore` par-dessus un client `redis` (v4) déjà
 * **connecté** (jamais construit ni connecté ici — voir redisClient.js et
 * pipeline.js pour la racine de composition). Ne fait strictement AUCUNE
 * sérialisation JSON elle-même : chaque valeur est une chaîne telle quelle,
 * exactement le type natif d'une valeur Redis — c'est aux 5 classes de
 * mémoire (ShortTermMemory, SessionMemory, LongTermMemory, ContextMemory,
 * PreferenceMemory) de sérialiser/désérialiser ce qu'elles y stockent.
 * Préfixe chaque clé avec `keyPrefix` (isolation multi-app d'une même
 * instance Redis partagée).
 *
 * ## Erreurs
 * Ne traduit aucune erreur du client `redis` (timeout, connexion perdue,
 * ...) — elles remontent telles quelles ; c'est aux 5 classes de mémoire
 * (via `BaseAgent`/`AIManager` plus haut dans la pile) de décider comment
 * dégrader une indisponibilité de Redis, pas à ce store de le deviner.
 */
class RedisKeyValueStore extends IKeyValueStore {
  constructor({ client, keyPrefix = "ai:" }) {
    super();
    this.client = client;
    this.keyPrefix = keyPrefix;
  }

  _key(key) {
    return `${this.keyPrefix}${key}`;
  }

  async get(key) {
    const value = await this.client.get(this._key(key));
    return value === undefined ? null : value;
  }

  async set(key, value, { ttlSeconds = null } = {}) {
    const options = ttlSeconds ? { EX: ttlSeconds } : undefined;
    await this.client.set(this._key(key), value, options);
  }

  async delete(key) {
    await this.client.del(this._key(key));
  }

  async expire(key, ttlSeconds) {
    await this.client.expire(this._key(key), ttlSeconds);
  }

  async increment(key, { ttlSeconds = null } = {}) {
    const fullKey = this._key(key);
    const count = await this.client.incr(fullKey);
    if (ttlSeconds && count === 1) {
      await this.client.expire(fullKey, ttlSeconds);
    }
    return count;
  }

  async pushToList(key, value, { maxLength = null, ttlSeconds = null } = {}) {
    const fullKey = this._key(key);
    await this.client.rPush(fullKey, value);
    if (maxLength) {
      await this.client.lTrim(fullKey, -maxLength, -1);
    }
    if (ttlSeconds) {
      await this.client.expire(fullKey, ttlSeconds);
    }
  }

  async getList(key, { limit = null } = {}) {
    const start = limit ? -limit : 0;
    const values = await this.client.lRange(this._key(key), start, -1);
    return values || [];
  }

  async hashGet(key, field) {
    const value = await this.client.hGet(this._key(key), field);
    return value === undefined ? null : value;
  }

  async hashSet(key, field, value, { ttlSeconds = null } = {}) {
    const fullKey = this._key(key);
    await this.client.hSet(fullKey, field, value);
    if (ttlSeconds) {
      await this.client.expire(fullKey, ttlSeconds);
    }
  }

  async hashGetAll(key) {
    const value = await this.client.hGetAll(this._key(key));
    return value || {};
  }

  async hashDelete(key, field) {
    await this.client.hDel(this._key(key), field);
  }
}

module.exports = { RedisKeyValueStore };
