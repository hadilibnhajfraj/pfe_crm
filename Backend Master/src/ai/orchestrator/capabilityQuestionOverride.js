"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # capabilityQuestionOverride — "qu'est-ce que je peux faire ?" > general_chat
 *
 * ## Le bug corrigé (mission "CORRIGER LES 3 PROBLÈMES IDENTIFIÉS PAR
 * L'AUDIT COPILOT", problème 2)
 * La formulation la plus naturelle de la question que `capability_audit`
 * (intentCatalog.js, `RoleCapabilityAuditAgent`) a été construit pour
 * répondre — "Qu'est-ce que je peux faire ?", "Que puis-je faire ?" — ne
 * contient AUCUN des mots-clés du catalogue ("capacités"/"permissions"/
 * "autorisations"/"accessible"/"intentions"/"refusé") et retombe donc sur
 * `general_chat` (RAG générique), qui n'a jamais connaissance du RBAC réel
 * de l'utilisateur.
 *
 * ## Pourquoi pas simplement ajouter des mots-clés au catalogue
 * Essayé et rejeté, avec preuve : les mots porteurs de cette formulation
 * ("peux", "puis", "faire", "consulter", "modules", "accès", "disponible")
 * sont des mots de conversation TRÈS génériques, déjà présents dans au
 * moins 2 scénarios `general_chat` déjà validés du corpus
 * (`test/fixtures/copilotValidationScenarios.js`) :
 * - `gen-09` "Bonjour, que peux-tu faire pour moi globalement ?"
 * - `gen-19` "Bonjour, peux-tu me dire ce que tu sais faire en général ?"
 * Ajouter "peux"/"faire" comme mots-clés globaux de `capability_audit`
 * aurait fait basculer ces deux scénarios légitimes (l'utilisateur demande
 * à DÉCOUVRIR l'assistant, pas ses propres droits) — exactement la même
 * mise en garde déjà écrite dans `projectAnalysisOverride.js` pour
 * "critique"/"pourquoi"/"projet".
 *
 * ## La vraie règle : une COMBINAISON, à la première personne, jamais un mot seul
 * Ce module n'ajoute AUCUN mot-clé au scoring générique — il n'intervient
 * qu'APRÈS que le routeur générique (`LexicalIntentRouter`, inchangé) ait
 * déjà choisi `general_chat` (donc : AUCUN mot-clé d'AUCUNE intention réelle
 * n'a matché — voir la garde `key !== "general_chat"` ci-dessous, qui rend
 * structurellement impossible toute collision avec projects/dashboard/
 * meetings/users/commercial_contacts/industrial/por_promesh/automation :
 * si l'un de ces mots-clés avait matché, le routeur n'aurait jamais choisi
 * `general_chat` en premier lieu). Chaque groupe ci-dessous exige la
 * PREMIÈRE PERSONNE ("je"/"j'ai", jamais "tu"/"vous" — c'est précisément ce
 * qui distingue "que PUIS-JE faire" de "que peux-TU faire", le cas gen-09/
 * gen-19 ci-dessus) combinée à un second mot spécifique — jamais un mot
 * seul, pour rester aussi étroit que `projectAnalysisOverride.js`.
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `general_chat` ET que
 * `capability_audit` existe dans le catalogue fourni.
 */
const GROUPS = [
  // "qu'est-ce que je peux faire ?" / "que puis-je faire ?" / "que puis je faire ?"
  { all: ["faire", "je"], any: ["peux", "puis"] },
  // "quelles sont mes possibilités ?"
  { all: [], any: ["possibilités", "possibilites"] },
  // "quelles fonctionnalités sont disponibles ?" / "...puis-je utiliser ?"
  { all: [], any: ["fonctionnalités", "fonctionnalites"] },
  // "à quoi ai-je accès ?" / "à quoi est-ce que j'ai accès ?"
  { all: ["quoi"], any: ["accès", "acces"] },
  // "qu'est-ce qui est disponible pour moi ?" — "disponible" seul est
  // délibérément EXCLU (voir intentCatalog.js, commentaire sur
  // `capability_audit` : gen-04/gen-21 "es-tu disponible..." doivent rester
  // general_chat) ; combiné à "moi", le signal devient sûr.
  { all: ["disponible", "moi"] },
  // "que puis-je consulter ?"
  { all: ["consulter", "je"], any: ["peux", "puis"] },
  // "quels modules puis-je utiliser ?"
  { all: ["modules", "je"], any: ["peux", "puis"] },
];

function matchesGroup(terms, group) {
  const allOk = (group.all || []).every((w) => terms.has(w));
  const anyOk = !group.any || group.any.some((w) => terms.has(w));
  return allOk && anyOk;
}

function isCapabilityQuestion(message) {
  const terms = new Set(tokenize(message));
  return GROUPS.some((group) => matchesGroup(terms, group));
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro.
function applyCapabilityQuestionOverride(message, key, catalogByKey) {
  if (key !== "general_chat") return key;
  if (!catalogByKey.has("capability_audit")) return key;
  return isCapabilityQuestion(message) ? "capability_audit" : key;
}

module.exports = { applyCapabilityQuestionOverride, isCapabilityQuestion, GROUPS };
