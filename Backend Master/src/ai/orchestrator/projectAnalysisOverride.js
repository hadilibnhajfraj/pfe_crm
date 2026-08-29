"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # projectAnalysisOverride — "pourquoi CE projet est [état]" > documentation
 *
 * ## Le bug corrigé (AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md)
 * "pourquoi projet depot SBF est critique" routait vers
 * `documentation_question`/`crm_assistant_agent` : "pourquoi" et "projet"
 * marquent chacun UN point (`documentation_question`=1, `projects`=1), et
 * `documentation_question` gagne toute égalité par construction (voir
 * intentCatalog.js, priorité procédurale — AI-Business-Copilot/10_INTENT_ROUTING_FIX.md).
 * C'est correct pour "Pourquoi certains projets nécessitent-ils une
 * validation supplémentaire ?" (une RÈGLE générale — reste
 * `documentation_question`, voir le corpus `doc-13`) mais faux pour "pourquoi
 * CE projet EST critique" (l'ÉTAT réel d'un projet précis).
 *
 * ## Pourquoi pas un simple mot-clé ajouté au catalogue
 * Essayé et rejeté, avec preuve : ajouter "critique"/"critiques" comme
 * mot-clé de l'intention `projects` casse au moins 3 scénarios déjà validés
 * du corpus — `rec-12`/`rec-20` ("Peux-tu me conseiller et prioriser les
 * projets critiques... ?", où "critique" est le SUJET d'un vrai conseil,
 * pas une analyse) et `mnt-14` ("urgence critique", RH/maintenance, aucun
 * rapport avec un projet). "critique" est un mot bien trop générique
 * (utilisé dans au moins 4 domaines différents du corpus) pour devenir un
 * mot-clé GLOBAL d'une seule intention — exactement la même mise en garde
 * déjà écrite dans intentCatalog.js pour "risque"/"priorité" (voir les
 * intentions `business_analysis`/`recommendation`).
 *
 * ## La vraie règle : une COMBINAISON, jamais un mot seul
 * Ce module n'ajoute donc AUCUN mot-clé au scoring générique — il
 * n'intervient qu'APRÈS que le routeur générique (`LexicalIntentRouter`,
 * inchangé) ait déjà choisi `documentation_question`, et seulement si le
 * message combine LES DEUX signaux à la fois : un mot interrogatif
 * d'analyse ("pourquoi"/"quelle est la raison"/...) ET une référence à un
 * projet ("projet"/"projets") ET un mot d'état RÉEL de projet
 * ("critique"/"bloqué"/"risque" — le même vocabulaire que
 * `agents/projectAgent.js::ATTENTION_MARKERS`, jamais une seconde liste
 * inventée). "retard"/"retards" n'a pas besoin de cette règle : déjà un
 * mot-clé sûr de `projects` dans le catalogue (aucune collision trouvée).
 *
 * ## Portée délibérément étroite
 * Ne s'applique QUE quand le routeur a choisi `documentation_question` ET
 * que `projects` existe dans le catalogue fourni — un appelant avec un
 * catalogue personnalisé sans `projects` n'est jamais affecté.
 */
const ANALYTICAL_MARKERS = ["pourquoi"];
const PROJECT_STATE_WORDS = ["critique", "critiques", "bloque", "bloqué", "bloqués", "bloquee", "bloquée", "bloquees", "bloquées", "risque", "risques"];

function isProjectStateAnalysisQuestion(message) {
  const terms = new Set(tokenize(message));
  const hasAnalyticalMarker = ANALYTICAL_MARKERS.some((w) => terms.has(w));
  const hasProjectWord = terms.has("projet") || terms.has("projets");
  const hasStateWord = PROJECT_STATE_WORDS.some((w) => terms.has(w));
  return hasAnalyticalMarker && hasProjectWord && hasStateWord;
}

// `key` est la clé DÉJÀ choisie par le vrai routeur — jamais recalculée
// depuis zéro. `catalogByKey` permet de vérifier que `projects` existe
// réellement dans CE catalogue avant de l'utiliser comme clé de repli.
function applyProjectAnalysisOverride(message, key, catalogByKey) {
  if (key !== "documentation_question") return key;
  if (!catalogByKey.has("projects")) return key;
  return isProjectStateAnalysisQuestion(message) ? "projects" : key;
}

module.exports = { applyProjectAnalysisOverride, isProjectStateAnalysisQuestion, ANALYTICAL_MARKERS, PROJECT_STATE_WORDS };
