"use strict";

const { createKpiAgent, KpiAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/kpiAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "user" };
const ADMIN = { id: "u2", role: "admin" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function jsonTool(name, payload) {
  return { name, description: "d", invoke: jest.fn(async () => JSON.stringify(payload)) };
}

function failingTool(name, message = "not allowed") {
  return {
    name,
    description: "d",
    invoke: jest.fn(async () => {
      throw new Error(message);
    }),
  };
}

const ADMIN_DASHBOARD = {
  role: "admin",
  stats: { totalProjects: 20, totalValidated: 8, validationRate: 40, totalPending: 3 },
  charts: {
    monthlyEvolution: [
      { month: "2026-06", total: 10, validated: 4, archived: 1, surface: 100 },
      { month: "2026-07", total: 14, validated: 6, archived: 2, surface: 130 },
    ],
  },
};

const USER_DASHBOARD = {
  role: "user",
  stats: { myProjects: 5, successRate: 60, myRelancesLate: 2 },
  charts: { myMonthlyEvolution: [{ month: "2026-06", total: 2, validated: 1 }, { month: "2026-07", total: 3, validated: 2 }] },
};

describe("KpiAgent — identité", () => {
  test("gère exclusivement l'intention 'dashboard', ouvert à tout utilisateur", () => {
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine() });
    expect(agent).toBeInstanceOf(KpiAgent);
    expect(agent.name).toBe("kpi_agent");
    expect(agent.canHandle({ name: "dashboard" })).toBe(true);
    expect(agent.canHandle({ name: "reporting" })).toBe(false);
    expect(agent.requiredRoles).toEqual([]);
    expect(agent.allowedToolNames).toEqual(ALLOWED_TOOL_NAMES);
  });
});

describe("KpiAgent — Dashboard intelligent (analyses, comparaisons, prévisions, alertes, graphiques)", () => {
  test("admin : compare le mois précédent au mois en cours, avec les bons deltas", async () => {
    const tool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Quel est mon tableau de bord des KPI ?", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("### Comparaison (mois précédent → mois en cours)");
    expect(result.answer).toContain("Nombre de projets créés : 10 → 14 (+4, +40%) — hausse.");
    expect(result.answer).toContain("Nombre de projets validés : 4 → 6 (+2, +50%) — hausse.");
  });

  test("explique pourquoi le KPI augmente/diminue, en corrélation avec les causes déjà identifiées, jamais une causalité affirmée", async () => {
    const tool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Pourquoi mon KPI a-t-il évolué ?", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("### Pourquoi ces indicateurs évoluent-ils ?");
    expect(result.answer).toContain("Nombre de projets créés est en hausse : 10 → 14");
    expect(result.answer).toContain("corrélation, pas une causalité prouvée");
    expect(result.answer).toContain("Le taux de validation global est de 40%");
  });

  test("estime une prévision heuristique pour le mois prochain, étiquetée comme telle", async () => {
    const tool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Quelle est la prévision de mes KPI ?", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("### Prévision (mois prochain, estimation heuristique)");
    expect(result.answer).toContain("Nombre de projets créés : environ 18 estimé le mois prochain");
  });

  test("fournit les données du graphique {labels, series}, dérivées de la même série mensuelle", async () => {
    const tool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Montre-moi le graphique de mes KPI.", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("### Graphique (données)");
    expect(result.answer).toContain("Labels (mois) : 2026-06, 2026-07");
    expect(result.answer).toContain("total : [10, 14]");
    expect(result.answer).toContain("validated : [4, 6]");
  });

  test("aucun historique mensuel : comparaison/prévision/graphique honnêtes, jamais fabriquées", async () => {
    const noHistory = { role: "admin", stats: { totalProjects: 5, totalValidated: 2, validationRate: 40 }, charts: { monthlyEvolution: [] } };
    const tool = jsonTool("get_dashboard_kpis", noHistory);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI de ce mois.", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("Historique insuffisant (moins de 2 mois de données) pour établir une comparaison.");
    expect(result.answer).toContain("Historique insuffisant pour estimer une prévision");
    expect(result.answer).toContain("Aucune série mensuelle disponible pour construire un graphique.");
  });

  test("un seul mois d'historique : le graphique reste possible (1 point), mais pas la comparaison ni la prévision", async () => {
    const singlePoint = { role: "admin", stats: { totalProjects: 5, totalValidated: 2, validationRate: 40 }, charts: { monthlyEvolution: [{ month: "2026-07", total: 5, validated: 2 }] } };
    const tool = jsonTool("get_dashboard_kpis", singlePoint);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI de ce mois.", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("Historique insuffisant (moins de 2 mois de données) pour établir une comparaison.");
    expect(result.answer).toContain("Labels (mois) : 2026-07");
    expect(result.answer).toContain("total : [5]");
  });

  test("utilisateur standard : même logique sur myMonthlyEvolution, jamais mélangée avec les champs admin", async () => {
    const tool = jsonTool("get_dashboard_kpis", USER_DASHBOARD);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Mon tableau de bord personnel.", user: USER, conversationId: null });

    expect(result.answer).toContain("Nombre de projets créés : 2 → 3 (+1, +50%) — hausse.");
    expect(result.answer).toContain("2 relance(s) personnelle(s) sont en retard");
  });
});

