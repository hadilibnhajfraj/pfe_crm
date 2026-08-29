"use strict";

const { createRecommendationAgent, RecommendationAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/recommendationAgent");
const { SuggestionEngine } = require("../src/ai/orchestrator/suggestionEngine");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "user" };
const ADMIN = { id: "u2", role: "admin" };
const DAY = 24 * 60 * 60 * 1000;

function daysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString();
}

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function listProjectsTool(projects) {
  return { name: "list_projects", description: "d", invoke: jest.fn(async () => JSON.stringify({ data: projects, total: projects.length })) };
}

function maintenanceStatsTool(stats) {
  return { name: "get_maintenance_stats", description: "d", invoke: jest.fn(async () => JSON.stringify(stats)) };
}

function testSuggestionEngine() {
  return new SuggestionEngine({
    toolPermissionIndex: new Map([
      ["create_calendar_event", { requiredRoles: [], allowedEmails: [] }],
      ["send_notification_email", { requiredRoles: ["admin", "superadmin", "superadmin2"], allowedEmails: [] }],
    ]),
  });
}

function baseProjectCard(overrides = {}) {
  return {
    id: "proj-1",
    nomProjet: "Chantier Test",
    nextRelanceDate: null,
    dateLimiteIngenieur: null,
    lastAction: null,
    pipelineStageId: "stage-1",
    stage: { name: "Ouvert", isWonStage: false, isLostStage: false },
    pourcentageReussite: 80,
    createdAt: daysAgo(10),
    updatedAt: daysAgo(1),
    montantMarche: 5000,
    completionRate: 100,
    missingFields: [],
    ...overrides,
  };
}

function buildAgent({ projects = [baseProjectCard()], maintenanceStats = { total: 10, enAttente: 2, enCours: 3, terminee: 5, critique: 0 }, suggestionEngine } = {}) {
  const tools = [listProjectsTool(projects)];
  if (maintenanceStats !== null) tools.push(maintenanceStatsTool(maintenanceStats));
  return { agent: createRecommendationAgent({ chatModel: chatModelReturning({}), tools, workflowEngine: new LangChainWorkflowEngine(), suggestionEngine }), tools };
}

describe("RecommendationAgent — identité", () => {
  test("gère exclusivement l'intention 'recommendation', ouvert à tout utilisateur, aucun nouveau Tool", () => {
    const { agent } = buildAgent();
    expect(agent).toBeInstanceOf(RecommendationAgent);
    expect(agent.name).toBe("recommendation_agent");
    expect(agent.canHandle({ name: "recommendation" })).toBe(true);
    expect(agent.canHandle({ name: "business_analysis" })).toBe(false);
    expect(agent.requiredRoles).toEqual([]);
    expect(ALLOWED_TOOL_NAMES).toEqual(["list_projects", "get_maintenance_stats"]);
  });
});

describe("RecommendationAgent — chaque question produit systématiquement les 7 catégories (pas de détection de mots-clés)", () => {
  test("un projet cumulant retard + blocage + priorité critique + fiche incomplète déclenche 5 des 7 catégories, chacune justifiée", async () => {
    const project = baseProjectCard({
      nomProjet: "Chantier Multi-Risque",
      nextRelanceDate: daysAgo(40),
      dateLimiteIngenieur: daysAgo(40),
      montantMarche: 200000,
      pourcentageReussite: 10,
      lastAction: { statut: "En cours", dateAction: daysAgo(20), commentaire: "Relance client" },
      completionRate: 20,
      missingFields: ["Adresse non renseignée"],
    });
    const { agent } = buildAgent({ projects: [project], maintenanceStats: { total: 5, enAttente: 1, enCours: 1, terminee: 3, critique: 2 } });

    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });

    expect(result.answer).toContain("### Priorités");
    expect(result.answer).toContain("### Tâches importantes");
    expect(result.answer).toContain("### Clients à relancer");
    expect(result.answer).toContain("### Projets critiques");
    expect(result.answer).toContain("### Risques");
    expect(result.answer).toContain("### Anomalies");
    expect(result.answer).toContain("Chantier Multi-Risque");
    // Le risque de maintenance (critique: 2) est bien remonté, avec le vrai chiffre.
    expect(result.answer).toContain("2 demande(s) de maintenance de niveau critique");
  });

  test("un message sans aucun mot-clé de domaine produit quand même l'analyse complète (contrairement à BusinessAnalystAgent)", async () => {
    const project = baseProjectCard({ nomProjet: "Chantier En Retard", nextRelanceDate: daysAgo(40) });
    const { agent } = buildAgent({ projects: [project] });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Bonjour, une question quelconque.", user: USER, conversationId: null });
    expect(result.answer).toContain("Chantier En Retard");
  });

  test("aucun signal détecté (projets sains, aucune anomalie) : message honnête, jamais une recommandation fabriquée", async () => {
    const { agent } = buildAgent({ projects: [baseProjectCard()], maintenanceStats: { total: 2, enAttente: 0, enCours: 1, terminee: 1, critique: 0 } });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });
    expect(result.answer).toMatch(/Rien à signaler/);
  });
});

