"use strict";

/**
 * # projectDescribeOverride — "détails de X" > general_chat
 *
 * ## Le bug corrigé (mission "CORRIGER LA RECHERCHE/DESCRIPTION D'UN PROJET
 * PAR SON NOM")
 * "Donne-moi les détails de Résidence HOLYA" et "Montre-moi les détails de
 * Résidence HOLYA" ne contiennent AUCUN mot-clé du catalogue `projects`
 * ("projet"/"projets"/"etape"/"proprietaire"/"owner"/"retard") — confirmé en
 * exécutant le VRAI routeur : les deux retombent sur `general_chat`
 * (confidence 0.30), alors que "décrire projet X"/"parle-moi du projet X"/
 * "quelles sont les informations du projet X" routent déjà correctement
 * (ils contiennent "projet").
 *
 * ## Pourquoi pas simplement ajouter "détails"/"informations" au catalogue
 * Essayé et rejeté, avec preuve : le corpus de validation utilise déjà
 * "détail(s)"/"détaillé" pour AU MOINS 5 autres intentions (`hr`,
 * `industrial`, `por_promesh`, `pipeline`, `reporting` — ex. "Détail de la
 * fiche industrielle numéro 88.", "Détail complet de la fiche POR PROMESH
 * en brouillon."). Ajouter ces mots comme mots-clés GLOBAUX de `projects`
 * créerait de nouvelles égalités de score avec ces intentions déjà
 * validées — exactement la même mise en garde déjà écrite dans
 * `capabilityQuestionOverride.js` pour "peux"/"faire".
 *
 * ## La vraie règle : repli étroit, jamais un mot seul
 * Ce module n'ajoute AUCUN mot-clé au scoring générique — il n'intervient
 * qu'APRÈS que le routeur générique ait déjà choisi `general_chat` (donc :
 * AUCUN mot-clé d'AUCUNE intention réelle n'a matché — structurellement
 * incapable de créer une collision avec hr/industrial/por_promesh/pipeline/
 * reporting, qui gagnent déjà via LEURS PROPRES mots-clés et ne tombent
 * donc jamais en `general_chat`). Exige un nom propre (majuscule) après
 * "détails de"/"informations de"/"détails du projet"/"informations sur le
 * projet" — jamais un mot seul.
 *
 * Note : "décrire projet X"/"parle-moi du projet X"/"informations DU PROJET
 * X" contiennent déjà le mot-clé "projet" et routent donc correctement SANS
 * cet override (`projects` gagne dès le scoring générique) — ce module ne
 * couvre QUE les formulations qui omettent totalement "projet".
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `general_chat` ET que
 * `projects` existe dans le catalogue fourni.
 */
const DESCRIBE_TRIGGER = /\b(?:[Dd][ée]tails?|[Ii]nformations?)\s+(?:du\s+[Pp]rojet\s+|sur\s+le\s+[Pp]rojet\s+|de\s+)([A-ZÀ-Ý][^?.!,;]*)/;

function looksLikeProjectDescribeQuery(message) {
  return DESCRIBE_TRIGGER.test(message);
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro.
function applyProjectDescribeOverride(message, key, catalogByKey) {
  if (key !== "general_chat") return key;
  if (!catalogByKey.has("projects")) return key;
  return looksLikeProjectDescribeQuery(message) ? "projects" : key;
}

module.exports = { applyProjectDescribeOverride, looksLikeProjectDescribeQuery, DESCRIBE_TRIGGER };
