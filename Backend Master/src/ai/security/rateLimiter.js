"use strict";

const { IRateLimiter } = require("./rateLimiter.interface");
const { RateLimitExceededError } = require("./errors");

/**
 * # RateLimiter — "limitation des appels"
 *
 * ## Rôle
 * Implémente `IRateLimiter` par-dessus le port `IKeyValueStore` déjà
 * existant (`memory/keyValueStore.interface.js`) — **réutilisé**, pas
 * redéveloppé : `RateLimiter` fonctionne donc aussi bien contre
 * `InMemoryKeyValueStore` (tests, dev offline) que contre
 * `RedisKeyValueStore` (production, budget partagé entre plusieurs
 * instances du process derrière un même Redis). Fenêtre fixe : chaque clé a
 * un compteur qui expire après `windowSeconds` — `IKeyValueStore.increment()`
 * n'applique le TTL qu'à l'ouverture de la fenêtre (`count === 1`), jamais à
 * chaque appel, sinon la fenêtre ne se refermerait jamais.
 *
 * ## Entrée/Sortie
 * `consume(key)` → `{count, remaining}` si sous la limite ; lève
 * `RateLimitExceededError` sinon — **avant** toute exécution de l'action
 * limitée (fail closed), jamais un simple avertissement silencieux.
 *
 * ## Erreurs
 * `RateLimitExceededError` — voir security/errors.js pour le raisonnement
 * "jamais absorbée silencieusement".
 */
class RateLimiter extends IRateLimiter {
  constructor({ store, max = 30, windowSeconds = 60, keyPrefix = "ratelimit:" }) {
    super();
    this.store = store;
    this.max = max;
    this.windowSeconds = windowSeconds;
    this.keyPrefix = keyPrefix;
  }

  async consume(key) {
    const count = await this.store.increment(`${this.keyPrefix}${key}`, { ttlSeconds: this.windowSeconds });
    if (count > this.max) {
      throw new RateLimitExceededError(this.max, this.windowSeconds);
    }
    return { count, remaining: Math.max(0, this.max - count) };
  }
}

// Convention par défaut pour composer une clé "un actingUser, une action" —
// jamais l'e-mail (PII) dans la clé elle-même, seulement l'id. Les
// appelants restent libres de composer leur propre clé (ex. par IP pour un
// endpoint non authentifié) sans passer par ce helper.
function defaultRateLimitKey({ actingUser, action }) {
  const actorId = (actingUser && actingUser.id) || "anonymous";
  return `${actorId}:${action}`;
}

module.exports = { RateLimiter, defaultRateLimitKey };
