"use strict";

/**
 * # knownCopilotGaps — faits d'architecture Copilot, PAS une matrice RBAC
 *
 * (AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md, mission
 * "COMPLÉTER RoleCapabilityAuditAgent")
 *
 * Ce fichier ne décide JAMAIS qui a le droit de quoi — cette décision reste
 * exclusivement calculée par `AgentRegistry`/`isAuthorized()`/`intentCatalog`/
 * `moduleAccessByRole` (voir capabilityMatrixService.js). Il se contente de
 * nommer deux catégories de domaines métier qui n'ont, aujourd'hui,
 * strictement AUCUNE représentation dans le Copilot — donc aucun registre
 * RBAC existant ne peut répondre à leur sujet :
 *
 * - NOT_EXPOSED : le module existe ailleurs dans l'application, mais
 *   aucune intention/agent/Tool Copilot ne le relie — vrai pour TOUS les
 *   rôles également, ce n'est pas une restriction de rôle.
 * - NOT_IMPLEMENTED : la donnée existe en base (ex. l'ENUM `finance_probar`
 *   et les tables `finance_*`, voir le Capability Map final), mais aucune
 *   couche métier applicative (Model/Service/Route/Tool/Agent) n'a été
 *   développée — donc rien à autoriser ou refuser, juste rien à faire.
 *
 * Contenu confirmé par l'audit Capability Map précédent — volontairement
 * PAS étendu au-delà de ce que cet audit a établi (voir la mission :
 * "Ne pas inventer d'autres domaines").
 */

const NOT_EXPOSED_DOMAINS = [
  { key: "tasks", label: "Tâches", keywords: ["tâches", "taches", "tâche", "tache"] },
  { key: "documents", label: "Documents", keywords: ["documents", "document"] },
  { key: "calendar", label: "Calendrier", keywords: ["calendrier", "agenda"] },
];

// Scopé par rôle : seul `finance_probar` est concerné aujourd'hui (compte
// réel en DB, aucune implémentation applicative — voir le Capability Map
// final, section finance_probar). Ne JAMAIS ajouter d'autre rôle ici sans
// le même niveau de preuve (compte réel + absence de code confirmée).
const NOT_IMPLEMENTED_DOMAINS_BY_ROLE = {
  finance_probar: [
    {
      key: "finance",
      label: "Finance / Achats",
      keywords: ["finance", "achats", "achat", "factures", "facture", "commandes", "commande", "paiements", "paiement"],
    },
  ],
};

// `terms` : un Set déjà tokenisé (voir utils/tokenize.js) — jamais retokenisé
// ici, pour rester une lecture pure sur une donnée déjà calculée par
// l'appelant (même discipline que findMentionedIntent()).
function findNotExposedDomain(terms) {
  return NOT_EXPOSED_DOMAINS.find((d) => d.keywords.some((kw) => terms.has(kw))) || null;
}

function findNotImplementedDomain(role, terms) {
  const domains = NOT_IMPLEMENTED_DOMAINS_BY_ROLE[role] || [];
  return domains.find((d) => d.keywords.some((kw) => terms.has(kw))) || null;
}

module.exports = {
  NOT_EXPOSED_DOMAINS,
  NOT_IMPLEMENTED_DOMAINS_BY_ROLE,
  findNotExposedDomain,
  findNotImplementedDomain,
};
