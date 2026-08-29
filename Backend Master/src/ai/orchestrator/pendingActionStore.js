"use strict";

/**
 * # PendingActionStore — l'état "proposé, en attente de confirmation" entre deux tours
 *
 * ## Rôle
 * Seule pièce structurelle qui rend une confirmation possible : sans elle,
 * chaque tour de conversation serait indépendant et "confirme" n'aurait
 * rien à confirmer (voir `agents/automationAgent.js`, qui est l'unique
 * consommateur). Une action proposée est stockée ICI (jamais exécutée),
 * puis retirée (`consume`) au plus une fois — soit parce qu'elle a été
 * confirmée (et alors exécutée), soit annulée, soit qu'une nouvelle
 * proposition l'a remplacée.
 *
 * ## Portée : une par CONVERSATION, jamais empilée
 * Une seule action en attente à la fois par `conversationId` — une nouvelle
 * proposition remplace silencieusement la précédente (`propose()` écrase
 * l'entrée existante). Pas de file d'actions en attente : plus simple à
 * raisonner pour l'utilisateur ("la dernière chose que je vous ai proposée"),
 * et évite toute ambiguïté sur laquelle une confirmation ultérieure viserait.
 *
 * ## Expiration (`ttlMs`, 15 minutes par défaut)
 * Une action trop ancienne n'est plus honorée : `peek()`/`consume()` la
 * traitent comme absente (et la purgent) au-delà de `ttlMs` — jamais
 * d'exécution tardive et surprenante d'une action que l'utilisateur a
 * probablement oubliée.
 *
 * ## En mémoire, par processus — même limite assumée que `InMemoryConversationMemory`
 * Ne survit pas à un redémarrage ni ne se partage entre plusieurs instances
 * du serveur — acceptable pour une fenêtre de confirmation de quelques
 * minutes, documentée comme telle plutôt que découverte en production (même
 * discipline que `memory/inMemoryConversationMemory.js`).
 */
class PendingActionStore {
  constructor({ ttlMs = 15 * 60 * 1000, now = () => Date.now() } = {}) {
    this._byConversation = new Map();
    this._ttlMs = ttlMs;
    this._now = now;
  }

  propose(conversationId, action) {
    if (!conversationId) return action;
    this._byConversation.set(conversationId, { ...action, proposedAt: this._now() });
    return action;
  }

  peek(conversationId) {
    if (!conversationId) return null;
    return this._getIfFresh(conversationId);
  }

  consume(conversationId) {
    if (!conversationId) return null;
    const action = this._getIfFresh(conversationId);
    this._byConversation.delete(conversationId);
    return action;
  }

  _getIfFresh(conversationId) {
    const entry = this._byConversation.get(conversationId);
    if (!entry) return null;
    if (this._now() - entry.proposedAt > this._ttlMs) {
      this._byConversation.delete(conversationId);
      return null;
    }
    return entry;
  }
}

module.exports = { PendingActionStore };