describe("RecommendationAgent — actions recommandées (SuggestionEngine, permission-filtrées)", () => {
  test("les actions recommandées respectent le rôle courant, exactement comme Smart Suggestions", async () => {
    const project = baseProjectCard({ lastAction: { statut: "En cours", dateAction: daysAgo(40), commentaire: "Relance" } });
    const { agent: agentAsUser } = buildAgent({ projects: [project], suggestionEngine: testSuggestionEngine() });
    const asUser = await agentAsUser.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });
    expect(asUser.suggestions.map((s) => s.id)).not.toContain("notify_team");

    const { agent: agentAsAdmin } = buildAgent({ projects: [project], suggestionEngine: testSuggestionEngine() });
    const asAdmin = await agentAsAdmin.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: ADMIN, conversationId: null });
    expect(asAdmin.suggestions.map((s) => s.id)).toContain("notify_team");
  });

  test("sans suggestionEngine injecté, aucune action recommandée n'est produite (rétrocompatible, jamais d'erreur)", async () => {
    const project = baseProjectCard({ nextRelanceDate: daysAgo(40) });
    const { agent } = buildAgent({ projects: [project] });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });
    expect(result.suggestions).toEqual([]);
  });
});

describe("RecommendationAgent — get_maintenance_stats est best-effort", () => {
  test("Tool de maintenance indisponible : les 6 autres catégories restent normales, aucune exception", async () => {
    const project = baseProjectCard({ nextRelanceDate: daysAgo(40) });
    const { agent } = buildAgent({ projects: [project], maintenanceStats: null });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });
    expect(result.answer).toContain("### Clients à relancer");
  });

  test("Tool de maintenance présent mais refusé (erreur) : dégrade gracieusement", async () => {
    const failingTool = { name: "get_maintenance_stats", description: "d", invoke: jest.fn(async () => { throw new Error('Role "user" is not allowed to call tool "get_maintenance_stats".'); }) };
    const project = baseProjectCard({ nextRelanceDate: daysAgo(40) });
    const agent = createRecommendationAgent({
      chatModel: chatModelReturning({}),
      tools: [listProjectsTool([project]), failingTool],
      workflowEngine: new LangChainWorkflowEngine(),
    });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });
    expect(result.answer).toContain("### Clients à relancer");
  });
});

describe("RecommendationAgent — gestion des erreurs", () => {
  test("sans 'list_projects' disponible, dégrade gracieusement plutôt que de planter le tour", async () => {
    const agent = createRecommendationAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });
    expect(result.answer).toContain("recommendation_agent");
  });
});

describe("RecommendationAgent — traçabilité (toolSteps, dataQuality)", () => {
  test("chaque Tool réellement appelé est tracé, et dataQuality (anomalies) est transmis pour ResponseBuilder", async () => {
    const project = baseProjectCard({ completionRate: 20, missingFields: ["Adresse non renseignée"] });
    const { agent } = buildAgent({ projects: [project] });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });

    expect(result.toolSteps.map((s) => s.tool)).toEqual(["list_projects", "get_maintenance_stats", "generate_recommendations"]);
    expect(result.dataQuality).toHaveLength(1);
    expect(result.dataQuality[0].projectId).toBe("proj-1");
  });

  test("l'étape 'generate_recommendations' est marquée synthetic:true avec une description — une règle métier, pas un Tool MCP réel (voir explainabilityBuilder.js)", async () => {
    const project = baseProjectCard({ completionRate: 20, missingFields: ["Adresse non renseignée"] });
    const { agent } = buildAgent({ projects: [project] });
    const result = await agent.execute({ intent: { name: "recommendation" }, message: "Conseille-moi.", user: USER, conversationId: null });

    const ruleStep = result.toolSteps.find((s) => s.tool === "generate_recommendations");
    expect(ruleStep.synthetic).toBe(true);
    expect(typeof ruleStep.description).toBe("string");
    expect(result.toolSteps.find((s) => s.tool === "list_projects").synthetic).toBeUndefined();
  });
});
