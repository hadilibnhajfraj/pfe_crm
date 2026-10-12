"use strict";

/**
 * # ExecutionContext — l'état d'UNE exécution de plan (Phase 3)
 *
 * - **Qui** : `user` authentifié (jamais un identifiant lu dans le message).
 * - **Quand s'arrêter** : délai par étape (`stepTimeoutMs`) et délai global
 *   (`planTimeoutMs`) ; une étape qui commencerait après l'échéance globale
 *   n'est pas lancée.
 * - **Quelles données sont réelles** : `observe()` enregistre les lignes
 *   renvoyées par un Tool READ. Une écriture ne peut viser qu'un
 *   enregistrement ainsi observé (`isObserved`) — un identifiant qui ne
 *   provient d'aucun Tool (inventé, ou fourni par un modèle) est refusé.
 */
class ExecutionContext {
  constructor({ user, conversationId = null, stepTimeoutMs = 15000, planTimeoutMs = 60000, now = () => Date.now() }) {
    if (!user || !user.id) throw new Error("ExecutionContext requires an authenticated user");
    this.user = user;
    this.conversationId = conversationId;
    this.stepTimeoutMs = stepTimeoutMs;
    this.now = now;
    this.startedAt = now();
    this.deadline = this.startedAt + planTimeoutMs;
    this._observed = new Map();
    this.toolSteps = [];
  }

  observe(entityType, rows) {
    if (!this._observed.has(entityType)) this._observed.set(entityType, new Map());
    const byId = this._observed.get(entityType);
    for (const row of rows) byId.set(row.id, row);
  }

  isObserved(entityType, id) {
    const byId = this._observed.get(entityType);
    return Boolean(byId && byId.has(id));
  }

  remainingMs() {
    return this.deadline - this.now();
  }

  isExpired() {
    return this.remainingMs() <= 0;
  }

  /** Délai effectif d'une étape : jamais au-delà de l'échéance globale. */
  stepBudgetMs() {
    return Math.max(0, Math.min(this.stepTimeoutMs, this.remainingMs()));
  }

  recordToolStep(step) {
    this.toolSteps.push(step);
  }
}

module.exports = { ExecutionContext };
