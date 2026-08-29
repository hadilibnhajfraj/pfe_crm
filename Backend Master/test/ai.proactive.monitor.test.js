"use strict";

jest.mock("../src/ai/reasoning/projectAttentionAnalyzer", () => ({
  analyzeProjectAttention: jest.fn(),
}));

const { analyzeProjectAttention } = require("../src/ai/reasoning/projectAttentionAnalyzer");
const { ProactiveMonitor, ALERT_PRIORITIES, RISK_CATEGORIES } = require("../src/ai/proactive/proactiveMonitor");

const USER = { id: "u1", role: "admin" };

function listProjectsTool(projects) {
  return { name: "list_projects", invoke: jest.fn(async () => JSON.stringify({ data: projects, total: projects.length })) };
}

function attentionEntry(overrides = {}) {
  return {
    projectId: "p1",
    projectName: "Chantier Alpha",
    priority: "critique",
    score: 50,
    factors: [{ dimension: "retard", reason: "Relance en retard de 40 jour(s)." }],
    ...overrides,
  };
}

function dashboardService(domains) {
  return { getSnapshot: jest.fn(async () => ({ generatedAt: "now", domains, summary: {} })) };
}

beforeEach(() => jest.clearAllMocks());

describe("ProactiveMonitor — constantes", () => {
  test("ALERT_PRIORITIES ne retient que critique/elevee — jamais moyenne/faible", () => {
    expect(ALERT_PRIORITIES).toEqual(new Set(["critique", "elevee"]));
  });

  test("RISK_CATEGORIES = alerts/risks/anomalies — jamais recommendations/forecasts/dataQuality (des insights, pas des alertes)", () => {
    expect(RISK_CATEGORIES).toEqual(["alerts", "risks", "anomalies"]);
  });
});

describe("ProactiveMonitor — domaine projets (via ProjectAttentionAnalyzer, jamais une 2e logique)", () => {
  test("un projet 'critique' devient une alerte ; un projet 'faible' est ignoré", async () => {
    analyzeProjectAttention.mockReturnValue([attentionEntry({ priority: "critique" }), attentionEntry({ projectId: "p2", projectName: "Chantier Calme", priority: "faible", factors: [] })]);
    const monitor = new ProactiveMonitor({ listProjectsTool: listProjectsTool([{}]), actingUser: USER });

    const alerts = await monitor.detectAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe("projects");
    expect(alerts[0].context.projectId).toBe("p1");
  });

  test("un projet 'elevee' déclenche aussi une alerte", async () => {
    analyzeProjectAttention.mockReturnValue([attentionEntry({ priority: "elevee" })]);
    const monitor = new ProactiveMonitor({ listProjectsTool: listProjectsTool([{}]), actingUser: USER });
    const alerts = await monitor.detectAlerts();
    expect(alerts).toHaveLength(1);
  });

  test("un projet 'moyenne' n'est jamais une alerte proactive (visible seulement à la demande, via ProjectAgent)", async () => {
    analyzeProjectAttention.mockReturnValue([attentionEntry({ priority: "moyenne" })]);
    const monitor = new ProactiveMonitor({ listProjectsTool: listProjectsTool([{}]), actingUser: USER });
    const alerts = await monitor.detectAlerts();
    expect(alerts).toEqual([]);
  });

  test("appelle list_projects avec les VRAIS paramètres (limit large, projets non archivés)", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const tool = listProjectsTool([]);
    const monitor = new ProactiveMonitor({ listProjectsTool: tool, actingUser: USER });
    await monitor.detectAlerts();
    expect(tool.invoke).toHaveBeenCalledWith({ limit: 200, isArchived: false });
  });

  test("suggestionEngine fourni : les actions préparées viennent de suggestForFactors(factors, actingUser)", async () => {
    const entry = attentionEntry();
    analyzeProjectAttention.mockReturnValue([entry]);
    const suggestionEngine = { suggestForFactors: jest.fn(() => [{ id: "create_reminder", label: "Créer un rappel", reason: "x" }]) };
    const monitor = new ProactiveMonitor({ listProjectsTool: listProjectsTool([{}]), suggestionEngine, actingUser: USER });

    const alerts = await monitor.detectAlerts();

    expect(suggestionEngine.suggestForFactors).toHaveBeenCalledWith(entry.factors, USER);
    expect(alerts[0].suggestedActions).toEqual(["Créer un rappel"]);
  });

  test("sans suggestionEngine (défaut), suggestedActions reste [] — jamais une action fabriquée", async () => {
    analyzeProjectAttention.mockReturnValue([attentionEntry()]);
    const monitor = new ProactiveMonitor({ listProjectsTool: listProjectsTool([{}]), actingUser: USER });
    const alerts = await monitor.detectAlerts();
    expect(alerts[0].suggestedActions).toEqual([]);
  });

  test("sans list_projects disponible pour ce rôle : dégrade gracieusement, jamais une exception", async () => {
    const monitor = new ProactiveMonitor({ listProjectsTool: null, actingUser: USER });
    await expect(monitor.detectAlerts()).resolves.toEqual([]);
  });

  test("un Tool qui échoue dégrade gracieusement plutôt que de planter tout le cycle", async () => {
    const failingTool = { name: "list_projects", invoke: jest.fn(async () => { throw new Error("forbidden"); }) };
    const monitor = new ProactiveMonitor({ listProjectsTool: failingTool, actingUser: USER });
    await expect(monitor.detectAlerts()).resolves.toEqual([]);
  });
});

