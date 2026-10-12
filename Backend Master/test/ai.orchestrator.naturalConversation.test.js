"use strict";

// Phase 1 — conversation naturelle de bout en bout : VRAI AIManager, VRAI
// ProjectAgent, VRAIS resolvers de contexte ; seuls le Tool list_projects
// (données fixes, périmètre « mine » appliqué comme scopeInputForActingUser)
// et le modèle de langage (tours 1-2, chemin générique) sont simulés.

const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { ConversationContinuityResolver } = require("../src/ai/orchestrator/conversationContinuityResolver");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { createProjectAgent } = require("../src/ai/agents/projectAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");

const DAY = 86400000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();
const COMMERCIAL = { id: "u-com", role: "commercial", email: "com@cbi.tn" };

// Projets du commercial (5) + un projet d'un autre commercial, que le Tool ne
// doit jamais renvoyer à ce rôle.
const PROJECTS = [
  { id: "p1", nomProjet: "Tunis Nord", statut: "En cours", ownerId: "u-com", owner: { name: "Com Un" }, lastRelanceAt: daysAgo(5), createdAt: daysAgo(40) },
  { id: "p2", nomProjet: "Sfax Port", statut: "En cours", ownerId: "u-com", owner: { name: "Com Un" }, lastRelanceAt: daysAgo(60), createdAt: daysAgo(90) },
  { id: "p3", nomProjet: "Sousse Centre", statut: "Négociation", ownerId: "u-com", owner: { name: "Com Un" }, lastRelanceAt: null, createdAt: daysAgo(2) },
  { id: "p4", nomProjet: "Bizerte Lac", statut: "En cours", ownerId: "u-com", owner: { name: "Com Un" }, lastRelanceAt: null, createdAt: daysAgo(1) },
  { id: "p5", nomProjet: "Nabeul Gare", statut: "Terminé", ownerId: "u-com", owner: { name: "Com Un" }, lastRelanceAt: daysAgo(2), createdAt: daysAgo(200) },
  { id: "pX", nomProjet: "Projet d'un autre", statut: "En cours", ownerId: "u-autre", owner: { name: "Autre" }, lastRelanceAt: null, createdAt: daysAgo(3) },
];

function listProjectsTool() {
  return {
    name: "list_projects",
    description: "Liste les projets",
    invoke: jest.fn(async (input) => {
      // Même règle que scopeInputForActingUser() : un non-admin ne voit que ses projets.
      let rows = PROJECTS.filter((p) => p.ownerId === COMMERCIAL.id);
      if (input && input.statut) rows = rows.filter((p) => p.statut === input.statut);
      return JSON.stringify({ data: rows, total: rows.length });
    }),
  };
}

function build({ llmDecisions = [] } = {}) {
  const complete = jest.fn();
  llmDecisions.forEach((d) => complete.mockResolvedValueOnce(JSON.stringify(d)));
  const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
  const tool = listProjectsTool();
  const memory = new InMemoryConversationMemory();
  const registry = new AgentRegistry();
  registry.register(createProjectAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), memory, maxToolCalls: 3, maxHistoryMessages: 6 }));
  const contextManager = new ContextManager();
  const manager = new AIManager({
    conversationManager: new ConversationManager({ memory }),
    intentDetector: createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG }),
    agentRouter: new AgentRouter({ agentRegistry: registry }),
    toolRouter: { select: () => [] },
    workflowManager: { run: async () => ({ mode: "qa", answer: "réponse générale", citations: [], toolSteps: [] }) },
    responseBuilder: new ResponseBuilder(),
    contextResolver: new ConversationContextResolver({ catalog: DEFAULT_INTENT_CATALOG }),
    continuityResolver: new ConversationContinuityResolver({ catalog: DEFAULT_INTENT_CATALOG }),
    entityExtractor: extractEntities,
    contextManager,
    semanticResolver: new SemanticIntentResolver({ logger: { info() {}, warn() {} } }),
  });
  return { manager, tool, complete, contextManager };
}

