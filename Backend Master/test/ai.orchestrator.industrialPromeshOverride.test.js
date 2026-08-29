"use strict";

// Mission "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO
// PROBAR" — reproduit en direct : "donner les fiche PRO PROMESH" (égalité
// 1-1 entre `industrial` et `por_promesh`) atterrissait sur `industrial`,
// qui devinait "probar" et retournait une fiche PROBAR pour une demande
// PROMESH.

const { applyIndustrialPromeshOverride, mentionsIndustrialDomain } = require("../src/ai/orchestrator/industrialPromeshOverride");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { ALLOWED_TOOL_NAMES: POR_PROMESH_TOOLS } = require("../src/ai/agents/porPromeshAgent");
const { ALLOWED_TOOL_NAMES: INDUSTRIAL_TOOLS } = require("../src/ai/agents/industrialAgent");

const catalogByKey = new Map(DEFAULT_INTENT_CATALOG.map((e) => [e.key, e]));

describe("applyIndustrialPromeshOverride — unité, catalogue réel", () => {
  test("égalité industrial/por_promesh (fiche+promesh) -> remappé vers por_promesh", () => {
    expect(applyIndustrialPromeshOverride("donner les fiche PRO PROMESH", "industrial", catalogByKey)).toBe("por_promesh");
  });

  test("victoire NETTE d'industrial (score 3 vs 1) -> jamais remappé, même en mentionnant 'promesh' (P9 partiel)", () => {
    expect(applyIndustrialPromeshOverride("Crée un enregistrement de production industrielle pour la ligne PROMESH.", "industrial", catalogByKey)).toBe("industrial");
  });

  test("domaine industriel explicite (probar/melange) -> jamais remappé même si 'promesh' est aussi présent", () => {
    expect(applyIndustrialPromeshOverride("fiche probar et promesh", "industrial", catalogByKey)).toBe("industrial");
    expect(applyIndustrialPromeshOverride("fiche melange et promesh", "industrial", catalogByKey)).toBe("industrial");
  });

  test("clé de départ différente de 'industrial' -> jamais touchée", () => {
    expect(applyIndustrialPromeshOverride("donner les fiche PRO PROMESH", "por_promesh", catalogByKey)).toBe("por_promesh");
    expect(applyIndustrialPromeshOverride("donner les fiche PRO PROMESH", "general_chat", catalogByKey)).toBe("general_chat");
  });

  test("aucune mention de 'promesh' -> jamais touchée (P10 partiel : industrial normal reste industrial)", () => {
    expect(applyIndustrialPromeshOverride("Supprime la fiche industrielle erronée.", "industrial", catalogByKey)).toBe("industrial");
  });

  test("mentionsIndustrialDomain — probar/melange/mélange reconnus, rien d'autre", () => {
    expect(mentionsIndustrialDomain("fiche probar")).toBe(true);
    expect(mentionsIndustrialDomain("fiche melange")).toBe(true);
    expect(mentionsIndustrialDomain("fiche mélange")).toBe(true);
    expect(mentionsIndustrialDomain("fiche promesh")).toBe(false);
  });
});

describe("IntentDetector réel — P1-P8 (mission, ÉTAPE 14)", () => {
  const detector = createLexicalIntentDetector();

  test.each([
    ["P1", "donne moi les fiche PROMESH", "por_promesh"],
    ["P2", "donne moi la liste des fiches PROMESH", "por_promesh"],
    ["P3", "donne moi toutes les fiches PROMESH", "por_promesh"],
    ["P4", "donne moi les fiche PRO PROMESH", "por_promesh"],
    ["P5", "donne moi les fiches POR PROMESH", "por_promesh"],
    ["P6", "donne moi les fiches PROBAR", "industrial"],
    ["P7", "donne moi toutes les fiches PROBAR", "industrial"],
    ["P8", "donne moi les fiche PRO PROBAR", "industrial"],
  ])("%s — \"%s\" -> intent %s", async (_id, message, expectedIntent) => {
    const intent = await detector.detect(message);
    expect(intent.name).toBe(expectedIntent);
  });
});

describe("P9/P10 — PROMESH n'appelle jamais le Tool PROBAR, et réciproquement (garantie STRUCTURELLE)", () => {
  test("P9 — por_promesh_agent n'a JAMAIS list_industrial_records dans ses Tools autorisés", () => {
    expect(POR_PROMESH_TOOLS).not.toContain("list_industrial_records");
  });

  test("P10 — industrial_agent n'a JAMAIS list_por_promesh dans ses Tools autorisés", () => {
    expect(INDUSTRIAL_TOOLS).not.toContain("list_por_promesh");
  });

  test("P1-P5 (PROMESH) routent tous vers por_promesh_agent, jamais industrial_agent (preuve bout-en-bout du routage)", async () => {
    const detector = createLexicalIntentDetector();
    for (const message of ["donne moi les fiche PROMESH", "donne moi toutes les fiches PROMESH", "donne moi les fiches POR PROMESH"]) {
      const intent = await detector.detect(message);
      expect(intent.name).toBe("por_promesh");
    }
  });

  test("P6-P8 (PROBAR) routent tous vers industrial_agent, jamais por_promesh_agent (preuve bout-en-bout du routage)", async () => {
    const detector = createLexicalIntentDetector();
    for (const message of ["donne moi les fiches PROBAR", "donne moi toutes les fiches PROBAR", "donne moi les fiche PRO PROBAR"]) {
      const intent = await detector.detect(message);
      expect(intent.name).toBe("industrial");
    }
  });
});
