"use strict";

const crypto = require("crypto");
const { tokenize } = require("../utils/tokenize");
const { normalizeAccents } = require("../reasoning/projectStatuses");

/**
 * # ConfirmationManager — « rien n'est écrit sans confirmation » (Phase 3)
 *
 * Réutilise le `PendingActionStore` DÉJÀ partagé par l'orchestrateur (même
 * instance que MeetingAgent/AutomationAgent) plutôt qu'un second stockage :
 * une proposition par conversation, remplacée par la suivante, expirée après
 * 15 minutes, consommée une seule fois.
 *
 * Ce qu'il ajoute :
 * - un type dédié (`task_plan`) pour que l'AIManager route le tour de
 *   confirmation vers l'Agent qui a proposé le plan ;
 * - le lien au PROPRIÉTAIRE : `actingUserId` vient de l'utilisateur
 *   authentifié ; un autre utilisateur (même conversation, même admin) ne
 *   peut ni voir, ni confirmer, ni annuler ce plan ;
 * - la classification stricte de la réponse (`classifyDecision`) : seuls
 *   « confirme »/« annule » (les mots que le Copilot demande lui-même),
 *   dans un message court et sans négation.
 */

const TASK_PLAN_PENDING_TYPE = "task_plan";
const CONFIRM_MARKERS = ["confirme", "confirmer", "confirmes", "confirmez"];
const CANCEL_MARKERS = ["annule", "annuler", "annulez", "abandonne", "abandonner"];
const NEGATIONS = ["pas", "non", "ne", "jamais"];
const MAX_DECISION_TOKENS = 8;

/** "confirm" | "cancel" | null (aucune décision claire). */
function classifyDecision(message) {
  const terms = tokenize(normalizeAccents(message));
  if (!terms.length || terms.length > MAX_DECISION_TOKENS) return null;
  const confirm = terms.some((t) => CONFIRM_MARKERS.includes(t));
  const cancel = terms.some((t) => CANCEL_MARKERS.includes(t));
  if (cancel && !confirm) return "cancel";
  if (confirm && !cancel && !terms.some((t) => NEGATIONS.includes(t))) return "confirm";
  return null;
}

class ConfirmationManager {
  constructor({ store }) {
    if (!store) throw new Error("ConfirmationManager requires the shared PendingActionStore");
    this.store = store;
  }

  get ttlMinutes() {
    return Math.round((this.store.ttlMs || 15 * 60 * 1000) / 60000);
  }

  /** Enregistre le plan préparé ; rien n'est exécuté ici. */
  request({ conversationId, user, goal, writeSteps, summary = null }) {
    const pending = {
      type: TASK_PLAN_PENDING_TYPE,
      id: crypto.randomUUID(),
      actingUserId: user.id,
      goal,
      steps: writeSteps.map((s) => s.toJSON()),
      summary,
    };
    this.store.propose(conversationId, pending);
    return pending;
  }

  /** Plan en attente de CET utilisateur sur CETTE conversation, sinon null. */
  pendingFor(conversationId, user) {
    const pending = this.store.peek(conversationId);
    if (!pending || pending.type !== TASK_PLAN_PENDING_TYPE) return null;
    if (!user || pending.actingUserId !== user.id) return null;
    return pending;
  }

  /** Retire (une seule fois) le plan de CET utilisateur ; null sinon. */
  take(conversationId, user) {
    const pending = this.pendingFor(conversationId, user);
    if (!pending) return null;
    this.store.consume(conversationId);
    return pending;
  }
}

module.exports = { ConfirmationManager, classifyDecision, TASK_PLAN_PENDING_TYPE, CONFIRM_MARKERS, CANCEL_MARKERS };
