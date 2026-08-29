"use strict";

const { createDataQualityAgent, DataQualityAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/dataQualityAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const USER = { id: "u1", role: "user" };

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function listProjectsTool(projects) {
  return { name: "list_projects", description: "d", invoke: jest.fn(async () => JSON.stringify({ data: projects, total: projects.length })) };
}

function project(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Chantier Test",
    ownerId: "owner-1",
    pipelineStageId: "stage-1",
    stage: { name: "Ouvert", isWonStage: false, isLostStage: false },
    isArchived: false,
    attachmentsCount: 2,
    completionRate: 100,
    missingFields: [],
    montantMarche: 5000,
    pourcentageReussite: 50,
    emailIngenieur: null,
    emailArchitecte: null,
    telephoneIngenieur: null,
    telephoneArchitecte: null,
    ...overrides,
  };
}

describe("DataQualityAgent — identité", () => {
  test("gère exclusivement l'intention 'data_quality', ouvert à tout utilisateur", () => {
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine() });
    expect(agent).toBeInstanceOf(DataQualityAgent);
    expect(agent.name).toBe("data_quality_agent");
    expect(agent.canHandle({ name: "data_quality" })).toBe(true);
    expect(agent.canHandle({ name: "recommendation" })).toBe(false);
    expect(agent.requiredRoles).toEqual([]);
  });

  test("garantie structurelle : AUCUN Tool d'écriture n'est même autorisé — 'list_projects' seul", () => {
    expect(ALLOWED_TOOL_NAMES).toEqual(["list_projects"]);
    expect(ALLOWED_TOOL_NAMES).not.toContain("move_project_stage");
    expect(ALLOWED_TOOL_NAMES).not.toContain("assign_project_owner");
  });
});

describe("DataQualityAgent — audite systématiquement, quel que soit le message", () => {
  test("un projet cumulant plusieurs problèmes déclenche les sections correspondantes, avec le Score Qualité", async () => {
    const flawedProject = project({
      nomProjet: "Chantier Multi-Problèmes",
      ownerId: null,
      attachmentsCount: 0,
      completionRate: 30,
      missingFields: ["Adresse non renseignée"],
      emailIngenieur: "pas-un-email",
      telephoneIngenieur: "12",
      stage: { name: "Gagné", isWonStage: true, isLostStage: false },
      pourcentageReussite: 40,
    });
    const tool = listProjectsTool([flawedProject]);
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });

    expect(result.answer).toMatch(/Score Qualité : \d+\/100/);
    expect(result.answer).toContain("### Données orphelines");
    expect(result.answer).toContain("### Documents manquants");
    expect(result.answer).toContain("### Informations manquantes");
    expect(result.answer).toContain("### Emails invalides");
    expect(result.answer).toContain("### Téléphones invalides");
    expect(result.answer).toContain("### Incohérences");
    expect(result.answer).toContain("Chantier Multi-Problèmes");
  });

  test("même un message sans rapport avec la qualité des données déclenche quand même l'audit complet", async () => {
    const tool = listProjectsTool([project({ ownerId: null })]);
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Bonjour.", user: USER, conversationId: null });
    expect(result.answer).toContain("### Données orphelines");
  });

  test("un jeu de données propre => score 100, aucune section, jamais un problème fabriqué", async () => {
    const tool = listProjectsTool([project()]);
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });
    expect(result.answer).toContain("Score Qualité : 100/100");
    expect(result.answer).toMatch(/[Aa]ucun problème détecté/);
  });
});

describe("DataQualityAgent — garantie : ne modifie JAMAIS rien automatiquement", () => {
  test("même si des Tools d'écriture sont fournis, ils ne sont ni accessibles ni jamais appelés", async () => {
    const listTool = listProjectsTool([project({ ownerId: null, emailIngenieur: "invalide" })]);
    const moveStageTool = { name: "move_project_stage", description: "d", invoke: jest.fn() };
    const assignOwnerTool = { name: "assign_project_owner", description: "d", invoke: jest.fn() };

    const agent = createDataQualityAgent({
      chatModel: chatModelReturning({}),
      tools: [listTool, moveStageTool, assignOwnerTool],
      workflowEngine: new LangChainWorkflowEngine(),
    });

    await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });

    // Les Tools d'écriture sont bien fournis au constructeur (comme tout Tool
    // du système) mais allowedToolNames les exclut : _allowedTools() ne les
    // expose jamais à cet Agent.
    expect(agent._allowedTools().map((t) => t.name)).toEqual(["list_projects"]);
    expect(moveStageTool.invoke).not.toHaveBeenCalled();
    expect(assignOwnerTool.invoke).not.toHaveBeenCalled();
  });

  test("les corrections proposées sont du texte, jamais un objet exécutable", async () => {
    const tool = listProjectsTool([project({ ownerId: null })]);
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });

    // La réponse entière est une chaîne de caractères — structurellement
    // rien d'exécutable ne peut en sortir.
    expect(typeof result.answer).toBe("string");
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });
});

describe("DataQualityAgent — gestion des erreurs", () => {
  test("sans 'list_projects' disponible, dégrade gracieusement plutôt que de planter le tour", async () => {
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });
    expect(result.answer).toContain("data_quality_agent");
  });
});

describe("DataQualityAgent — traçabilité (toolSteps)", () => {
  test("le Tool réellement appelé et le résumé de l'analyse sont tracés", async () => {
    const tool = listProjectsTool([project()]);
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });

    expect(result.toolSteps[0]).toEqual({ tool: "list_projects", input: { limit: 100, isArchived: false }, output: "1 projet(s) audité(s)" });
    expect(result.toolSteps[1].tool).toBe("analyze_data_quality");
    expect(result.toolSteps[1].output.qualityScore).toBe(100);
  });

  test("l'étape 'analyze_data_quality' est marquée synthetic:true avec une description — une règle métier, pas un Tool MCP réel (voir explainabilityBuilder.js)", async () => {
    const tool = listProjectsTool([project()]);
    const agent = createDataQualityAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "data_quality" }, message: "Audit qualité.", user: USER, conversationId: null });

    expect(result.toolSteps[1].synthetic).toBe(true);
    expect(result.toolSteps[1].description).toMatch(/score qualité/i);
    expect(result.toolSteps[0].synthetic).toBeUndefined();
  });
});
