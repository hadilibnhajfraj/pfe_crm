"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "IMPLÉMENTER HRAgent ET PorPromeshAgent" (P1). Tests structurels purs —
// aucun Tool exécuté ici, voir ai.orchestrator.porPromeshAgent.integration.test.js
// pour l'exécution réelle contre la vraie base.

const { createPorPromeshAgent, ALLOWED_TOOL_NAMES, REQUIRED_ROLES } = require("../src/ai/agents/porPromeshAgent");
const { BaseAgent } = require("../src/ai/agents/baseAgent");
const { AgentPermissionError } = require("../src/ai/agents/errors");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { UNVERIFIED_FINAL_ANSWER_MESSAGE } = require("../src/ai/langchain/chains/toolCallingChain");

const READ_WRITE_USER = { id: "rla-1", role: "responsable_logistique_achat" };

function buildAgent() {
  return createPorPromeshAgent({
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: jest.fn() },
    memory: null,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
  });
}

function listPorPromeshTool(records) {
  return {
    name: "list_por_promesh",
    description: "Liste les fiches POR PROMESH",
    invoke: jest.fn(async () => JSON.stringify({ data: records, total: records.length, page: 1, pages: 1, limit: 20 })),
  };
}

// Forme RÉELLE d'une fiche (voir src/models/PorPromesh.js) — jamais un champ
// inventé (machine:"PROMESH" comme les anciens mocks de ce fichier n'était
// pas une vraie valeur métier, seulement un texte de test).
function fiche(overrides = {}) {
  return {
    id: "5b79a635-af95-4e4f-b289-ffe0412c2dd5",
    sequenceNumber: 156,
    dateProduction: "2026-08-24",
    machine: "1",
    poste: "nuit",
    productionM2: 1500,
    status: "VALIDE",
    operateur: "production_2@cbi-tunisia.com",
    ...overrides,
  };
}

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

// Même besoin que projectAgent.test.js::chatModelSequence — chatModelReturning
// renvoie toujours la MÊME décision, insuffisant pour scripter un vrai
// enchaînement "appelle l'outil, PUIS répond" sur 2 tours.
function chatModelSequence(...decisions) {
  const complete = jest.fn();
  decisions.forEach((decision) => complete.mockResolvedValueOnce(JSON.stringify(decision)));
  return new LlmProviderChatModel({ llmProvider: { complete } });
}

describe("PorPromeshAgent — structure", () => {
  test("name='por_promesh_agent', instance de BaseAgent, gère uniquement l'intention 'por_promesh'", () => {
    const agent = buildAgent();
    expect(agent).toBeInstanceOf(BaseAgent);
    expect(agent.name).toBe("por_promesh_agent");
    expect(agent.intentNames).toEqual(["por_promesh"]);
    expect(agent.canHandle({ name: "por_promesh" })).toBe(true);
    expect(agent.canHandle({ name: "industrial" })).toBe(false);
    expect(agent.canHandle({ name: "hr" })).toBe(false);
  });

  test("allowedToolNames = EXACTEMENT les 10 Tools POR PROMESH réels, aucun autre", () => {
    const agent = buildAgent();
    expect(agent.allowedToolNames).toEqual(ALLOWED_TOOL_NAMES);
    expect(agent.allowedToolNames.sort()).toEqual(
      [
        "list_por_promesh",
        "get_por_promesh",
        "create_por_promesh",
        "create_or_open_por_promesh_draft",
        "update_por_promesh",
        "delete_por_promesh",
        "validate_por_promesh",
        "get_por_promesh_stats",
        "get_por_promesh_dashboard",
        "list_por_promesh_operators",
      ].sort()
    );
  });

  test("requiredRoles = EXACTEMENT le même READ_WRITE_ROLES que chaque Tool POR PROMESH (même discipline que IndustrialAgent)", () => {
    const agent = buildAgent();
    expect(agent.requiredRoles).toEqual(REQUIRED_ROLES);
    expect([...REQUIRED_ROLES].sort()).toEqual(["admin", "responsable_logistique_achat", "superadmin", "superadmin2"].sort());
  });

  test("TEST OBLIGATOIRE — un rôle hors READ_WRITE_ROLES (commercial/user/accueil/finance_probar) est refusé AU NIVEAU AGENT, avant tout Tool", async () => {
    const agent = buildAgent();
    for (const role of ["commercial", "user", "accueil", "finance_probar"]) {
      await expect(
        agent.execute({ intent: { name: "por_promesh" }, message: "Mes dossiers POR PROMESH", user: { id: "u1", role }, conversationId: "c1" })
      ).rejects.toBeInstanceOf(AgentPermissionError);
    }
  });

  test("les 4 rôles READ_WRITE_ROLES ne sont jamais refusés au niveau Agent", async () => {
    const agent = buildAgent();
    for (const role of REQUIRED_ROLES) {
      const result = await agent.execute({ intent: { name: "por_promesh" }, message: "Mes dossiers POR PROMESH", user: { id: "u1", role }, conversationId: "c1" });
      expect(typeof result.answer).toBe("string");
    }
  });
});

