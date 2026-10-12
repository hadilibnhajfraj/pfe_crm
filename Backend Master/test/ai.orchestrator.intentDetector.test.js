"use strict";

const { IntentDetector, createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { IntentDetectionError, ConfigurationError } = require("../src/ai/orchestrator/errors");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");

const CATALOG = [
  { key: "hr", moduleKey: "hr", requiresRag: false, requiresTools: true, keywords: ["conge"], description: "HR" },
  { key: "fallback", moduleKey: null, requiresRag: true, requiresTools: false, keywords: [], description: "Fallback" },
  {
    key: "admin_only",
    moduleKey: "users",
    requiresRag: false,
    requiresTools: true,
    keywords: ["admin"],
    description: "Admin-only",
    requiredRoles: ["admin"],
    allowedEmails: ["root@example.com"],
  },
];

describe("IntentDetector", () => {
  test("throws ConfigurationError when defaultIntentKey is not in the catalog", () => {
    const router = { route: jest.fn() };
    expect(() => new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "does_not_exist" })).toThrow(ConfigurationError);
  });

  test("throws IntentDetectionError for an empty message, without calling the router", async () => {
    const router = { route: jest.fn() };
    const detector = new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "fallback" });
    await expect(detector.detect("   ")).rejects.toThrow(IntentDetectionError);
    expect(router.route).not.toHaveBeenCalled();
  });

  test("resolves the router's route key against the catalog", async () => {
    const router = { route: jest.fn(async () => "hr") };
    const detector = new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "fallback" });
    const intent = await detector.detect("je veux poser un congé", { user: { id: "u1" } });
    expect(router.route).toHaveBeenCalledWith("je veux poser un congé", { user: { id: "u1" } });
    expect(intent).toEqual({
      name: "hr",
      moduleKey: "hr",
      requiresRag: false,
      requiresTools: true,
      description: "HR",
      requiredRoles: [],
      allowedEmails: [],
      relatedModules: [],
      // AI-Business-Copilot/26_MEETING_AGENT_CONTINUITY.md — annotation
      // additive en lecture seule (voir intentDetector.js), `false` par
      // défaut pour toute entrée du catalogue de test qui ne la déclare pas
      // explicitement (CATALOG ci-dessus ne le fait pas).
      conversational: false,
      // Le routeur (mocké) choisit "hr" sans qu'aucun mot-clé du catalogue
      // ne matche réellement "je veux poser un congé" (mot-clé du
      // catalogue : "conge", sans accent) — score nul partout, donc palier
      // REPLI (0.3, voir intentConfidence.js), aucune entité détectée,
      // aucune ambiguïté (il n'y a pas de second candidat à départager).
      confidence: 0.3,
      entities: [],
      ambiguous: false,
      alternateIntent: null,
    });
  });

  test("carries through a catalog entry's relatedModules when declared (étape 6/7 — sélection de Tools cross-module)", async () => {
    const catalogWithRelated = [
      ...CATALOG,
      { key: "projects_like", moduleKey: "projects", relatedModules: ["dashboard"], requiresRag: false, requiresTools: true, keywords: ["projet"], description: "..." },
    ];
    const router = { route: jest.fn(async () => "projects_like") };
    const detector = new IntentDetector({ router, catalog: catalogWithRelated, defaultIntentKey: "fallback" });
    const intent = await detector.detect("quels projets sont en retard ?");
    expect(intent.relatedModules).toEqual(["dashboard"]);
  });

  test("defaults requiredRoles/allowedEmails to [] when a catalog entry doesn't declare them (étape 4 du workflow — permissions)", async () => {
    const router = { route: jest.fn(async () => "fallback") };
    const detector = new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "fallback" });
    const intent = await detector.detect("x");
    expect(intent.requiredRoles).toEqual([]);
    expect(intent.allowedEmails).toEqual([]);
  });

  test("carries through a catalog entry's requiredRoles/allowedEmails when declared", async () => {
    const router = { route: jest.fn(async () => "admin_only") };
    const detector = new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "fallback" });
    const intent = await detector.detect("admin stuff");
    expect(intent.requiredRoles).toEqual(["admin"]);
    expect(intent.allowedEmails).toEqual(["root@example.com"]);
  });

  test("falls back to defaultIntentKey when the router returns a key absent from the catalog", async () => {
    const router = { route: jest.fn(async () => "some_unknown_key") };
    const detector = new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "fallback" });
    const intent = await detector.detect("???");
    expect(intent.name).toBe("fallback");
  });

  test("wraps a router failure in IntentDetectionError", async () => {
    const router = { route: jest.fn(async () => { throw new Error("no route matched"); }) };
    const detector = new IntentDetector({ router, catalog: CATALOG, defaultIntentKey: "fallback" });
    await expect(detector.detect("x")).rejects.toThrow(IntentDetectionError);
  });
});

describe("createLexicalIntentDetector (default, offline)", () => {
  test("classifies a maintenance-flavored message into the 'maintenance' intent", async () => {
    const detector = createLexicalIntentDetector();
    const intent = await detector.detect("il y a une panne sur le site, il faut un technicien");
    expect(intent).toMatchObject({ name: "maintenance", moduleKey: "maintenance", requiresTools: true, requiresRag: false });
  });

  test("classifies a documentation-flavored message into 'documentation_question' (requiresRag)", async () => {
    const detector = createLexicalIntentDetector();
    const intent = await detector.detect("comment fonctionne l'architecture, peux-tu expliquer la documentation ?");
    expect(intent).toMatchObject({ name: "documentation_question", moduleKey: null, requiresRag: true, requiresTools: false });
  });

  test("falls back to 'general_chat' for a message matching no keyword", async () => {
    const detector = createLexicalIntentDetector();
    const intent = await detector.detect("bonjour, comment vas-tu ?".replace("comment", ""));
    expect(intent.name).toBe("general_chat");
  });

  test("every entry with a non-null moduleKey has requiresTools true (module-scoped Tools)", () => {
    for (const entry of DEFAULT_INTENT_CATALOG.filter((e) => e.moduleKey)) {
      expect(entry.requiresTools).toBe(true);
    }
  });

  test("every RAG-grounded entry (requiresRag: true) has moduleKey null and requiresTools false", () => {
    for (const entry of DEFAULT_INTENT_CATALOG.filter((e) => e.requiresRag)) {
      expect(entry.moduleKey).toBeNull();
      expect(entry.requiresTools).toBe(false);
    }
  });

  test("'automation', 'business_analysis', 'recommendation', 'data_quality', 'advanced_search', 'engineers', 'entity_lookup', 'crm_analytics' and 'multi_step_task' (Phase 3) are the intentional exceptions: requiresTools true with moduleKey null (a cross-module Tool search, not a missing module)", () => {
    const entries = DEFAULT_INTENT_CATALOG.filter((e) => e.requiresTools && !e.moduleKey);
    expect(entries.map((e) => e.key)).toEqual(["automation", "business_analysis", "recommendation", "data_quality", "advanced_search", "engineers", "entity_lookup", "crm_analytics", "multi_step_task"]);
  });
});
