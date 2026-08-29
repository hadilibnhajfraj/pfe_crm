"use strict";

const { tokenize } = require("../utils/tokenize");

// Canonical entity name per catalog key — only for entries that actually
// own a business module (moduleKey !== null). Deliberately hand-authored
// (not derived from moduleKey verbatim) so the returned entity reads like a
// noun a human asked about ("project", not "projects"/the raw catalog key),
// per AI-Business-Copilot/10_INTENT_ROUTING_FIX.md step 10 —
// `{ "entities": ["project"] }`, not `{ "entities": ["projects"] }`.
const ENTITY_BY_INTENT_KEY = {
  users: "user",
  projects: "project",
  pipeline: "pipeline",
  commercial_contacts: "commercial_contact",
  maintenance: "maintenance_request",
  notifications: "notification",
  industrial: "industrial_record",
  por_promesh: "por_promesh",
  dashboard: "kpi",
  hr: "hr_request",
  reporting: "report",
  meetings: "meeting",
  reminders: "reminder",
};

/**
 * # computeConfidenceAndEntities — annotation additive, jamais un second routeur
 *
 * ## Rôle
 * `IntentDetector.detect()` doit déjà, seul, choisir LA route via son
 * `router` injecté (`LexicalIntentRouter` par défaut) — ce module ne
 * reproduit jamais ce choix. Il se contente de RE-COMPTER, en lecture
 * seule, les mêmes recouvrements de mots-clés que le routeur vient
 * d'utiliser (même primitive `tokenize`), pour EXPLIQUER la décision déjà
 * prise : quelle confiance lui accorder, et quelles entités métier le
 * message mentionne — voir AI-Business-Copilot/10_INTENT_ROUTING_FIX.md
 * (étape 10, "Confidence Score").
 *
 * ## Confiance — quatre paliers, pas une courbe continue fabriquée
 * Un routeur lexical est déterministe : soit un mot-clé a été trouvé, soit
 * non — il n'y a pas de vraie probabilité continue à en tirer sans
 * inventer une précision qui n'existe pas. Quatre paliers honnêtes :
 * - `0.30` REPLI — la route gagnante a un score lexical nul : soit un vrai
 *   repli sur `defaultIntentKey`, soit un routeur non lexical (LLM, test)
 *   qui a choisi une route sans le moindre mot-clé pour l'appuyer — dans
 *   les deux cas, aucune preuve lexicale ne justifie une confiance plus
 *   haute.
 * - `0.55` FAIBLE — la route gagnante a un score réel, mais UNE AUTRE
 *   route (autre que `documentation_question`, voir palier suivant) a
 *   égalé ou dépassé son score : une vraie ambiguïté, bon candidat pour
 *   une clarification (étape 11).
 * - `0.90` FORTE — la route gagnante a un score réel et strictement
 *   supérieur à toute autre route : gagnant net, sans ambiguïté.
 * - `0.95` PRIORITÉ PROCÉDURALE DÉLIBÉRÉE — `documentation_question`
 *   l'emporte alors qu'une autre route a égalé son score : ce n'est PAS
 *   une coïncidence d'ordre de tableau à traiter comme une supposition
 *   fragile, c'est la règle métier explicite et testée "une question
 *   procédurale l'emporte toujours" (voir intentCatalog.js, commentaire
 *   au-dessus de l'entrée `documentation_question`, et étape 3 du
 *   document) — une victoire par RÈGLE, pas par hasard, donc une
 *   confiance haute est honnête, pas fabriquée.
 *
 * Palier additionnel — `0.90` ANALYSE DE PROJET DÉLIBÉRÉE : quand
 * `projectAnalysisOverride.js` a fait basculer `documentation_question` vers
 * `projects` (ex. "pourquoi ce projet est critique", voir
 * AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md), c'est ÉGALEMENT une
 * victoire par règle explicite, jamais un hasard d'égalité — même
 * discipline que la priorité procédurale ci-dessus, palier distinct
 * seulement parce que c'est une règle différente.
 *
 * Même principe pour les overrides des missions "CORRIGER LES 3
 * PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT" et "CORRIGER LA RECHERCHE/
 * DESCRIPTION D'UN PROJET PAR SON NOM" : `capabilityQuestionOverride.js`
 * (`general_chat` → `capability_audit`), `projectOwnershipOverride.js`
 * (`users` → `projects`) et `projectDescribeOverride.js` (`general_chat` →
 * `projects`) gagnent par une combinaison de mots explicite, pas
 * par un score lexical brut sur la clé finale (qui vaudrait souvent 0 —
 * aucun des mots qui déclenchent ces overrides n'est un mot-clé de la
 * catalogue) : sans palier dédié, `winnerScore === 0` retomberait sur
 * `0.30` REPLI, un mensonge sur une décision qui est en réalité une victoire
 * par RÈGLE explicite, pas une supposition.
 *
 * ## Entrée
 * `{ message, catalog, winnerKey, overriddenFrom? }` — `winnerKey` est LA
 * clé déjà choisie par le vrai routeur (jamais recalculée ici) ;
 * `overriddenFrom`, optionnel, est la clé que `projectAnalysisOverride.js`
 * a remplacée, s'il y a eu remplacement (voir intentDetector.js).
 *
 * ## Ambiguïté réelle (`ambiguous`) — un signal volontairement ÉTROIT
 * Le palier FAIBLE (0.55) à lui seul est TROP large pour déclencher une
 * clarification automatique : 39 des 536 scénarios déjà validés du corpus
 * (`test/fixtures/copilotValidationScenarios.js`) tombent dans ce palier
 * SANS être réellement ambigus pour un humain — leur égalité de score est
 * tranchée par l'ordre déjà délibéré du catalogue (voir les commentaires
 * "mots-clés EXCLUSIFS"/"placée juste avant general_chat" dans
 * `intentCatalog.js`), et déclencher une clarification sur chacun d'eux
 * serait une régression, pas une amélioration (vérifié par simulation
 * contre le corpus entier avant d'écrire cette règle). `ambiguous` n'est
 * donc `true` que pour la collision la plus étroite possible : le message
 * ENTIER ne contient qu'UN SEUL token qui matche un mot-clé du catalogue,
 * et ce token est partagé par deux intentions différentes (ex. "kpi",
 * présent à la fois dans `commercial_contacts` et `dashboard` —
 * "Quels sont mes KPI ?", voir AI-Business-Copilot/10_INTENT_ROUTING_FIX.md
 * étape 11) : aucun autre mot du message ne permet de trancher, donc
 * deviner plutôt que demander est la seule alternative — vérifié par
 * simulation : 0 des 536 scénarios existants ne déclenchent ce signal.
 *
 * ## Sortie
 * `{ confidence: number, entities: string[], ambiguous: boolean, alternateIntentKey: string|null }`
 * — `alternateIntentKey` est la clé du candidat concurrent réel (jamais
 * inventé) quand `ambiguous` est `true`, `null` sinon.
 */
