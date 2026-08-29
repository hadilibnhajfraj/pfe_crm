"use strict";

/**
 * # commercialAssignmentOverride — "affecter <contact> à <email>" > general_chat
 *
 * ## Le bug corrigé (mission "CORRIGER LES ACTIONS COMMERCIALES DEPUIS LA
 * LISTE DES CONTACTS")
 * "affecter Pépinière awled el HAJ à hadil.ibnhajfraj@gmail.com" ne contient
 * AUCUN mot-clé du catalogue (ni "contact"/"commercial"/"relance" —
 * `commercial_contacts` — ni "projet"/"technicien" — `projects`/
 * `maintenance`, qui possèdent pourtant déjà "affecter"/"assigner" dans
 * leur corpus de validation, mais jamais comme MOT-CLÉ de catalogue) :
 * score nul partout, repli sur `general_chat` (RAG documentaire), qui
 * ignore la demande d'action.
 *
 * ## Pourquoi pas simplement ajouter "affecter"/"assigner" au catalogue
 * `test/fixtures/copilotValidationScenarios.js` contient déjà plusieurs
 * scénarios légitimes avec "affecter"/"assigner" pour `projects`
 * ("Assigne-moi comme propriétaire du projet Nabeul.", "Assigne le projet
 * Sfax au propriétaire Rania.", "Assigne le projet Mahdia à un nouveau
 * propriétaire.") et `maintenance` ("Affecte un technicien à la demande de
 * maintenance urgente.", "Affecte le technicien Karim à la panne signalée
 * hier.", "Quel technicien est affecté aux interventions de maintenance ce
 * mois ?") — un mot-clé de catalogue aussi générique casserait ces
 * routages déjà validés. La vraie règle est plus étroite : un verbe
 * d'affectation combiné à une ADRESSE EMAIL — aucun de ces scénarios
 * n'en contient une (vérifié contre le corpus entier, voir
 * test/ai.orchestrator.commercialAssignmentOverride.test.js).
 *
 * ## La vraie règle
 * N'ajoute AUCUN mot-clé au scoring générique — n'intervient qu'APRÈS que
 * le routeur générique soit retombé sur `general_chat` (score nul partout),
 * ET seulement si le message combine un verbe d'affectation
 * (affecter/affecte/assigner/assigne) avec une adresse email — exactement
 * la situation décrite ci-dessus, jamais une coïncidence de mot isolé.
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `general_chat` ET que
 * `commercial_contacts` existe dans le catalogue fourni.
 */
const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i;
const ASSIGN_VERB_RE = /\b(affecter|affecte|assigner|assigne)\b/i;

function mentionsAssignmentWithEmail(message) {
  return ASSIGN_VERB_RE.test(message) && EMAIL_RE.test(message);
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro.
function applyCommercialAssignmentOverride(message, key, catalogByKey) {
  if (key !== "general_chat") return key;
  if (!catalogByKey.has("commercial_contacts")) return key;
  return mentionsAssignmentWithEmail(message) ? "commercial_contacts" : key;
}

module.exports = { applyCommercialAssignmentOverride, mentionsAssignmentWithEmail };
