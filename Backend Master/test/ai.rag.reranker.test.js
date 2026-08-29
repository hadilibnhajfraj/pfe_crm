"use strict";

const { LexicalOverlapReranker, categorizePath } = require("../src/ai/rag/reranking");

describe("LexicalOverlapReranker", () => {
  test("returns an empty array unchanged", async () => {
    const reranker = new LexicalOverlapReranker();
    await expect(reranker.rerank("query", [])).resolves.toEqual([]);
  });

  test("a candidate with strong lexical overlap can overtake one with a higher vector score alone", async () => {
    const reranker = new LexicalOverlapReranker({ vectorWeight: 0.5, lexicalWeight: 0.5 });
    const candidates = [
      { id: "vector-only", score: 0.9, metadata: { text: "completely unrelated content about something else" } },
      { id: "exact-terms", score: 0.55, metadata: { text: "password reset forgot password login screen" } },
    ];
    const results = await reranker.rerank("password reset forgot password", candidates);
    expect(results[0].id).toBe("exact-terms");
  });

  test("attaches vectorScore/lexicalScore alongside the blended score, without mutating the input array", async () => {
    const reranker = new LexicalOverlapReranker();
    const candidates = [{ id: "a", score: 0.4, metadata: { text: "hello world" } }];
    const [result] = await reranker.rerank("hello", candidates);
    expect(result.vectorScore).toBe(0.4);
    expect(result.lexicalScore).toBeGreaterThan(0);
    expect(result.score).not.toBe(candidates[0].score);
    expect(candidates[0].score).toBe(0.4); // original object untouched
  });

  test("zero lexical overlap still ranks by vector score (lexicalScore contributes 0)", async () => {
    const reranker = new LexicalOverlapReranker({ vectorWeight: 1, lexicalWeight: 0 });
    const candidates = [
      { id: "low", score: 0.2, metadata: { text: "totally different words here" } },
      { id: "high", score: 0.8, metadata: { text: "also totally different words" } },
    ];
    const results = await reranker.rerank("nothing in common", candidates);
    expect(results.map((r) => r.id)).toEqual(["high", "low"]);
  });

  test("candidates missing metadata.text are scored with zero lexical overlap, not an error", async () => {
    const reranker = new LexicalOverlapReranker();
    const candidates = [{ id: "no-text", score: 0.5, metadata: {} }];
    await expect(reranker.rerank("anything", candidates)).resolves.toHaveLength(1);
  });

  test("candidates missing metadata.path (pre-existing tests above) are unaffected — categorizePath falls back to \"functional\" (factor 1.0, neutral)", async () => {
    const reranker = new LexicalOverlapReranker();
    const [result] = await reranker.rerank("hello", [{ id: "a", score: 0.4, metadata: { text: "hello world" } }]);
    expect(result.category).toBe("functional");
    expect(result.categoryFactor).toBe(1.0);
  });
});

describe("categorizePath — dérivé du champ `path` déjà présent sur chaque chunk (aucune nouvelle métadonnée)", () => {
  test.each([
    ["c:/repo/Backend Master/docs/user-guide/01-creer-un-projet.md", "user_guide"],
    ["c:\\repo\\Backend Master\\docs\\user-guide\\01-creer-un-projet.md", "user_guide"], // backslash Windows path
    ["docs/user-guide/01-creer-un-projet.md", "user_guide"], // relative POSIX path
    ["c:/repo/Backend Master/docs/admin-guide/copilot-administration.md", "admin_guide"],
    ["c:/repo/Backend Master/docs/ai/INTENT_ROUTING.md", "ai_internal"],
    ["c:/repo/AI-Business-Copilot/14_PROJECT_ANALYSIS_ROUTING.md", "ai_internal"],
    ["c:/repo/Backend Master/src/ai/README.md", "ai_internal"],
    ["c:/repo/Backend Master/docs/audit/Enterprise_Audit.md", "audit_report"],
    ["c:/repo/Backend Master/docs/security/Security_Report.md", "audit_report"],
    ["c:/repo/Backend Master/docs/performance/Optimization_Report.md", "audit_report"],
    ["c:/repo/CRM_Architecture_Complète.pdf", "architecture"],
    ["c:/repo/Backend Master/GOOGLE_CALENDAR_SETUP.md", "functional"], // legitimate functional doc, just unclassified — neutral, not penalized
    [undefined, "functional"],
    [null, "functional"],
  ])("%s → %s", (path, expectedCategory) => {
    expect(categorizePath(path)).toBe(expectedCategory);
  });
});