describe("ProactiveMonitor — domaines pipeline/ventes/maintenance/RH/industrial/KPI (via Dashboard IA, jamais une 2e logique)", () => {
  test("interroge le Dashboard IA scopé aux 6 domaines demandés (Pipeline/Maintenance/RH/Industrial/Dashboard, + ventes en bonus) — jamais 'projects' (couvert séparément)", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({ sales: { domain: "sales", alerts: [], risks: [], anomalies: [], recommendations: [] } });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    await monitor.detectAlerts();

    expect(service.getSnapshot).toHaveBeenCalledWith({ actingUser: USER, domains: ["pipeline", "sales", "maintenance", "hr", "industrial", "kpi"] });
  });

  test("un item 'alerts' du domaine sales devient une alerte proactive", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({
      sales: { domain: "sales", alerts: [{ domain: "sales", message: "Score commercial faible." }], risks: [], anomalies: [], recommendations: [] },
    });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    const alerts = await monitor.detectAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe("sales");
    expect(alerts[0].explanation).toBe("Score commercial faible.");
  });

  test("un item 'alerts' du domaine RH (nouvellement surveillé) devient une alerte proactive", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({
      hr: { domain: "hr", alerts: [{ domain: "hr", message: "Trop de demandes RH en attente." }], risks: [], anomalies: [], recommendations: [] },
    });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    const alerts = await monitor.detectAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe("hr");
  });

  test("un item 'alerts' du domaine industrial (nouvellement surveillé) devient une alerte proactive", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({
      industrial: { domain: "industrial", alerts: [{ domain: "industrial", message: "Non-conformité détectée." }], risks: [], anomalies: [], recommendations: [] },
    });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    const alerts = await monitor.detectAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe("industrial");
  });

  test("un item 'alerts' du domaine pipeline (nouvellement surveillé) devient une alerte proactive", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({
      pipeline: { domain: "pipeline", alerts: [{ domain: "pipeline", message: "Étape de pipeline bloquée." }], risks: [], anomalies: [], recommendations: [] },
    });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    const alerts = await monitor.detectAlerts();

    expect(alerts).toHaveLength(1);
    expect(alerts[0].domain).toBe("pipeline");
  });

  test("recommendations/forecasts/dataQuality du même domaine ne deviennent JAMAIS des alertes à eux seuls", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({
      kpi: { domain: "kpi", alerts: [], risks: [], anomalies: [], recommendations: [{ message: "x" }], forecasts: [{ message: "x" }], dataQuality: [{ message: "x" }] },
    });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    const alerts = await monitor.detectAlerts();
    expect(alerts).toEqual([]);
  });

  test("plusieurs domaines, plusieurs catégories : chaque item devient sa propre alerte", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = dashboardService({
      sales: { domain: "sales", alerts: [{ message: "a" }], risks: [], anomalies: [], recommendations: [] },
      maintenance: { domain: "maintenance", alerts: [], risks: [{ message: "b" }], anomalies: [{ message: "c" }], recommendations: [] },
    });
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });

    const alerts = await monitor.detectAlerts();
    expect(alerts).toHaveLength(3);
  });

  test("sans dashboardService fourni : dégrade gracieusement, jamais une exception", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const monitor = new ProactiveMonitor({ actingUser: USER });
    await expect(monitor.detectAlerts()).resolves.toEqual([]);
  });

  test("le Dashboard IA qui échoue entièrement (permission) dégrade gracieusement plutôt que de planter tout le cycle", async () => {
    analyzeProjectAttention.mockReturnValue([]);
    const service = { getSnapshot: jest.fn(async () => { throw new Error("denied"); }) };
    const monitor = new ProactiveMonitor({ dashboardService: service, actingUser: USER });
    await expect(monitor.detectAlerts()).resolves.toEqual([]);
  });
});

describe("ProactiveMonitor — ne fait QUE détecter, jamais envoyer", () => {
  test("aucune référence à un Tool d'écriture/d'envoi n'est jamais invoquée pendant detectAlerts()", async () => {
    analyzeProjectAttention.mockReturnValue([attentionEntry()]);
    const notifyTool = { name: "send_notification_email", invoke: jest.fn() };
    const monitor = new ProactiveMonitor({ listProjectsTool: listProjectsTool([{}]), actingUser: USER });
    // notifyTool n'est même pas un paramètre du constructeur — structurellement inatteignable.
    await monitor.detectAlerts();
    expect(notifyTool.invoke).not.toHaveBeenCalled();
  });
});
