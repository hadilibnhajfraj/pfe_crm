"use strict";

const { createBusinessAnalystAgent, BusinessAnalystAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/businessAnalystAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "admin" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function fakeTool(name, payload) {
  return { name, description: name, invoke: jest.fn(async () => JSON.stringify(payload)) };
}

const DASHBOARD_KPIS_FIXTURE = { role: "admin", stats: { totalProjects: 10, totalValidated: 8, validationRate: 80 } };
const PROFESSIONAL_DASHBOARD_FIXTURE = {
  summary: { totalProjects: 10, validationRate: 80, successRate: 70 },
  performance: {},
  pipeline: { stages: [{ name: "Prospect", count: 4, isWonStage: false, isLostStage: false }], conversions: { total: 10, conversionRate: 30 } },
  maps: {},
  alerts: { overdueProjects: 1, missingValidation: 0, missingDocuments: 0, unreadNotifications: 0 },
};
const LIST_PROJECTS_FIXTURE = { data: [{ id: "p1", nomProjet: "Chantier A", actionsCount: 3 }, { id: "p2", nomProjet: "Chantier B", actionsCount: 0 }], total: 2 };
const COMMERCIAL_ANALYTICS_FIXTURE = { global: { totalContacts: 50, totalCalls: 30, averageCallsPerContact: 0.6, contactsNonValides: 5 } };
const MAINTENANCE_STATS_FIXTURE = { total: 10, enAttente: 2, enCours: 3, terminee: 5, critique: 1, today: 0, thisWeek: 2 };

function allTools() {
  return [
    fakeTool("get_dashboard_kpis", DASHBOARD_KPIS_FIXTURE),
    fakeTool("get_professional_dashboard", PROFESSIONAL_DASHBOARD_FIXTURE),
    fakeTool("list_projects", LIST_PROJECTS_FIXTURE),
    fakeTool("get_commercial_contact_kpi", COMMERCIAL_ANALYTICS_FIXTURE),
    fakeTool("get_commercial_contact_analytics", COMMERCIAL_ANALYTICS_FIXTURE),
    fakeTool("get_maintenance_stats", MAINTENANCE_STATS_FIXTURE),
  ];
}

function buildAgent(tools = allTools()) {
  return createBusinessAnalystAgent({ chatModel: chatModelReturning({}), tools, workflowEngine: new LangChainWorkflowEngine() });
}

describe("BusinessAnalystAgent — identité", () => {
  test("est une instance de BusinessAnalystAgent, gère exclusivement 'business_analysis'", () => {
    const agent = buildAgent();
    expect(agent).toBeInstanceOf(BusinessAnalystAgent);
    expect(agent.name).toBe("business_analyst_agent");
    expect(agent.canHandle({ name: "business_analysis" })).toBe(true);
    expect(agent.canHandle({ name: "dashboard" })).toBe(false);
  });

  test("ouvert à tout utilisateur authentifié", () => {
    expect(buildAgent().requiredRoles).toEqual([]);
  });

  test("n'utilise QUE des Tools déjà existants — jamais un nouveau Tool", () => {
    // Les 6 Tools sont tous des noms réels du manifeste MCP (voir
    // mcp/tools/dashboard|projects|commercialContacts|maintenance) —
    // vérifié à la main dans BUSINESS_ANALYST.md.
    expect(ALLOWED_TOOL_NAMES).toEqual([
      "get_dashboard_kpis",
      "get_professional_dashboard",
      "list_projects",
      "get_commercial_contact_kpi",
      "get_commercial_contact_analytics",
      "get_maintenance_stats",
    ]);
  });
});

describe("BusinessAnalystAgent — détection de domaine et sélection des Tools", () => {
  test("« Analyse les projets » n'appelle QUE list_projects", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les projets en cours.", user: USER, conversationId: null });

    expect(tools.find((t) => t.name === "list_projects").invoke).toHaveBeenCalled();
    expect(tools.find((t) => t.name === "get_maintenance_stats").invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("### Projets");
  });

  test("« Analyse les interventions » n'appelle QUE get_maintenance_stats", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les interventions de maintenance.", user: USER, conversationId: null });

    expect(tools.find((t) => t.name === "get_maintenance_stats").invoke).toHaveBeenCalled();
    expect(tools.find((t) => t.name === "list_projects").invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("### Interventions");
  });

  test("une question multi-domaine (« projets » + « pipeline ») analyse les deux domaines", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({
      intent: { name: "business_analysis" },
      message: "Analyse les projets et le pipeline commercial.",
      user: USER,
      conversationId: null,
    });

    expect(result.answer).toContain("### Projets");
    expect(result.answer).toContain("### Pipeline");
  });

  test("aucun domaine détecté : retombe sur une vue d'ensemble 'performance' (jamais une réponse vide)", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Fais-moi une analyse générale.", user: USER, conversationId: null });

    expect(tools.find((t) => t.name === "get_professional_dashboard").invoke).toHaveBeenCalled();
    expect(result.answer).toContain("### Performance");
  });

  test("un même Tool requis par 2 domaines dans la même question n'est appelé qu'UNE seule fois", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les projets et les activités.", user: USER, conversationId: null });

    expect(tools.find((t) => t.name === "list_projects").invoke).toHaveBeenCalledTimes(1);
  });
});