const listThenAnswer = (answer) => [
  { action: "call_tool", tool: "list_projects", input: { mine: true } },
  { action: "final_answer", answer },
];

describe("Exemples obligatoires — le contexte est conservé d'un message à l'autre", () => {
  test("mes projets → ceux que je suis → ceux encore en cours → ceux pas relancés récemment → le deuxième → celui-ci", async () => {
    const { manager, tool, complete } = build({
      llmDecisions: [...listThenAnswer("Vous avez 5 projets (list_projects)."), ...listThenAnswer("Voici les 5 projets que vous suivez (list_projects).")],
    });
    const conv = "conv-naturelle";
    const say = (message) => manager.handleMessage({ message, user: COMMERCIAL, conversationId: conv });

    // 1. Liste simple — servie sans modèle : toutes les pages de list_projects
    // sont lues (voir test/ai.agents.projectAgent.listAll.test.js).
    const r1 = await say("Quels sont mes projets ?");
    expect(r1).toMatchObject({ intent: "projects", agent: "project_agent", mode: "agent" });
    expect(r1.toolCalls.map((c) => c.tool)).toContain("list_projects");

    // 2. Reformulation naturelle — même intention, même Agent.
    const r2 = await say("Montre-moi les projets que je suis actuellement en train de suivre.");
    expect(r2).toMatchObject({ intent: "projects", agent: "project_agent" });

    // 3. « ceux » = les projets affichés au tour précédent, filtrés sur le statut
    // réel « En cours » — chemin déterministe, aucun appel LLM supplémentaire.
    const r3 = await say("Quels sont ceux qui sont encore en cours ?");
    expect(r3).toMatchObject({ intent: "projects", agent: "project_agent", mode: "agent" });
    expect(r3.answer).toMatch(/3 projets trouvés/);
    for (const name of ["Tunis Nord", "Sfax Port", "Bizerte Lac"]) expect(r3.answer).toContain(name);
    for (const name of ["Sousse Centre", "Nabeul Gare", "Projet d'un autre"]) expect(r3.answer).not.toContain(name);

    // 4. « lesquels » = les 3 projets en cours ; « pas relancés récemment » =
    // aucune relance depuis 30 jours (seuil TOUJOURS explicité dans la réponse).
    const r4 = await say("Et lesquels n'ont pas été relancés récemment ?");
    expect(r4).toMatchObject({ intent: "projects", agent: "project_agent" });
    expect(r4.answer).toMatch(/2 projets trouvés/);
    expect(r4.answer).toContain("Sfax Port"); // dernière relance il y a 60 jours
    expect(r4.answer).toContain("Bizerte Lac"); // jamais relancé
    expect(r4.answer).not.toContain("Tunis Nord"); // relancé il y a 5 jours
    expect(r4.answer).toMatch(/30 jours/);

    // 5. « le deuxième » de cette dernière liste.
    const r5 = await say("Et le deuxième ?");
    expect(r5.answer).toContain("Bizerte Lac");
    expect(r5.answer).toMatch(/Dernière relance : aucune/);

    // 6. « celui-ci » = la fiche sélectionnée au tour précédent.
    const r6 = await say("Donne-moi les détails de celui-ci");
    expect(r6.intent).toBe("projects");
    expect(r6.answer).toContain("Bizerte Lac");

    // Seul le tour 2 a sollicité le modèle (2 décisions).
    expect(complete).toHaveBeenCalledTimes(2);
    // RBAC : chaque appel du Tool est resté dans le périmètre du commercial.
    for (const [input] of tool.invoke.mock.calls) expect(input.mine).toBe(true);
    // L'historique reste fidèle à ce que l'utilisateur a réellement écrit.
    const history = await manager.conversationManager.getHistory(conv);
    expect(history.filter((m) => m.role === "user").map((m) => m.content)).toEqual([
      "Quels sont mes projets ?",
      "Montre-moi les projets que je suis actuellement en train de suivre.",
      "Quels sont ceux qui sont encore en cours ?",
      "Et lesquels n'ont pas été relancés récemment ?",
      "Et le deuxième ?",
      "Donne-moi les détails de celui-ci",
    ]);
  });

  test("contexte non partagé entre conversations : « le deuxième » sans liste → clarification", async () => {
    const { manager } = build();
    const r = await manager.handleMessage({ message: "Et le deuxième projet ?", user: COMMERCIAL, conversationId: "conv-vide" });
    expect(r.mode).toBe("clarification");
    expect(r.answer).toMatch(/pas de liste précédente/);
  });
});