describe("KpiAgent — alertes réelles du tableau de bord professionnel (meilleur effort)", () => {
  test("admin-tier : les alertes réelles de get_professional_dashboard sont incluses", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const proTool = jsonTool("get_professional_dashboard", { alerts: { overdueProjects: 3, missingDocuments: 1, missingValidation: 0, unreadNotifications: 5 } });
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, proTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Y a-t-il des alertes sur mon tableau de bord ?", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("### Alertes");
    expect(result.answer).toContain("3 projet(s) en retard.");
    expect(result.answer).toContain("1 projet(s) avec des documents manquants.");
    expect(result.answer).toContain("5 notification(s) non lue(s).");
  });

  test("rôle non admin-tier : le refus du Tool dégrade seulement les alertes, jamais toute la réponse", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", USER_DASHBOARD);
    const proTool = failingTool("get_professional_dashboard", "forbidden for role user");
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, proTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Mon tableau de bord.", user: USER, conversationId: null });

    expect(result.answer).toContain("### Résultat");
    expect(result.toolSteps.some((s) => s.tool === "get_professional_dashboard" && String(s.output).includes("Error"))).toBe(true);
  });

  test("aucune alerte : le dit explicitement plutôt que de laisser la section vide", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", { role: "admin", stats: { totalProjects: 5, totalValidated: 5, validationRate: 100, totalPending: 0 }, charts: { monthlyEvolution: [] } });
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI.", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("Aucune alerte détectée.");
  });
});

describe("KpiAgent — répartition par famille/diamètre (get_user_dashboard, meilleur effort)", () => {
  test("ajoute une section quand des statistiques existent", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const userDashboardTool = jsonTool("get_user_dashboard", { familyStats: [{ family: "PEHD", count: 4 }], diameterStats: [{ diameter: "110mm", count: 2 }] });
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, userDashboardTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Statistiques par famille de produit.", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("### Répartition par famille et diamètre de produit");
    expect(result.answer).toContain('Famille "PEHD" : 4 projet(s).');
    expect(result.answer).toContain('Diamètre "110mm" : 2 projet(s).');
  });

  test("omet la section quand get_user_dashboard ne renvoie aucune répartition", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const userDashboardTool = jsonTool("get_user_dashboard", {});
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, userDashboardTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI.", user: ADMIN, conversationId: null });

    expect(result.answer).not.toContain("### Répartition");
  });
});

describe("KpiAgent — vue historique / entonnoir de vente (get_legacy_dashboard_kpis, déclenchée par le message)", () => {
  test("le mot 'historique' déclenche l'appel et une vue dédiée avec comparaison/prévision du chiffre d'affaires", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const legacyTool = jsonTool("get_legacy_dashboard_kpis", {
      counts: { totalProjects: 30, wonProjects: 10, lostProjects: 5, activeProjects: 15, pendingActions: 2 },
      revenue: { total: 100000, monthly: 15000 },
      rates: { conversionRate: 33 },
      monthlyTrend: [
        { month: "2026-06", total: 8, won: 3, revenue: 10000 },
        { month: "2026-07", total: 12, won: 5, revenue: 15000 },
      ],
    });
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, legacyTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Montre-moi les KPI historiques (entonnoir de vente).", user: ADMIN, conversationId: null });

    expect(legacyTool.invoke).toHaveBeenCalled();
    expect(result.answer).toContain("### Vue historique (entonnoir de vente)");
    expect(result.answer).toContain("30 projet(s) au total, 10 gagné(s), 5 perdu(s), taux de conversion 33%.");
    expect(result.answer).toContain("Prévision du chiffre d'affaires du mois prochain");
  });

  test("sans marqueur 'historique'/'entonnoir'/'legacy' dans le message, le Tool n'est jamais appelé", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const legacyTool = jsonTool("get_legacy_dashboard_kpis", {});
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, legacyTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "Quel est mon tableau de bord des KPI ?", user: ADMIN, conversationId: null });

    expect(legacyTool.invoke).not.toHaveBeenCalled();
    expect(result.answer).not.toContain("### Vue historique");
  });
});

describe("KpiAgent — gestion des erreurs", () => {
  test("sans 'get_dashboard_kpis' disponible, dégrade gracieusement plutôt que de planter le tour", async () => {
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI.", user: USER, conversationId: null });
    expect(result.answer).toContain("kpi_agent");
  });
});

describe("KpiAgent — traçabilité (toolSteps)", () => {
  test("chaque Tool réellement appelé est tracé avec son entrée et sa sortie", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const proTool = jsonTool("get_professional_dashboard", { alerts: {} });
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool, proTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI.", user: ADMIN, conversationId: null });

    expect(result.toolSteps[0]).toEqual({ tool: "get_dashboard_kpis", input: {}, output: ADMIN_DASHBOARD });
    expect(result.toolSteps.some((s) => s.tool === "get_professional_dashboard")).toBe(true);
  });

  test("l'étape 'analyze_kpi_trends' est marquée synthetic:true avec une description — une règle métier, pas un Tool MCP réel (voir explainabilityBuilder.js)", async () => {
    const dashboardTool = jsonTool("get_dashboard_kpis", ADMIN_DASHBOARD);
    const agent = createKpiAgent({ chatModel: chatModelReturning({}), tools: [dashboardTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "dashboard" }, message: "KPI.", user: ADMIN, conversationId: null });

    const ruleStep = result.toolSteps.find((s) => s.tool === "analyze_kpi_trends");
    expect(ruleStep.synthetic).toBe(true);
    expect(ruleStep.description).toMatch(/comparaison|prévision|alerte/i);
    expect(result.toolSteps.find((s) => s.tool === "get_dashboard_kpis").synthetic).toBeUndefined();
  });
});
