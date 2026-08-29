"use strict";

const { IConversationMemory } = require("./conversationMemory.interface");

/**
 * # ShortTermMemory — la mémoire volatile d'un tour de conversation
 *
 * ## Rôle
 * Implémentation **Redis** du port déjà existant `IConversationMemory`
 * (append/getHistory/clear — voir conversationMemory.interface.js) : un
 * remplacement direct de `InMemoryConversationMemory` partout où ce port est
 * consommé (`ConversationManager`, `RagContextBuilder`, `BaseAgent` — voir
 * orchestrator/ et agents/), sans changer un seul appelant. C'est "court
 * terme" au sens propre : chaque message a une durée de vie bornée
 * (`ttlSeconds`, glissante — rafraîchie à chaque `append`) et le transcript
 * est plafonné à `maxMessages` (une conversation qui n'en finit pas ne fait
 * jamais grossir Redis indéfiniment).
 *
 * ## Entrée/Sortie
 * Identique à `IConversationMemory` : `append(conversationId, message)`,
 * `getHistory(conversationId, {limit})`, `clear(conversationId)`.
 *
 * ## Mémoire
 * Une LISTE Redis par conversation (`stm:conv:{conversationId}`), un message
 * JSON par élément.
 *
 * ## Erreurs
 * Aucune levée volontairement (même contrat que `InMemoryConversationMemory`)
 * — toute erreur du store sous-jacent (Redis indisponible, ...) remonte
 * telle quelle.
 */
class ShortTermMemory extends IConversationMemory {
  constructor({ store, ttlSeconds = 1800, maxMessages = 50 }) {
    super();
    this.store = store;
    this.ttlSeconds = ttlSeconds;
    this.maxMessages = maxMessages;
  }

  _key(conversationId) {
    return `stm:conv:${conversationId}`;
  }

  async append(conversationId, message) {
    const entry = { ...message, at: new Date().toISOString() };
    await this.store.pushToList(this._key(conversationId), JSON.stringify(entry), {
      maxLength: this.maxMessages,
      ttlSeconds: this.ttlSeconds,
    });
  }

  async getHistory(conversationId, options = {}) {
    const raw = await this.store.getList(this._key(conversationId), { limit: options.limit || null });
    return raw.map((entry) => JSON.parse(entry));
  }

  async clear(conversationId) {
    await this.store.delete(this._key(conversationId));
  }
}

module.exports = { ShortTermMemory };