describe("Contexte de l'écran Flutter (pageContext)", () => {
  test("« celui-ci » sur une fiche projet ouverte → la fiche, relue via le Tool scopé", async () => {
    const { manager, tool } = build();
    const r = await manager.handleMessage({
      message: "Donne-moi les détails de celui-ci",
      user: COMMERCIAL,
      conversationId: "conv-page",
      pageContext: { screen: "project", entity: "project", recordId: "p3", label: "Sousse Centre" },
    });
    expect(r).toMatchObject({ intent: "projects", agent: "project_agent" });
    expect(r.answer).toContain("Sousse Centre");
    expect(r.answer).toMatch(/Statut : Négociation/);
    expect(tool.invoke.mock.calls[0][0].mine).toBe(true);
  });

  test("recordId hors périmètre (projet d'un autre commercial) → refus honnête, aucune donnée divulguée", async () => {
    const { manager } = build();
    const r = await manager.handleMessage({
      message: "Donne-moi les détails de celui-ci",
      user: COMMERCIAL,
      conversationId: "conv-page-2",
      pageContext: { screen: "project", entity: "project", recordId: "pX", label: "Projet d'un autre" },
    });
    expect(r.answer).toMatch(/ne retrouve pas ce projet parmi les projets auxquels vous avez accès/);
    expect(r.answer).not.toMatch(/Statut/);
  });

  test("le pageContext n'est jamais injecté dans le texte classé : l'historique garde le message exact", async () => {
    const { manager } = build();
    await manager.handleMessage({ message: "Bonjour", user: COMMERCIAL, conversationId: "conv-page-3", pageContext: { screen: "dashboard", label: "Tableau de bord" } });
    const history = await manager.conversationManager.getHistory("conv-page-3");
    expect(history[0].content).toBe("Bonjour");
  });
});

describe("Compréhension naturelle et clarification (sans LLM)", () => {
  test("« Montre-moi mes affaires en cours » → projets « En cours » (synonyme + statut), chemin déterministe", async () => {
    const { manager, complete } = build();
    const r = await manager.handleMessage({ message: "Montre-moi mes affaires en cours", user: COMMERCIAL, conversationId: "conv-syn" });
    expect(r).toMatchObject({ intent: "projects", agent: "project_agent" });
    expect(r.answer).toMatch(/3 projets trouvés/);
    expect(complete).not.toHaveBeenCalled();
  });

  test("demande incomprise sans entité → question de précision, jamais « projets / maintenance / RH » arbitraires", async () => {
    const { manager } = build();
    const r = await manager.handleMessage({ message: "Montre-moi les trucs importants", user: COMMERCIAL, conversationId: "conv-clar" });
    expect(r.mode).toBe("clarification");
    expect(r.answer).toMatch(/Je veux m'assurer de bien comprendre votre demande/);
    expect(r.answer).not.toMatch(/Voir mes demandes de maintenance|Voir mes demandes RH/);
  });

  test("« Ingénieurs » seul → options sur les ingénieurs exposées dans `suggestions`", async () => {
    const { manager } = build();
    const r = await manager.handleMessage({ message: "Ingénieurs", user: COMMERCIAL, conversationId: "conv-eng" });
    expect(r.mode).toBe("clarification");
    expect(r.answer).toMatch(/Que souhaitez-vous savoir sur les ingénieurs \?/);
    expect(r.suggestions.map((s) => s.label)).toEqual(["Voir la liste des ingénieurs", "Voir le nombre de projets par ingénieur", "Voir l'ingénieur qui a le plus de projets"]);
  });
});
