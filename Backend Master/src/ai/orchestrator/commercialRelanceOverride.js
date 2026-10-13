"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # commercialRelanceOverride — "clients en retard de relance" > projects
 *
 * ## Le bug corrigé (mission "CORRIGER LE COPILOT POUR LE RÔLE COMMERCIAL")
 * "Quels sont mes clients en retard de relance ?" contient à la fois
 * "retard" (mot-clé RÉEL de `projects`, voir ATTENTION_MARKERS de
 * `ProjectAgent`) et "relance" (mot-clé RÉEL de `commercial_contacts`,
 * déjà présent avant cette mission) — une VRAIE égalité de score (1-1).
 * `intentCatalog.js` déclare `projects` (ligne ~62) AVANT
 * `commercial_contacts` (ligne ~86) : `LexicalIntentRouter`
 * (`score > bestScore`, jamais `>=`) départage donc en faveur de
 * `projects` — la question, qui porte pourtant sur des CONTACTS
 * commerciaux, ne bénéficie jamais de `commercial_agent`.
 *
 * ## Pourquoi pas simplement réordonner le catalogue
 * Même raisonnement que `projectOwnershipOverride.js` : réordonner
 * changerait le comportement pour TOUTE égalité `projects` future, pas
 * seulement celle-ci. Un changement local et explicite, limité à cette
 * seule ambiguïté, est plus sûr et plus auditable.
 *
 * ## La vraie règle
 * N'ajoute AUCUN mot-clé au scoring générique — n'intervient qu'APRÈS que
 * le routeur générique ait déjà choisi `projects`, et seulement si le
 * message contient AUSSI un mot-clé réel de `commercial_contacts`
 * ("relance"/"relancer"/"relances") : exactement la situation d'égalité
 * décrite ci-dessus. Vérifié contre le corpus de validation entier :
 * AUCUN scénario `projects` existant ne contient
 * "relance"/"relancer"/"relances"/"contact"/"prospect"/"rappeler" — cette
 * règle ne peut donc, par construction, dégrader aucun d'entre eux (voir
 * test/ai.orchestrator.commercialRelanceOverride.test.js).
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `projects` ET que
 * `commercial_contacts` existe dans le catalogue fourni.
 */
function mentionsRelance(message) {
  const terms = new Set(tokenize(message));
  return terms.has("relance") || terms.has("relancer") || terms.has("relances");
}

// ## Exception : la question nomme explicitement des PROJETS
// « Quels projets nécessitent une relance ? » contient « relance » mais porte
// sur des projets, pas sur des contacts : la bascule ci-dessous l'envoyait à
// tort vers `commercial_agent`, qui répondait par la liste des contacts à
// rappeler (constaté sur le backend réel le 12/10/2026). Quand le message
// nomme un projet ET ne nomme ni client, ni contact, ni prospect, le choix du
// routeur (`projects`) est conservé. « Quels sont mes clients en retard de
// relance ? » ne nomme aucun projet : la bascule d'origine reste inchangée.
const PROJECT_TERMS = ["projet", "projets", "chantier", "chantiers"];
const CONTACT_TERMS = ["client", "clients", "contact", "contacts", "prospect", "prospects"];

function isAboutProjectsOnly(message) {
  const terms = new Set(tokenize(message));
  return PROJECT_TERMS.some((t) => terms.has(t)) && !CONTACT_TERMS.some((t) => terms.has(t));
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro.
function applyCommercialRelanceOverride(message, key, catalogByKey) {
  if (key !== "projects") return key;
  if (!catalogByKey.has("commercial_contacts")) return key;
  if (!mentionsRelance(message)) return key;
  return isAboutProjectsOnly(message) ? key : "commercial_contacts";
}

module.exports = { applyCommercialRelanceOverride, mentionsRelance, isAboutProjectsOnly };
