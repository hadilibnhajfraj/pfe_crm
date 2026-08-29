"use strict";

const { ISessionMemory } = require("./sessionMemory.interface");

/**
 * # SessionMemory — l'enveloppe de session (qui, depuis quand, jusqu'à quand)
 *
 * ## Rôle
 * Suit une session d'usage du Copilot (typiquement : depuis la connexion de
 * l'utilisateur jusqu'à son inactivité prolongée ou sa déconnexion) —
 * distincte du transcript de messages (`ShortTermMemory`) : une session peut
 * référencer plusieurs `conversationId` successifs. TTL **glissant** :
 * `touchSession`/`updateSession` rafraîchissent la fenêtre d'expiration à
 * chaque appel, exactement comme une session HTTP classique.
 *
 * ## Entrée/Sortie
 * `startSession(sessionId, data)` → session créée (fusionne `data` avec
 * `startedAt`/`lastActiveAt`). `getSession(sessionId)` → session ou `null`
 * si absente/expirée. `touchSession(sessionId)` → rafraîchit `lastActiveAt`
 * et le TTL, retourne la session, ou `null` si elle n'existe déjà plus (on
 * ne ressuscite jamais silencieusement une session expirée). `updateSession
 * (sessionId, patch)` → fusionne `patch`, même règle. `endSession(sessionId)`
 * → supprime immédiatement.
 *
 * ## Mémoire
 * Une chaîne Redis JSON par session (`session:{sessionId}`).
 *
 * ## Erreurs
 * Aucune levée volontairement : une opération sur une session déjà expirée
 * retourne `null` plutôt que de lever une exception.
 */
class SessionMemory extends ISessionMemory {
  constructor({ store, ttlSeconds = 3600 }) {
    super();
    this.store = store;
    this.ttlSeconds = ttlSeconds;
  }

  _key(sessionId) {
    return `session:${sessionId}`;
  }

  async startSession(sessionId, data = {}) {
    const now = new Date().toISOString();
    const session = { ...data, startedAt: now, lastActiveAt: now };
    await this.store.set(this._key(sessionId), JSON.stringify(session), { ttlSeconds: this.ttlSeconds });
    return session;
  }

  async getSession(sessionId) {
    const raw = await this.store.get(this._key(sessionId));
    return raw === null ? null : JSON.parse(raw);
  }

  async touchSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    session.lastActiveAt = new Date().toISOString();
    await this.store.set(this._key(sessionId), JSON.stringify(session), { ttlSeconds: this.ttlSeconds });
    return session;
  }

  async updateSession(sessionId, patch = {}) {
    const session = await this.getSession(sessionId);
    if (!session) return null;
    const updated = { ...session, ...patch, lastActiveAt: new Date().toISOString() };
    await this.store.set(this._key(sessionId), JSON.stringify(updated), { ttlSeconds: this.ttlSeconds });
    return updated;
  }

  async endSession(sessionId) {
    await this.store.delete(this._key(sessionId));
  }
}

module.exports = { SessionMemory };