// Mission "CORRIGER DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO
// PROBAR" — reproduit en direct : ces mêmes formulations ("fiche(s)" +
// "promesh", sans critère de filtre réel) retournaient parfois "aucune fiche
// trouvée avec le terme..." parce que le LLM ajoutait un filtre `search`
// inutile, ou hallucinait carrément une réponse. `PorPromeshAgent::_run()`
// intercepte désormais ces 5 formulations AVANT le LLM (chemin 100%
// déterministe, voir porPromeshAgent.js) — remplace l'ancien test
// requireToolUse (qui exerçait le chemin LLM générique pour CES messages
// précis, devenu obsolète puisqu'ils n'atteignent plus jamais le LLM).
describe("PorPromeshAgent — 'toutes les fiches' est 100% déterministe, jamais le LLM", () => {
  test.each([
    "donner moi les fiches produites PROMESH",
    "Donne-moi les fiches POR PROMESH",
    "Liste les fiches POR PROMESH",
    "Montre-moi les fiches PROMESH",
    "donner moi tous les fiche PRO PROMESH",
  ])('"%s" -> list_por_promesh({}) appelé directement, AUCUN appel LLM, données réelles', async (message) => {
    const tool = listPorPromeshTool([fiche()]);
    const completeSpy = jest.fn();
    const chatModel = new LlmProviderChatModel({ llmProvider: { complete: completeSpy } });
    const agent = createPorPromeshAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message, user: READ_WRITE_USER, conversationId: "c1" });

    expect(completeSpy).not.toHaveBeenCalled();
    expect(tool.invoke).toHaveBeenCalledWith({});
    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0].tool).toBe("list_por_promesh");
    expect(result.answer).toContain("Séquence 156");
    expect(result.answer).not.toMatch(/aucune fiche/i);
  });

  test("aucune fiche réelle -> réponse honnête, jamais de fabrication, Tool quand même appelé", async () => {
    const tool = listPorPromeshTool([]);
    const agent = createPorPromeshAgent({ chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }), tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message: "Liste les fiches POR PROMESH", user: READ_WRITE_USER, conversationId: "c1" });

    expect(tool.invoke).toHaveBeenCalledWith({});
    expect(result.answer).toBe("Aucune fiche PROMESH n'a été trouvée.");
  });

  test("« donne moi la fiche PROMESH 156 » -> recherche ciblée par numéro de séquence, jamais la liste complète", async () => {
    const tool = listPorPromeshTool([fiche({ sequenceNumber: 156 }), fiche({ id: "other", sequenceNumber: 157, dateProduction: "2026-08-25" })]);
    const agent = createPorPromeshAgent({ chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }), tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message: "donne moi la fiche PROMESH 156", user: READ_WRITE_USER, conversationId: "c1" });

    expect(result.answer).toContain("156");
    expect(result.answer).not.toContain("157");
    expect(result.answer).toContain("production_2@cbi-tunisia.com");
  });

  test("numéro de séquence introuvable -> réponse honnête, jamais un id inventé", async () => {
    const tool = listPorPromeshTool([fiche({ sequenceNumber: 156 })]);
    const agent = createPorPromeshAgent({ chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }), tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message: "détaille la fiche 999", user: READ_WRITE_USER, conversationId: "c1" });

    expect(result.answer).toBe("Aucune fiche PROMESH n'a été trouvée avec le numéro de séquence 999.");
  });
});