function computeConfidenceAndEntities({ message, catalog, winnerKey, overriddenFrom = null }) {
  const terms = new Set(tokenize(message));

  const scoresByKey = new Map();
  const entities = [];
  const allMatchedTokens = new Set();
  for (const entry of catalog) {
    const keywords = (entry.keywords || []).map((kw) => kw.toLowerCase());
    const matched = keywords.filter((kw) => terms.has(kw));
    scoresByKey.set(entry.key, matched.length);
    matched.forEach((kw) => allMatchedTokens.add(kw));
    if (matched.length > 0 && ENTITY_BY_INTENT_KEY[entry.key]) {
      entities.push(ENTITY_BY_INTENT_KEY[entry.key]);
    }
  }

  const winnerScore = scoresByKey.get(winnerKey) || 0;
  let runnerUpScore = 0;
  let runnerUpKey = null;
  for (const [key, score] of scoresByKey) {
    if (key !== winnerKey && score > runnerUpScore) {
      runnerUpScore = score;
      runnerUpKey = key;
    }
  }
  const isTie = runnerUpScore >= winnerScore && winnerScore > 0;

  let confidence;
  // Ces trois branches sont vérifiées AVANT `winnerScore === 0` : contrairement
  // à la victoire "documentation_question" -> "projects" (où "projet" reste un
  // mot-clé RÉEL de `projects`, donc `winnerScore` > 0 de toute façon),
  // `capabilityQuestionOverride.js` gagne sur des mots ("peux"/"puis"/"je"/...)
  // qui ne sont volontairement AUCUN mot-clé du catalogue (voir sa docstring) —
  // sans cette priorité, `winnerScore === 0` mentirait en retombant sur 0.30
  // REPLI pour une décision qui est en réalité une victoire par règle explicite.
  if (overriddenFrom === "documentation_question" && winnerKey === "projects") {
    confidence = 0.9;
  } else if (overriddenFrom === "general_chat" && winnerKey === "capability_audit") {
    confidence = 0.9;
  } else if (overriddenFrom === "users" && winnerKey === "projects") {
    confidence = 0.9;
  } else if (overriddenFrom === "general_chat" && winnerKey === "projects") {
    confidence = 0.9;
  } else if (overriddenFrom === "projects" && winnerKey === "commercial_contacts") {
    confidence = 0.9;
  } else if (overriddenFrom === "general_chat" && winnerKey === "commercial_contacts") {
    confidence = 0.9;
  } else if (winnerScore === 0) {
    confidence = 0.3;
  } else if (isTie && winnerKey === "documentation_question") {
    confidence = 0.95;
  } else if (isTie) {
    confidence = 0.55;
  } else {
    confidence = 0.9;
  }

  const ambiguous = isTie && winnerKey !== "documentation_question" && overriddenFrom === null && allMatchedTokens.size === 1;

  return { confidence, entities, ambiguous, alternateIntentKey: ambiguous ? runnerUpKey : null };
}

module.exports = { computeConfidenceAndEntities, ENTITY_BY_INTENT_KEY };