// AI-Business-Copilot/22_RAG_USER_GUIDE_PRIORITY.md — reproduit en direct
// contre le vrai corpus (voir le rapport) : pour "comment créer un nouveau
// projet", `docs/ai/INTENT_ROUTING.md` (qui répète la question comme
// EXEMPLE de routage) obtenait un score lexical (~0.50) 6x plus élevé que
// le vrai guide procédural (~0.08), qui parle des étapes/champs/boutons
// plutôt que de répéter la question — sans le facteur de catégorie, le
// document technique gagnait alors que le vrai guide était disponible.
describe("LexicalOverlapReranker — priorité aux documents user-guide (bug qwen3/RAG reproduit en direct)", () => {
  test("un document technique qui RÉPÈTE la question (fort score lexical) ne doit plus dépasser le vrai guide procédural (score lexical faible mais catégorie user-guide)", async () => {
    const reranker = new LexicalOverlapReranker();
    const candidates = [
      {
        id: "intent-routing",
        score: 0.68, // score vectoriel élevé, mesuré en direct
        metadata: {
          path: "c:/repo/Backend Master/docs/ai/INTENT_ROUTING.md",
          text: '"Comment créer un projet ?" (seul) → documentation_question. "Comment créer un projet ?" → { intent: "documentation_question", confidence: 0.95 }',
        },
      },
      {
        id: "real-guide",
        score: 0.47, // score vectoriel plus faible, mesuré en direct
        metadata: {
          path: "c:/repo/Backend Master/docs/user-guide/01-creer-un-projet.md",
          text: "L'écran de création de projet permet d'enregistrer un nouveau chantier. Formulaire en 5 étapes : Général, Détails, Contacts, Localisation, Action.",
        },
      },
    ];

    const results = await reranker.rerank("comment créer un nouveau projet", candidates);

    expect(results[0].id).toBe("real-guide");
    expect(results[0].category).toBe("user_guide");
    expect(results[1].id).toBe("intent-routing");
    expect(results[1].category).toBe("ai_internal");
  });

  test("categoryFactor discounte, ne supprime jamais — un document technique reste présent dans les résultats, juste moins prioritaire", async () => {
    const reranker = new LexicalOverlapReranker();
    const candidates = [{ id: "technical", score: 0.9, metadata: { path: "c:/repo/AI-Business-Copilot/10_INTENT_ROUTING_FIX.md", text: "contenu technique" } }];
    const results = await reranker.rerank("question quelconque", candidates);
    expect(results).toHaveLength(1); // toujours présent
    expect(results[0].categoryFactor).toBeLessThan(1); // seulement moins prioritaire
  });

  test("un document user-guide légitimement plus pertinent (score vectoriel/lexical dominant) l'emporte toujours sur un autre document user-guide moins pertinent", async () => {
    const reranker = new LexicalOverlapReranker();
    const candidates = [
      { id: "devis", score: 0.3, metadata: { path: "c:/repo/Backend Master/docs/user-guide/03-envoyer-un-devis.md", text: "comment envoyer un devis" } },
      { id: "projet", score: 0.6, metadata: { path: "c:/repo/Backend Master/docs/user-guide/01-creer-un-projet.md", text: "comment créer un nouveau projet étapes" } },
    ];
    const results = await reranker.rerank("comment créer un nouveau projet", candidates);
    expect(results[0].id).toBe("projet");
  });
});
