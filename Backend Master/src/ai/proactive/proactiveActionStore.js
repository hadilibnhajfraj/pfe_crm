"use strict";

const { PendingActionStore } = require("../orchestrator/pendingActionStore");

/**
 * # ProactiveActionStore — l'état "workflow proposé, en attente de confirmation" pour une alerte proactive
 *
 * ## Rôle
 * Réutilise TEL QUEL `PendingActionStore` (`orchestrator/pendingActionStore.js`)
 * — déjà réel, déjà testé, déjà la SEULE pièce qui rend une confirmation
 * possible ailleurs dans ce kernel (`AutomationAgent`) — jamais une
 * deuxième implémentation du même concept. `PendingActionStore` est une
 * classe générique clée par n'importe quelle chaîne (elle l'appelle
 * `conversationId` mais ne l'interprète jamais) : ici la clé est un
 * `workflowId` propre à UNE alerte pour UN destinataire (voir
 * `alertDispatcher.js`), jamais un `conversationId` — il n'y a pas de
 * conversation en cours quand une alerte proactive est déclenchée par le
 * cron.
 *
 * ## TTL plus long qu'en conversation (48h contre 15 min)
 * Un workflow proposé par une alerte proactive est reçu (e-mail + push),
 * puis éventuellement consulté et confirmé plus tard dans la journée — pas
 * dans la minute qui suit, contrairement à une confirmation en cours de
 * conversation. Voir `PROACTIVE_AI.md`, "Ce qui n'a pas été fait" pour la
 * limite assumée : au-delà de ce délai, ou si le destinataire n'était pas
 * connecté au moment de la diffusion (le `workflowId` n'arrive QUE par le
 * push Socket.IO, jamais persisté ailleurs), le workflow devient
 * simplement inatteignable — pas d'endpoint pour lister ses workflows
 * proactifs en attente dans cette passe.
 */
const WORKFLOW_TTL_MS = 48 * 60 * 60 * 1000;

let singleton = null;

function getProactiveActionStore() {
  if (!singleton) singleton = new PendingActionStore({ ttlMs: WORKFLOW_TTL_MS });
  return singleton;
}

// Seam de test — voir test/ai.proactive.actionStore.test.js.
function _resetProactiveActionStoreForTests() {
  singleton = null;
}

module.exports = { getProactiveActionStore, _resetProactiveActionStoreForTests, WORKFLOW_TTL_MS };