describe("BusinessAnalystAgent — garantie 'ne jamais inventer une donnée' (devis)", () => {
  test("« Analyse les devis » n'appelle AUCUN Tool et l'admet explicitement, sans inventer un chiffre", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les devis envoyés ce mois-ci.", user: USER, conversationId: null });

    for (const tool of tools) expect(tool.invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("### Devis");
    expect(result.answer).toMatch(/[Aa]ucun AI Tool existant/);
    expect(result.answer).not.toMatch(/\d+\s*devis/i); // jamais un chiffre de devis inventé
  });
});

describe("BusinessAnalystAgent — chaque réponse explique résultat/causes/risques/recommandations", () => {
  test("le domaine 'projets', avec un projet réellement en retard ET en priorité critique, produit les 4 sections", async () => {
    const DAY = 24 * 60 * 60 * 1000;
    const projectsWithRisk = {
      data: [
        {
          id: "p1",
          nomProjet: "Chantier En Retard",
          nextRelanceDate: new Date(Date.now() - 40 * DAY).toISOString(),
          dateLimiteIngenieur: new Date(Date.now() - 40 * DAY).toISOString(),
          pipelineStageId: "s1",
          stage: { name: "Ouvert", isWonStage: false, isLostStage: false },
          pourcentageReussite: 10,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          montantMarche: 200000,
        },
      ],
    };
    const tools = [fakeTool("list_projects", projectsWithRisk)];
    const agent = buildAgent(tools);

    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les projets.", user: USER, conversationId: null });

    expect(result.answer).toContain("Résultat :");
    expect(result.answer).toContain("Causes :");
    expect(result.answer).toContain("Risques :");
    expect(result.answer).toContain("Recommandations :");
    expect(result.answer).toContain("Chantier En Retard");
  });
});

describe("BusinessAnalystAgent — un Tool qui échoue n'invalide pas les autres domaines de la même question", () => {
  test("get_maintenance_stats indisponible : le domaine interventions l'explique honnêtement, le domaine projets reste analysé", async () => {
    const failingTool = { name: "get_maintenance_stats", description: "d", invoke: jest.fn(async () => { throw new Error('Role "user" is not allowed to call tool "get_maintenance_stats".'); }) };
    const tools = [fakeTool("list_projects", LIST_PROJECTS_FIXTURE), failingTool];
    const agent = buildAgent(tools);

    const result = await agent.execute({
      intent: { name: "business_analysis" },
      message: "Analyse les projets et les interventions.",
      user: USER,
      conversationId: null,
    });

    expect(result.answer).toContain("### Projets");
    expect(result.answer).toContain("Chantier A");
    expect(result.answer).toContain("### Interventions");
    expect(result.answer).toMatch(/Impossible d'analyser ce domaine.*not allowed to call tool/);
  });

  test("un Tool absent des Tools disponibles est signalé honnêtement plutôt que de faire planter tout le tour", async () => {
    const agent = buildAgent([]); // aucun Tool disponible du tout
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les projets.", user: USER, conversationId: null });
    expect(result.answer).toMatch(/n'est pas disponible pour votre profil/);
  });
});

describe("BusinessAnalystAgent — traçabilité (toolSteps)", () => {
  test("chaque Tool réellement appelé est tracé dans toolSteps, avec son entrée et sa sortie", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les ventes.", user: USER, conversationId: null });

    expect(result.toolSteps).toEqual([
      { tool: "get_commercial_contact_analytics", input: {}, output: COMMERCIAL_ANALYTICS_FIXTURE },
      { tool: "analyze_business_domain", synthetic: true, description: expect.any(String), input: { domain: "ventes" }, output: expect.objectContaining({ supported: true }) },
    ]);
  });

  test("l'étape 'analyze_business_domain' est marquée synthetic:true, une par domaine analysé — une règle métier, pas un Tool MCP réel (voir explainabilityBuilder.js)", async () => {
    const tools = allTools();
    const agent = buildAgent(tools);
    const result = await agent.execute({ intent: { name: "business_analysis" }, message: "Analyse les projets et le pipeline.", user: USER, conversationId: null });

    const ruleSteps = result.toolSteps.filter((s) => s.tool === "analyze_business_domain");
    expect(ruleSteps).toHaveLength(2);
    expect(ruleSteps.map((s) => s.input.domain).sort()).toEqual(["pipeline", "projets"]);
    for (const step of ruleSteps) {
      expect(step.synthetic).toBe(true);
      expect(typeof step.description).toBe("string");
    }
  });
});
