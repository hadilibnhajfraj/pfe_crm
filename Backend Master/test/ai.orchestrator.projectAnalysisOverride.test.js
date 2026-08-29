"use strict";

// AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md — la cause exacte de
// "pourquoi projet depot SBF est critique" routé vers
// documentation_question/crm_assistant_agent (bug rapporté), l'exception
// délibérée et étroite qui la corrige, et la PREUVE qu'un mot-clé de
// catalogue global (essayé d'abord, rejeté) aurait cassé 3 scénarios déjà
// validés du corpus.

const { applyProjectAnalysisOverride, isProjectStateAnalysisQuestion } = require("../src/ai/orchestrator/projectAnalysisOverride");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");

const catalogByKey = new Map(DEFAULT_INTENT_CATALOG.map((e) => [e.key, e]));

describe("isProjectStateAnalysisQuestion — la combinaison étroite (jamais un mot seul)", () => {
  test.each([
    "pourquoi projet depot SBF est critique",
    "Pourquoi le projet Depot SBF est critique ?",
    "Pourquoi le projet X est critique ?",
    "Pourquoi ce projet est bloqué ?",
    "Pourquoi ce projet est à risque ?",
  ])("vrai pour %s (pourquoi + projet + mot d'état, les 3 ensemble)", (message) => {
    expect(isProjectStateAnalysisQuestion(message)).toBe(true);
  });

  test.each([
    ["pourquoi ce projet est en retard", "'retard' n'a pas besoin de cette règle — déjà un mot-clé sûr de `projects`"],
    ["ce projet est critique", "aucun marqueur analytique ('pourquoi') — une affirmation, pas une question"],
    ["pourquoi le tableau de bord est critique", "aucune référence à un PROJET"],
  ])("faux pour %s (%s)", (message) => {
    expect(isProjectStateAnalysisQuestion(message)).toBe(false);
  });

  // Limite assumée, documentée honnêtement plutôt que cachée : la règle ne
  // sait pas distinguer "une règle générale sur les projets" d'un état réel
  // dès que les 3 signaux sont réunis — un cas plus contrivé que le bug
  // rapporté, non couvert par le corpus existant.
  test("limite assumée : une question de RÈGLE générale qui mentionne aussi un mot d'état bascule quand même (pas de faux négatif recherché)", () => {
    expect(isProjectStateAnalysisQuestion("pourquoi certains projets nécessitent une validation critique")).toBe(true);
  });
});

describe("applyProjectAnalysisOverride — ne s'applique QUE sur une victoire documentation_question", () => {
  test("bascule documentation_question -> projects sur le cas SBF", () => {
    expect(applyProjectAnalysisOverride("pourquoi projet depot SBF est critique", "documentation_question", catalogByKey)).toBe("projects");
  });

  test("ne touche jamais une autre clé gagnante (ex. déjà 'projects', déjà 'dashboard')", () => {
    expect(applyProjectAnalysisOverride("pourquoi projet depot SBF est critique", "projects", catalogByKey)).toBe("projects");
    expect(applyProjectAnalysisOverride("pourquoi projet depot SBF est critique", "dashboard", catalogByKey)).toBe("dashboard");
  });

  test("ne s'applique jamais si le catalogue fourni n'a pas d'intention 'projects'", () => {
    const customCatalog = new Map([["documentation_question", { key: "documentation_question" }]]);
    expect(applyProjectAnalysisOverride("pourquoi projet depot SBF est critique", "documentation_question", customCatalog)).toBe("documentation_question");
  });

  test("laisse intact un documentation_question SANS mot d'état de projet (ex. doc-13 du corpus)", () => {
    const message = "Pourquoi certains projets nécessitent-ils une validation supplémentaire ? Explique-moi.";
    expect(applyProjectAnalysisOverride(message, "documentation_question", catalogByKey)).toBe("documentation_question");
  });
});

describe("Régression — mots-clé de catalogue REJETÉS (preuve qu'un mot-clé global aurait cassé le corpus)", () => {
  const det = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });

  test("'critique' reste absent des mots-clés globaux de `projects` — sinon rec-12/rec-20/mnt-14 basculeraient à tort", async () => {
    const projectsEntry = DEFAULT_INTENT_CATALOG.find((e) => e.key === "projects");
    expect(projectsEntry.keywords).not.toContain("critique");
    expect(projectsEntry.keywords).not.toContain("critiques");
  });

  test("un message recommendation qui mentionne aussi 'projets critiques' reste `recommendation`, jamais `projects`", async () => {
    const r = await det.detect("Peux-tu me conseiller et prioriser les projets critiques à surveiller ?", {});
    expect(r.name).toBe("recommendation");
  });

  test("un message maintenance qui mentionne 'urgence critique' reste `maintenance`, jamais `projects`", async () => {
    const r = await det.detect("Liste toutes les demandes de maintenance filtrées par urgence critique.", {});
    expect(r.name).toBe("maintenance");
  });
});
