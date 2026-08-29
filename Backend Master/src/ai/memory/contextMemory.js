"use strict";

const { IContextMemory } = require("./contextMemory.interface");
const { createHashBucket } = require("./hashMemoryBase");

/**
 * # ContextMemory — les slots de "focus courant" d'une conversation
 *
 * ## Rôle
 * Implémente `IContextMemory` par-dessus `hashMemoryBase.js::createHashBucket`.
 * Distincte de `ShortTermMemory` : celle-ci conserve le transcript brut
 * (qui a dit quoi), `ContextMemory` conserve un petit nombre de slots
 * nommés et **écrasables** représentant l'état courant de la conversation
 * (ex. `{lastModule: "maintenance", lastEntityId: "MR-42"}`) — utile pour
 * résoudre "annule-la" ou "assigne-la à un technicien" en se référant à
 * l'entité du tour précédent, sans avoir à reparser tout l'historique.
 *
 * ## Entrée/Sortie
 * `setContext(conversationId, key, value)`, `getContext(conversationId, key)`
 * → valeur ou `null`, `getAllContext(conversationId)` → `{key: value}`,
 * `clearContext(conversationId)`.
 *
 * ## Mémoire
 * Une table de hachage Redis par conversation (`ctx:conv:{conversationId}`),
 * TTL glissant (même classe de durée de vie que `ShortTermMemory` — voir
 * memory/config.js::context.ttlSeconds) : le contexte doit mourir avec la
 * fenêtre active de la conversation, jamais persister indéfiniment.
 */
class ContextMemory extends IContextMemory {
  constructor({ store, ttlSeconds = 1800 }) {
    super();
    this._bucket = createHashBucket({ store, buildKey: (conversationId) => `ctx:conv:${conversationId}`, ttlSeconds });
  }

  async setContext(conversationId, key, value) {
    await this._bucket.setField(conversationId, key, value);
  }

  async getContext(conversationId, key) {
    return this._bucket.getField(conversationId, key);
  }

  async getAllContext(conversationId) {
    return this._bucket.getAllFields(conversationId);
  }

  async clearContext(conversationId) {
    await this._bucket.clear(conversationId);
  }
}

module.exports = { ContextMemory };