// Correction P1.1 (mission "CORRECTION P1 DU COPILOT IA PROBAR") —
// diagnostiqué en direct contre Ollama/qwen3:8b : pour "donner moi les
// fiches produites PROMESH", le modèle répondait un final_answer dès le
// premier tour (toolCalls: [], completion=75 tokens) sans jamais appeler
// list_por_promesh. `por_promesh_agent` est désormais construit avec
// `requireToolUse: true` (voir porPromeshAgent.js::createPorPromeshAgent),
// même garantie déjà verrouillée pour project_agent. La garde vit dans
// ToolCallingChain (voir toolCallingChain.js) et ne dépend QUE de
// `steps.length`, jamais du texte du message. Mission "CORRIGER
// DÉFINITIVEMENT LES REQUÊTES FICHES PRO PROMESH / PRO PROBAR" — reformulé
// avec un critère de DATE explicite (voir ÉTAPE 6 : "fiches PROMESH du
// 24/08" = filtre, jamais "toutes les fiches") pour continuer à exercer le
// chemin LLM générique résiduel, désormais le seul que ces messages
// atteignent encore (voir PorPromeshAgent::_looksLikeFilteredQuery).
describe("PorPromeshAgent — requireToolUse sur le chemin générique résiduel (demande avec critère de filtre réel)", () => {
  test('"Donne-moi les fiches PROMESH du 24/08" — un final_answer SANS appel réel à list_por_promesh est rejeté et remplacé par une réponse honnête', async () => {
    const tool = listPorPromeshTool([fiche()]);
    const chatModel = chatModelReturning({
      action: "final_answer",
      answer: "J'utilise l'outil list_por_promesh : voici vos fiches PROMESH (données inventées).",
    });
    const agent = createPorPromeshAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message: "Donne-moi les fiches PROMESH du 24/08", user: READ_WRITE_USER, conversationId: "c1" });

    expect(result.answer).toBe(UNVERIFIED_FINAL_ANSWER_MESSAGE);
    expect(result.answer).not.toContain("données inventées");
    expect(result.toolSteps).toEqual([]);
    expect(tool.invoke).not.toHaveBeenCalled();
  });

  test('"Donne-moi les fiches PROMESH du 24/08" — un final_answer qui arrive APRÈS un vrai appel à list_por_promesh est accepté normalement', async () => {
    const tool = listPorPromeshTool([fiche()]);
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_por_promesh", input: { date: "2026-08-24" } },
      { action: "final_answer", answer: "Vous avez 1 fiche POR PROMESH du 24/08." }
    );
    const agent = createPorPromeshAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message: "Donne-moi les fiches PROMESH du 24/08", user: READ_WRITE_USER, conversationId: "c1" });

    expect(result.answer).toBe("Vous avez 1 fiche POR PROMESH du 24/08.");
    expect(result.toolSteps).toHaveLength(1);
    expect(tool.invoke).toHaveBeenCalledTimes(1);
  });
});

// Étape 1.4 — non-régression : une question qui ne nécessite PAS de donnée
// CRM (question de capacité, pas de lecture de fiche) ne doit ni boucler
// ni timeout. `requireToolUse` est un mécanisme structurel qui ne distingue
// PAS "ce tour avait besoin d'un Tool" de "ce tour n'en avait pas besoin" —
// exactement le même compromis déjà accepté pour project_agent (voir
// AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md). Documenté ici tel
// quel, sans le corriger (hors périmètre du correctif minimal demandé) :
// si le modèle choisit de répondre directement sans appeler d'outil, la
// garde renvoie le même message générique — jamais une boucle, jamais un
// timeout, un seul appel LLM.
describe("PorPromeshAgent — non-régression : question de capacité (pas de Tool nécessaire)", () => {
  test("« Que peux-tu faire avec POR PROMESH ? » — un seul appel LLM, aucune boucle, aucun timeout, même si aucun Tool n'est appelé", async () => {
    const tool = listPorPromeshTool([]);
    const completeSpy = jest.fn(async () => JSON.stringify({ action: "final_answer", answer: "Je peux lister, créer et valider des fiches POR PROMESH." }));
    const chatModel = new LlmProviderChatModel({ llmProvider: { complete: completeSpy } });
    const agent = createPorPromeshAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), maxToolCalls: 5, maxHistoryMessages: 6 });

    const result = await agent.execute({ intent: { name: "por_promesh" }, message: "Que peux-tu faire avec POR PROMESH ?", user: READ_WRITE_USER, conversationId: "c1" });

    // Un seul tour, pas de relance en boucle vers le modèle (preuve directe
    // d'absence de boucle infinie) :
    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(tool.invoke).not.toHaveBeenCalled();
    // Limite CONNUE et déjà documentée : requireToolUse remplace ce
    // final_answer légitime par le message générique, comme pour
    // project_agent sur une question équivalente — PAS une réponse
    // inventée, PAS une boucle, PAS un timeout, mais pas non plus la
    // réponse la plus utile possible pour une question sans donnée à lire.
    expect(result.answer).toBe(UNVERIFIED_FINAL_ANSWER_MESSAGE);
  });
});
