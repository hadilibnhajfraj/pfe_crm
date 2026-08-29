"use strict";

// Voir AI-Business-Copilot/10_INTENT_ROUTING_FIX.md (étape 10) —
// intentConfidence.js est une annotation additive en LECTURE SEULE de la
// décision déjà prise par le VRAI routeur (jamais un second choix
// concurrent). Ce fichier vérifie les 4 paliers de confiance contre le
// VRAI catalogue (DEFAULT_INTENT_CATALOG), pas une resimulation.

const { computeConfidenceAndEntities } = require("../src/ai/orchestrator/intentConfidence");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");

describe("computeConfidenceAndEntities", () => {
  test("palier REPLI (0.30) — aucun mot-clé ne matche, winnerKey = defaultIntentKey", () => {
    const { confidence, entities } = computeConfidenceAndEntities({
      message: "xyzxyz abcabc",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "general_chat",
      defaultIntentKey: "general_chat",
    });
    expect(confidence).toBe(0.3);
    expect(entities).toEqual([]);
  });

  test("palier FORT (0.90) — gagnant unique, aucune autre route n'égale son score", () => {
    const { confidence, entities } = computeConfidenceAndEntities({
      message: "Quels projets sont critiques ?",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "projects",
      defaultIntentKey: "general_chat",
    });
    expect(confidence).toBeGreaterThan(0.85);
    expect(entities).toEqual(["project"]);
  });

  test("palier PRIORITÉ PROCÉDURALE (0.95) — documentation_question l'emporte sur une égalité réelle", () => {
    const { confidence, entities } = computeConfidenceAndEntities({
      message: "Comment créer un projet ?",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "documentation_question",
      defaultIntentKey: "general_chat",
    });
    expect(confidence).toBeGreaterThan(0.9);
    // "projet" matche aussi l'entrée "projects" du catalogue, même si
    // l'intention gagnante est documentation_question — l'entité reste
    // détectée (elle décrit le SUJET du message, pas l'intention choisie).
    expect(entities).toEqual(["project"]);
  });

  test("palier FAIBLE (0.55) — une autre route égale ou dépasse le score du gagnant (hors priorité procédurale)", () => {
    // "projet" -> projects (1), "etape"/"étape" appartient aussi à
    // "projects" ET "pipeline" -> ici on construit une vraie égalité entre
    // deux intentions SANS documentation_question dans la course.
    const { confidence } = computeConfidenceAndEntities({
      message: "quelle est l'étape du pipeline pour ce projet ?",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "projects",
      defaultIntentKey: "general_chat",
    });
    expect(confidence).toBe(0.55);
  });

  test("le test de régression obligatoire (10_INTENT_ROUTING_FIX.md, étape 13) — 'donne-moi les instructions comment je peux créer un projet' reste priorité procédurale", () => {
    const { confidence, entities } = computeConfidenceAndEntities({
      message: "donne-moi les instructions comment je peux créer un projet",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "documentation_question",
      defaultIntentKey: "general_chat",
    });
    expect(confidence).toBeGreaterThan(0.9);
    expect(entities).toEqual(["project"]);
  });

  // AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md, étape 10 — palier
  // ANALYSE DE PROJET DÉLIBÉRÉE (0.90) : quand projectAnalysisOverride.js a
  // fait basculer documentation_question -> projects, ce n'est pas un
  // hasard d'égalité, exactement comme la priorité procédurale — même
  // discipline de confiance honnête, palier distinct seulement parce que
  // c'est une règle différente.
  test("palier ANALYSE DE PROJET (0.90) — le cas SBF exact, avec overriddenFrom renseigné", () => {
    const { confidence, entities, ambiguous } = computeConfidenceAndEntities({
      message: "pourquoi projet depot SBF est critique",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "projects",
      overriddenFrom: "documentation_question",
    });
    expect(confidence).toBe(0.9);
    expect(entities).toEqual(["project"]);
    expect(ambiguous).toBe(false);
  });

  test("overriddenFrom n'a aucun effet si winnerKey n'est pas 'projects' (garde stricte)", () => {
    const { confidence } = computeConfidenceAndEntities({
      message: "pourquoi projet depot SBF est critique",
      catalog: DEFAULT_INTENT_CATALOG,
      winnerKey: "documentation_question",
      overriddenFrom: "documentation_question",
    });
    // Une égalité réelle (documentation_question vs projects, 1 contre 1) —
    // sans bascule effective vers "projects", reste le palier PRIORITÉ
    // PROCÉDURALE habituel, jamais le palier ANALYSE DE PROJET.
    expect(confidence).toBe(0.95);
  });
});
