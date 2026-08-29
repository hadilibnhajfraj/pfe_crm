"use strict";

const { ILongTermMemory } = require("./longTermMemory.interface");
const { createHashBucket } = require("./hashMemoryBase");

/**
 * # LongTermMemory — faits durables, valables au-delà d'une session
 *
 * ## Rôle
 * Implémente `ILongTermMemory` par-dessus `hashMemoryBase.js::createHashBucket`
 * (voir ce fichier pour le raisonnement DRY partagé avec `ContextMemory`/
 * `PreferenceMemory`). Un fait retenu ici (`remember`) survit à la fin de la
 * conversation ET de la session — c'est la différence avec
 * `ShortTermMemory`/`ContextMemory`/`SessionMemory`, tous bornés dans le
 * temps.
 *
 * ## Entrée/Sortie
 * `remember(userId, factKey, value)`, `recall(userId, factKey)` → valeur ou
 * `null`, `recallAll(userId)` → `{factKey: value}`, `forget(userId, factKey)`.
 *
 * ## Mémoire
 * Une table de hachage Redis par utilisateur (`ltm:user:{userId}`), un champ
 * JSON par fait. `ttlSeconds` est `null` par défaut (voir memory/config.js)
 * — s'il est fourni, il s'applique à TOUTE la table de hachage de
 * l'utilisateur (limite Redis : pas de TTL par champ), jamais à un fait
 * isolé.
 */
class LongTermMemory extends ILongTermMemory {
  constructor({ store, ttlSeconds = null }) {
    super();
    this._bucket = createHashBucket({ store, buildKey: (userId) => `ltm:user:${userId}`, ttlSeconds });
  }

  async remember(userId, factKey, value) {
    await this._bucket.setField(userId, factKey, value);
  }

  async recall(userId, factKey) {
    return this._bucket.getField(userId, factKey);
  }

  async recallAll(userId) {
    return this._bucket.getAllFields(userId);
  }

  async forget(userId, factKey) {
    await this._bucket.deleteField(userId, factKey);
  }
}

module.exports = { LongTermMemory };
