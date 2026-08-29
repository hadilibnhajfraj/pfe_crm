"use strict";

const { createAdvancedSearchAgent, AdvancedSearchAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/advancedSearchAgent");
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

function project(overrides = {}) {
  return { id: "p1", nomProjet: "Chantier Test", createdAt: "2026-06-15T00:00:00Z", montantMarche: 10000, ...overrides };
}

describe("AdvancedSearchAgent — identité", () => {
  test("gère exclusivement l'intention 'advanced_search', ouvert à tout utilisateur, 2 Tools (2 modules)", () => {
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine() });
    expect(agent).toBeInstanceOf(AdvancedSearchAgent);
    expect(agent.name).toBe("advanced_search_agent");
    expect(agent.canHandle({ name: "advanced_search" })).toBe(true);
    expect(agent.canHandle({ name: "dashboard" })).toBe(false);
    expect(agent.requiredRoles).toEqual([]);
    expect(ALLOWED_TOOL_NAMES).toEqual(["list_projects", "get_commercial_contact_kpi"]);
  });
});

describe("AdvancedSearchAgent — « Montre les projets créés en juin. » (période)", () => {
  test("appelle list_projects avec dateFrom/dateTo réels du mois reconnu", async () => {
    const listTool = jsonTool("list_projects", { data: [project({ nomProjet: "Chantier Juin" })], total: 1 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Recherche les projets créés en juin.", user: USER, conversationId: null });

    expect(listTool.invoke).toHaveBeenCalledWith(expect.objectContaining({ dateFrom: expect.stringMatching(/-06-01$/), dateTo: expect.stringMatching(/-06-30$/) }));
    expect(result.answer).toContain("Chantier Juin");
    expect(result.answer).toContain("### Projets créés en juin");
  });

  test("aucun mois reconnu dans une demande de période : note honnête, jamais une plage fabriquée", async () => {
    const listTool = jsonTool("list_projects", { data: [], total: 0 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Recherche les projets créés récemment.", user: USER, conversationId: null });

    expect(listTool.invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("Aucun mois reconnu");
  });
});

describe("AdvancedSearchAgent — « Quels devis dépassent 50 000 € ? » (seuil de montant)", () => {
  test("devis : jamais une réponse silencieuse — explique l'absence de donnée ET propose l'alternative étiquetée (montant du marché)", async () => {
    const listTool = jsonTool("list_projects", {
      data: [project({ nomProjet: "Gros chantier", montantMarche: 80000 }), project({ nomProjet: "Petit chantier", montantMarche: 20000 })],
      total: 2,
    });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Cherche les devis qui dépassent 50 000 €.", user: USER, conversationId: null });

    expect(result.answer).toContain("Aucune donnée de montant n'existe pour les devis");
    expect(result.answer).toContain("MONTANT DU MARCHÉ (une donnée contractuelle différente, pas un devis)");
    expect(result.answer).toContain("Gros chantier — 80000 €.");
    expect(result.answer).not.toContain("Petit chantier");
  });

  test("montant du marché directement demandé (sans le mot 'devis') : répond directement, sans caveat devis", async () => {
    const listTool = jsonTool("list_projects", { data: [project({ nomProjet: "Gros chantier", montantMarche: 80000 })], total: 1 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Trouve les projets dont le montant du marché dépasse 50 000 €.", user: ADMIN, conversationId: null });

    expect(result.answer).not.toContain("devis");
    expect(result.answer).toContain("Gros chantier — 80000 €.");
  });

  test("aucun montant reconnu : note honnête, jamais un seuil fabriqué", async () => {
    const listTool = jsonTool("list_projects", { data: [], total: 0 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Cherche les projets dont le budget est important.", user: USER, conversationId: null });

    expect(listTool.invoke).not.toHaveBeenCalled();
    expect(result.answer).toContain("Aucun montant en euros reconnu");
  });
});

describe("AdvancedSearchAgent — « Quels clients n'ont jamais acheté ? » (explicitement non supporté)", () => {
  test("n'appelle aucun Tool, dit clairement pourquoi la donnée n'existe pas", async () => {
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Trouve les clients qui n'ont jamais acheté.", user: USER, conversationId: null });

    expect(result.answer).toContain("Aucun Tool existant ne liste les contacts commerciaux individuellement");
    expect(result.answer).toContain("impossible de répondre sans inventer une donnée");
  });
});

describe("AdvancedSearchAgent — « Quels commerciaux n'ont aucune activité cette semaine ? » (proxy documenté)", () => {
  test("admin-tier : signale les commerciaux sans mise à jour de fiche contact depuis le début de la semaine", async () => {
    const kpiTool = jsonTool("get_commercial_contact_kpi", {
      usersPerformance: [
        { userId: "u1", userName: "alice", lastActivity: "2020-01-01T00:00:00Z" },
        { userId: "u2", userName: "bob", lastActivity: new Date().toISOString() },
      ],
    });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [kpiTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Trouve les commerciaux qui n'ont aucune activité cette semaine.", user: ADMIN, conversationId: null });

    expect(kpiTool.invoke).toHaveBeenCalled();
    expect(result.answer).toContain("alice");
    expect(result.answer).not.toContain("bob —");
    expect(result.answer).toContain("proxy");
  });

  test("rôle non admin-tier (vue personnelle sans usersPerformance) : note honnête plutôt qu'un résultat partiel", async () => {
    const kpiTool = jsonTool("get_commercial_contact_kpi", { totalContacts: 5 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [kpiTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Cherche les commerciaux sans activité cette semaine.", user: USER, conversationId: null });

    expect(result.answer).toContain("vue globale");
  });
});

describe("AdvancedSearchAgent — plusieurs critères combinés dans une même question", () => {
  test("une question qui combine période ET seuil de montant déclenche les deux recherches, list_projects appelé une fois par critère distinct", async () => {
    const listTool = jsonTool("list_projects", { data: [project({ nomProjet: "Chantier Juin", montantMarche: 60000 })], total: 1 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({
      intent: { name: "advanced_search" },
      message: "Recherche les projets créés en juin dont le montant du marché dépasse 50 000 €.",
      user: ADMIN,
      conversationId: null,
    });

    expect(result.answer).toContain("### Projets créés en juin");
    expect(result.answer).toContain("### Projets dont le montant du marché");
    expect(listTool.invoke).toHaveBeenCalledTimes(2); // 2 critères = 2 paramètres différents, jamais fusionnés en une invention
  });
});

describe("AdvancedSearchAgent — aucun critère reconnu", () => {
  test("propose un menu honnête de ce qui est cherchable, jamais une tentative de deviner", async () => {
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Recherche quelque chose d'improbable.", user: USER, conversationId: null });
    expect(result.answer).toContain("Voici ce que je sais chercher aujourd'hui");
    expect(result.toolSteps).toEqual([]);
  });
});

describe("AdvancedSearchAgent — traçabilité et robustesse", () => {
  test("un Tool qui échoue devient une note honnête pour CE critère, sans planter tout le tour", async () => {
    const listTool = { name: "list_projects", description: "d", invoke: jest.fn(async () => { throw new Error("forbidden"); }) };
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Recherche les projets créés en juin.", user: USER, conversationId: null });

    expect(result.answer).toContain("Recherche impossible");
    expect(result.answer).toContain("forbidden");
  });

  test("chaque Tool réellement appelé est tracé avec son entrée et sa sortie", async () => {
    const listTool = jsonTool("list_projects", { data: [project()], total: 1 });
    const agent = createAdvancedSearchAgent({ chatModel: chatModelReturning({}), tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "advanced_search" }, message: "Recherche les projets créés en juin.", user: USER, conversationId: null });

    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0].tool).toBe("list_projects");
    expect(result.toolSteps[0].input).toEqual(expect.objectContaining({ dateFrom: expect.any(String), dateTo: expect.any(String) }));
  });
});
