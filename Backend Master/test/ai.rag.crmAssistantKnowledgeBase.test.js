"use strict";

/**
 * # La base de connaissances du CRM Assistant (`docs/user-guide/`)
 *
 * Vérifie, contre le VRAI pipeline RAG (ingestion + récupération réelles,
 * jamais un mock) que la base de connaissances écrite pour le CRM Assistant :
 * - s'ingère sans erreur (chaque fichier produit au moins un chunk) ;
 * - répond correctement aux 5 parcours explicitement demandés (« Comment
 *   créer un projet ? », etc.) — le document attendu ressort en 1ère
 *   position, avec des citations exploitables ;
 * - reste un pipeline entièrement hors-ligne (même `HashingEmbeddingProvider`
 *   que le reste du kernel, voir `src/ai/README.md`, décision Sprint 0).
 *
 * Voir `src/ai/orchestrator/CRM_ASSISTANT.md` pour la méthodologie complète
 * (comment le contenu de chaque guide a été vérifié contre le vrai code
 * Flutter/backend plutôt qu'inventé).
 */

const path = require("path");
const { createRagPipeline } = require("../src/ai/rag/pipeline");

const USER_GUIDE_ROOT = path.join(__dirname, "..", "docs", "user-guide");
const REPO_ROOT = path.join(__dirname, "..");

async function buildIngestedPipeline() {
  const pipeline = createRagPipeline({ allowedRoots: [USER_GUIDE_ROOT], displayRoot: REPO_ROOT });
  const results = await pipeline.ingestionService.ingestDirectories([USER_GUIDE_ROOT]);
  return { pipeline, results };
}

describe("Base de connaissances CRM Assistant — ingestion", () => {
  test("les 7 guides (5 parcours + vue d'ensemble + guide Copilot) s'ingèrent tous sans erreur", async () => {
    const { results } = await buildIngestedPipeline();
    expect(results).toHaveLength(7);
    for (const r of results) {
      expect(r.error).toBeUndefined();
      expect(r.chunkCount).toBeGreaterThan(0);
    }
  });

  test("chaque guide produit au moins un chunk avec un titre (heading) exploitable pour une citation", async () => {
    const { pipeline } = await buildIngestedPipeline();
    const res = await pipeline.retrievalService.retrieve("Comment créer un projet ?");
    expect(res.results.length).toBeGreaterThan(0);
    for (const r of res.results) {
      expect(typeof r.title).toBe("string");
      expect(r.title.length).toBeGreaterThan(0);
    }
  });
});

describe("Base de connaissances CRM Assistant — les 5 parcours demandés retrouvent le bon guide", () => {
  const CASES = [
    ["Comment créer un projet ?", "Comment créer un projet dans le CRM"],
    ["Comment créer un client ?", "Comment créer un client (contact commercial) dans le CRM"],
    ["Comment envoyer un devis ?", "Comment envoyer un devis dans le CRM"],
    ["Comment créer une intervention ?", "Comment créer une intervention (demande de maintenance) dans le CRM"],
    ["Comment modifier une opportunité ?", "Comment modifier une opportunité dans le CRM"],
  ];

  test.each(CASES)("« %s » → le guide en 1ère position est « %s »", async (question, expectedTitle) => {
    const { pipeline } = await buildIngestedPipeline();
    const res = await pipeline.retrievalService.retrieve(question);
    expect(res.results.length).toBeGreaterThan(0);
    expect(res.results[0].title).toBe(expectedTitle);
  });
});

describe("Base de connaissances CRM Assistant — contenu réel, pas de placeholder", () => {
  test("le guide 'créer un projet' cite les 5 étapes réelles de l'assistant (jamais un écran fictif)", async () => {
    const { pipeline } = await buildIngestedPipeline();
    const res = await pipeline.retrievalService.retrieve("étapes du formulaire de création de projet Général Détails Contacts Localisation Action");
    const combined = res.results.map((r) => r.text).join(" ");
    for (const step of ["Général", "Détails", "Contacts", "Localisation", "Action"]) {
      expect(combined).toContain(step);
    }
  });

  test("le guide 'opportunité' documente honnêtement l'écart réel entre les valeurs affichées à l'écran et celles acceptées par le serveur", async () => {
    const { pipeline } = await buildIngestedPipeline();
    const res = await pipeline.retrievalService.retrieve("valeurs pipeline stage acceptées par le serveur Plan technique Échantillonnage Relance incohérence");
    const combined = res.results.map((r) => r.text).join(" ");
    expect(combined).toMatch(/Point d'attention réel|n'autorise techniquement que/);
  });
});
