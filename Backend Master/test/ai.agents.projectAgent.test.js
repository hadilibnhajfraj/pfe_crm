"use strict";

const { createProjectAgent, ProjectAgent, ALLOWED_TOOL_NAMES } = require("../src/ai/agents/projectAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { SuggestionEngine } = require("../src/ai/orchestrator/suggestionEngine");

const USER = { id: "u1", role: "user" };
const ADMIN = { id: "u2", role: "admin" };
const DAY = 24 * 60 * 60 * 1000;

function testSuggestionEngine() {
  return new SuggestionEngine({
    toolPermissionIndex: new Map([
      ["create_calendar_event", { requiredRoles: [], allowedEmails: [] }],
      ["send_notification_email", { requiredRoles: ["admin", "superadmin", "superadmin2"], allowedEmails: [] }],
    ]),
  });
}

function daysAgo(n) {
  return new Date(Date.now() - n * DAY).toISOString();
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
    ...overrides,
  };
}

function listProjectsTool(projects) {
  return {
    name: "list_projects",
    description: "Liste les projets",
    invoke: jest.fn(async () => JSON.stringify({ data: projects, total: projects.length, stats: {}, page: 1, pages: 1, limit: 100 })),
  };
}

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

// AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md — `chatModelReturning`
// always returns the SAME decision, so it can't script a realistic 2-turn
// "call a tool, then answer" flow. Needed once `project_agent` requires a
// real tool call before trusting a final_answer (see below).
function chatModelSequence(...decisions) {
  const complete = jest.fn();
  decisions.forEach((decision) => complete.mockResolvedValueOnce(JSON.stringify(decision)));
  return new LlmProviderChatModel({ llmProvider: { complete } });
}

describe("ProjectAgent — identité", () => {
  test("est une instance de ProjectAgent (pas un simple BaseAgent), et gère exclusivement l'intention 'projects'", () => {
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine() });
    expect(agent).toBeInstanceOf(ProjectAgent);
    expect(agent.canHandle({ name: "projects" })).toBe(true);
    expect(agent.canHandle({ name: "maintenance" })).toBe(false);
  });
});

describe("ProjectAgent — raisonnement métier : « Quels projets nécessitent une attention ? »", () => {
  test("un marqueur d'attention déclenche l'analyse déterministe : list_projects est appelé, jamais le modèle de langage", async () => {
    const tool = listProjectsTool([baseProjectCard({ id: "late", nomProjet: "Chantier En Retard", nextRelanceDate: daysAgo(40) })]);
    const chatModel = chatModelReturning({ action: "final_answer", answer: "ne devrait jamais être utilisé" });
    const agent = createProjectAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Quels projets nécessitent une attention ?", user: USER, conversationId: null });

    // AI-Business-Copilot/24_PROJECT_AGENT_RBAC_FIX.md — mine:true est
    // désormais obligatoire ici : sans lui, ce chemin déterministe
    // interrogeait TOUS les projets du système, jamais seulement ceux de
    // l'appelant (83/100 projets d'autres utilisateurs, vérifié en direct).
    expect(tool.invoke).toHaveBeenCalledWith({ limit: 100, isArchived: false, mine: true });
    expect(result.answer).toContain("Chantier En Retard");
    expect(result.answer).toContain("nécessitent une attention");
    expect(result.answer).not.toContain("ne devrait jamais être utilisé");
  });

  test("le classement est réellement calculé (pas un passage brut) : un projet en retard est signalé, un projet neutre ne l'est pas", async () => {
    const projects = [
      baseProjectCard({ id: "late", nomProjet: "Chantier En Retard", nextRelanceDate: daysAgo(40), dateLimiteIngenieur: daysAgo(40) }),
      baseProjectCard({ id: "ok", nomProjet: "Chantier Sans Souci" }),
    ];
    const tool = listProjectsTool(projects);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Quels sont les projets à risque ?", user: USER, conversationId: null });

    expect(result.answer).toContain("Chantier En Retard");
    expect(result.answer).not.toContain("Chantier Sans Souci");
  });

  test("le classement complet (structuré) est tracé dans toolSteps, pour audit — pas seulement le texte final", async () => {
    const tool = listProjectsTool([baseProjectCard({ id: "late", nomProjet: "X", nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "priorités des projets ?", user: USER, conversationId: null });

    expect(result.toolSteps).toEqual([
      { tool: "list_projects", input: { limit: 100, isArchived: false, mine: true }, output: "1 projet(s) analysé(s)" },
      {
        tool: "analyze_project_attention",
        synthetic: true,
        description: expect.any(String),
        input: {},
        output: [expect.objectContaining({ projectId: "late", priority: "moyenne" })],
      },
    ]);
  });

  test("l'étape 'analyze_project_attention' est marquée synthetic:true — une règle métier, pas un Tool MCP réel (voir explainabilityBuilder.js)", async () => {
    const tool = listProjectsTool([baseProjectCard({ id: "late", nomProjet: "X", nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "priorités des projets ?", user: USER, conversationId: null });

    const ruleStep = result.toolSteps.find((s) => s.tool === "analyze_project_attention");
    expect(ruleStep.synthetic).toBe(true);
    expect(ruleStep.description).toMatch(/attention/i);
    expect(result.toolSteps.find((s) => s.tool === "list_projects").synthetic).toBeUndefined();
  });

  test("aucun projet à signaler : réponse rassurante, sans halluciner un problème", async () => {
    const tool = listProjectsTool([baseProjectCard()]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "y a-t-il des projets urgents ?", user: USER, conversationId: null });

    expect(result.answer).toMatch(/[Aa]ucun projet ne nécessite/);
  });

  test.each(["attention", "prioritaire", "priorité", "risque", "urgent", "surveiller", "retard", "retards", "critique", "critiques"])(
    "le marqueur '%s' déclenche le chemin de raisonnement",
    async (marker) => {
      const tool = listProjectsTool([baseProjectCard()]);
      const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
      await agent.execute({ intent: { name: "projects" }, message: `des projets ${marker} ?`, user: USER, conversationId: null });
      expect(tool.invoke).toHaveBeenCalled();
    }
  );

  test("l'exemple canonique du Natural Conversation Engine — « ... sont en retard ? » — déclenche le VRAI classement par attention, pas juste list_projects", async () => {
    const tool = listProjectsTool([baseProjectCard()]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    // Message tel qu'il atteint réellement ProjectAgent après enrichissement
    // par ConversationContextResolver (voir CONVERSATION_CONTEXT.md) : "Et
    // lesquels sont en retard ? (à propos de projet)".
    const result = await agent.execute({
      intent: { name: "projects" },
      message: "Et lesquels sont en retard ? (à propos de projet)",
      user: USER,
      conversationId: null,
    });

    expect(result.toolSteps.some((s) => s.tool === "analyze_project_attention")).toBe(true);
  });

  // Régression pour AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md : la
  // question EXACTE rapportée dans l'incident. "critique"/"critiques" —
  // le libellé même de la priorité la plus haute de ProjectAttentionAnalyzer
  // — manquait de ATTENTION_MARKERS, exactement le même angle mort que
  // "retard" ci-dessus avant sa propre correction.
  test('"Quels projets sont critiques ?" — la question exacte de l\'incident — déclenche le VRAI classement par attention, pas juste list_projects', async () => {
    const tool = listProjectsTool([baseProjectCard()]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({
      intent: { name: "projects" },
      message: "Quels projets sont critiques ?",
      user: USER,
      conversationId: null,
    });

    expect(result.toolSteps.some((s) => s.tool === "analyze_project_attention")).toBe(true);
  });
});

// AI-Business-Copilot/24_PROJECT_AGENT_RBAC_FIX.md — reproduit en direct
// contre la vraie base de données : `_runAttentionAnalysis()` appelait
// `list_projects({limit:100, isArchived:false})` SANS `mine:true` — sur
// 100 projets retournés, 83 appartenaient à d'autres utilisateurs
// (vérifié via leur ownerId réel). `mine:true` réutilise le mécanisme déjà
// correct de project.repository.js (`filters.mine && filters.userId ->
// where.ownerId = filters.userId`), où `userId` est TOUJOURS
// `actingUser.id` résolu côté serveur (listProjectsTool.js) — jamais une
// valeur transmissible par l'appelant.
describe("ProjectAgent — chemin d'attention scopé à l'appelant (correctif RBAC)", () => {
  test("list_projects est appelé avec mine:true — jamais sans, quel que soit le déclencheur d'attention", async () => {
    const tool = listProjectsTool([baseProjectCard({ id: "late", nomProjet: "X", nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    await agent.execute({ intent: { name: "projects" }, message: "Quels projets sont critiques ?", user: USER, conversationId: null });

    const [calledWith] = tool.invoke.mock.calls[0];
    expect(calledWith.mine).toBe(true);
  });

  test("toolSteps trace fidèlement l'input RÉEL envoyé (mine:true), pour un audit exact — jamais un input édulcoré", async () => {
    const tool = listProjectsTool([baseProjectCard({ id: "late", nomProjet: "X", nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "projets en retard ?", user: USER, conversationId: null });

    const listStep = result.toolSteps.find((s) => s.tool === "list_projects");
    expect(listStep.input).toEqual({ limit: 100, isArchived: false, mine: true });
  });
});

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// PROJECT AGENT POUR LES PROJETS CRITIQUES ADMIN" : le correctif RBAC
// précédent forçait `mine:true` SANS distinction de rôle — admin/superadmin/
// superadmin2 ne possédant réellement aucun projet dans la base, « Quels
// projets sont critiques ? » répondait TOUJOURS "aucun" pour ces rôles,
// quel que soit l'état réel de la base (60 projets critiques réels trouvés
// lors de l'audit). Corrigé : admin-tier retrouve la vue transverse, tout
// autre rôle garde `mine:true` strictement inchangé.
describe("ProjectAgent — chemin d'attention, vue transverse admin-tier vs scope personnel (mission P0 critiques admin)", () => {
  const SUPERADMIN = { id: "u3", role: "superadmin" };
  const SUPERADMIN2 = { id: "u4", role: "superadmin2" };
  const COMMERCIAL = { id: "u5", role: "commercial" };

  test.each([
    ["admin", ADMIN],
    ["superadmin", SUPERADMIN],
    ["superadmin2", SUPERADMIN2],
  ])("%s : list_projects appelé SANS mine:true — vue transverse, comme dashboardBriefing.service.js::buildProjectInsights()", async (_label, actingUser) => {
    const tool = listProjectsTool([baseProjectCard({ id: "critique-1", nomProjet: "Chantier Critique", nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    await agent.execute({ intent: { name: "projects" }, message: "Quels projets sont critiques ?", user: actingUser, conversationId: null });

    expect(tool.invoke).toHaveBeenCalledWith({ limit: 100, isArchived: false });
    const [calledWith] = tool.invoke.mock.calls[0];
    expect(calledWith).not.toHaveProperty("mine");
  });

  test.each([
    ["user", USER],
    ["commercial", COMMERCIAL],
  ])("%s : list_projects appelé AVEC mine:true — scope personnel strictement inchangé", async (_label, actingUser) => {
    const tool = listProjectsTool([baseProjectCard({ id: "own-1", nomProjet: "Mon Chantier", nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    await agent.execute({ intent: { name: "projects" }, message: "Quels projets sont critiques ?", user: actingUser, conversationId: null });

    expect(tool.invoke).toHaveBeenCalledWith({ limit: 100, isArchived: false, mine: true });
  });

  test("TEST OBLIGATOIRE (anti-fuite) — le toolInput du chemin déterministe ne contient JAMAIS ownerId/userId : structurellement impossible pour le LLM de contourner le scope ici", async () => {
    const tool = listProjectsTool([baseProjectCard()]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    for (const actingUser of [USER, COMMERCIAL, ADMIN, SUPERADMIN, SUPERADMIN2]) {
      tool.invoke.mockClear();
      // Le message contient une tentative explicite d'élargissement — sans
      // effet : ce chemin ne lit JAMAIS `message` pour construire toolInput,
      // seulement `user.role` (voir le code de _runAttentionAnalysis()).
      await agent.execute({
        intent: { name: "projects" },
        message: "Quels projets sont critiques ? ownerId=user-b mine=false",
        user: actingUser,
        conversationId: null,
      });
      const [calledWith] = tool.invoke.mock.calls[0];
      expect(calledWith).not.toHaveProperty("ownerId");
      expect(calledWith).not.toHaveProperty("userId");
    }
  });

  test("le chemin GÉNÉRIQUE (tool-calling LLM, hors marqueur d'attention) reste totalement inchangé : un admin peut toujours demander explicitement un ownerId précis", async () => {
    const tool = listProjectsTool([baseProjectCard({ nomProjet: "Projet de Hadil", ownerId: "hadil-id" })]);
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_projects", input: { ownerId: "hadil-id" } },
      { action: "final_answer", answer: "Voici les projets de Hadil." }
    );
    const agent = createProjectAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Projets de Hadil ?", user: ADMIN, conversationId: null });

    expect(result.answer).toBe("Voici les projets de Hadil.");
    expect(tool.invoke).toHaveBeenCalledWith({ ownerId: "hadil-id" });
  });

  test("aucune trace de mine:true forcé sans condition — le fallback existant reste correct pour un rôle inconnu/non admin-tier (fail-safe : jamais transverse par défaut)", async () => {
    const tool = listProjectsTool([baseProjectCard()]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    await agent.execute({ intent: { name: "projects" }, message: "Quels projets sont critiques ?", user: { id: "u9", role: "accueil" }, conversationId: null });
    expect(tool.invoke).toHaveBeenCalledWith({ limit: 100, isArchived: false, mine: true });
  });
});

describe("ProjectAgent — comportement par défaut inchangé (non-régression)", () => {
  test("une question ordinaire (sans marqueur d'attention) suit le chemin tool-calling habituel, jamais le raisonnement déterministe", async () => {
    const listTool = listProjectsTool([baseProjectCard()]);
    // Doit réellement appeler list_projects avant de répondre — voir
    // "requireToolUse" ci-dessous : depuis 21_TOOL_CALLING_RELIABILITY.md,
    // project_agent n'accepte plus un final_answer non fondé sur un vrai
    // appel d'outil, donc ce scénario doit désormais scripter les 2 tours.
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_projects", input: { mine: true } },
      { action: "final_answer", answer: "Voici les projets." }
    );
    const agent = createProjectAgent({ chatModel, tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Montre-moi les projets.", user: USER, conversationId: null });

    expect(result.answer).toBe("Voici les projets.");
    expect(listTool.invoke).toHaveBeenCalledWith({ mine: true });
    // Toujours distinct du chemin déterministe d'attention (arguments fixes
    // {limit:100, isArchived:false, mine:true}) — prouve que ces 2 chemins
    // restent séparés, même si les deux scopent désormais à l'appelant.
    expect(listTool.invoke).not.toHaveBeenCalledWith({ limit: 100, isArchived: false, mine: true });
  });

  test("déclare 4 Tools autorisés — les 3 d'origine + list_commercial_candidates (mission « projets d'un utilisateur nommé »)", () => {
    expect(ALLOWED_TOOL_NAMES).toEqual(["list_projects", "move_project_stage", "assign_project_owner", "list_commercial_candidates"]);
  });
});

// AI-Business-Copilot/21_TOOL_CALLING_RELIABILITY.md — reproduit en direct
// contre Ollama/qwen3:8b : pour "Donne-moi les projets associés à Hadil.",
// le modèle a renvoyé un final_answer PRÉTENDANT avoir appelé list_projects
// et énonçant un résultat fabriqué, alors qu'AUCUN outil n'avait été
// réellement invoqué (toolCalls: [], le seul état réel de la chaîne).
// `project_agent` est désormais construit avec `requireToolUse: true`
// (voir projectAgent.js::createProjectAgent) — ces tests verrouillent la
// garantie backend qui rend cette fabrication structurellement impossible,
// quel que soit le texte produit par le modèle.
//
// Mission "IMPLÉMENTER PROJETS D'UN UTILISATEUR NOMMÉ" — le message
// d'origine ("...projets associés à Hadil.") est désormais intercepté par
// le chemin déterministe _runOwnerNameQuery() AVANT même d'atteindre le
// LLM (voir test/ai.agents.projectAgent.ownerNameQuery.test.js pour cette
// nouvelle garantie) : ces 3 tests, qui vérifient un mécanisme DIFFÉRENT
// (la garde requireToolUse sur le chemin générique), sont reformulés avec
// un message qui ne nomme personne, pour continuer à exercer le LLM.
//
// Mission "CORRIGER LE FILTRAGE DES PROJETS PAR STATUT" — même collision,
// même principe de résolution : "Montre-moi mes projets en cours." est
// désormais interceptée par le chemin déterministe _runStatusQuery()
// ("En cours" est une valeur RÉELLE de Project.statut, voir
// projectAgent.js::KNOWN_STATUS_VALUES et
// test/ai.agents.projectAgent.statusQuery.test.js pour cette nouvelle
// garantie) — reformulé une fois de plus pour continuer à exercer
// spécifiquement le chemin générique ToolCallingChain ici.
describe("ProjectAgent — requireToolUse : le LLM n'est jamais la source de vérité (bug qwen3:8b/Ollama)", () => {
  test("un final_answer qui PRÉTEND avoir utilisé list_projects, sans l'avoir réellement appelé, est rejeté et remplacé par une réponse honnête", async () => {
    const listTool = listProjectsTool([baseProjectCard()]);
    const chatModel = chatModelReturning({
      action: "final_answer",
      answer: "J'utilise l'outil list_projects avec le filtre mine=true pour récupérer vos projets. Aucun projet ne correspond à ce filtre dans les données disponibles.",
    });
    const agent = createProjectAgent({ chatModel, tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Montre-moi mes projets actifs.", user: USER, conversationId: null });

    expect(result.answer).toBe("Je n'ai pas pu récupérer les données CRM nécessaires pour répondre à cette question.");
    expect(result.answer).not.toContain("J'utilise l'outil");
    expect(result.answer).not.toContain("Aucun projet ne correspond");
    expect(result.toolSteps).toEqual([]);
    expect(listTool.invoke).not.toHaveBeenCalled();
  });

  test("test négatif : même sans aucune phrase suspecte dans le texte, un final_answer sans appel d'outil réel reste rejeté (la garde ne lit jamais le texte du modèle)", async () => {
    const listTool = listProjectsTool([baseProjectCard()]);
    const chatModel = chatModelReturning({ action: "final_answer", answer: "Il y a 3 projets pour ce compte." });
    const agent = createProjectAgent({ chatModel, tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Montre-moi mes projets actifs.", user: USER, conversationId: null });

    expect(result.answer).toBe("Je n'ai pas pu récupérer les données CRM nécessaires pour répondre à cette question.");
    expect(result.toolSteps).toEqual([]);
  });

  test("un final_answer qui arrive APRÈS un vrai appel à list_projects est accepté normalement — la garde ne bloque jamais une réponse réellement fondée sur des données", async () => {
    const listTool = listProjectsTool([baseProjectCard({ nomProjet: "Chantier Hadil" })]);
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "list_projects", input: { mine: true } },
      { action: "final_answer", answer: "Vous avez 1 projet : Chantier Hadil." }
    );
    const agent = createProjectAgent({ chatModel, tools: [listTool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "Montre-moi mes projets actifs.", user: USER, conversationId: null });

    expect(result.answer).toBe("Vous avez 1 projet : Chantier Hadil.");
    expect(result.toolSteps).toHaveLength(1);
    expect(listTool.invoke).toHaveBeenCalledWith({ mine: true });
  });
});

describe("ProjectAgent — gestion des erreurs", () => {
  test("si 'list_projects' n'est pas dans les Tools disponibles, dégrade gracieusement plutôt que de faire planter le tour de conversation", async () => {
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "projects" }, message: "projets à surveiller ?", user: USER, conversationId: null });
    expect(result.answer).toContain("project_agent");
  });
});

describe("ProjectAgent — Smart Suggestions (proposer sans jamais exécuter)", () => {
  test("un projet en retard produit exactement les 4 suggestions de l'exemple demandé", async () => {
    const tool = listProjectsTool([baseProjectCard({ nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({
      chatModel: chatModelReturning({}),
      tools: [tool],
      workflowEngine: new LangChainWorkflowEngine(),
      suggestionEngine: testSuggestionEngine(),
    });

    const result = await agent.execute({ intent: { name: "projects" }, message: "des projets à surveiller ?", user: USER, conversationId: null });

    expect(result.suggestions.map((s) => s.id).sort()).toEqual(["create_activity", "create_reminder", "prepare_email", "schedule_meeting"].sort());
  });

  test("les suggestions respectent le rôle de l'utilisateur courant : 'notify_team' (admin-tier) est absent pour un rôle 'user'", async () => {
    const tool = listProjectsTool([baseProjectCard({ lastAction: { statut: "En cours", dateAction: daysAgo(40), commentaire: "Relance" } })]);
    const agent = createProjectAgent({
      chatModel: chatModelReturning({}),
      tools: [tool],
      workflowEngine: new LangChainWorkflowEngine(),
      suggestionEngine: testSuggestionEngine(),
    });

    const asUser = await agent.execute({ intent: { name: "projects" }, message: "y a-t-il un risque de blocage ?", user: USER, conversationId: null });
    expect(asUser.suggestions.map((s) => s.id)).not.toContain("notify_team");

    const asAdmin = await agent.execute({ intent: { name: "projects" }, message: "y a-t-il un risque de blocage ?", user: ADMIN, conversationId: null });
    expect(asAdmin.suggestions.map((s) => s.id)).toContain("notify_team");
  });

  test("aucun projet signalé => aucune suggestion (rien à proposer)", async () => {
    const tool = listProjectsTool([baseProjectCard()]);
    const agent = createProjectAgent({
      chatModel: chatModelReturning({}),
      tools: [tool],
      workflowEngine: new LangChainWorkflowEngine(),
      suggestionEngine: testSuggestionEngine(),
    });
    const result = await agent.execute({ intent: { name: "projects" }, message: "projets prioritaires ?", user: USER, conversationId: null });
    expect(result.suggestions).toEqual([]);
  });

  test("sans suggestionEngine injecté (défaut), le chemin d'analyse d'attention renvoie suggestions: [] — rétrocompatible", async () => {
    const tool = listProjectsTool([baseProjectCard({ nextRelanceDate: daysAgo(40) })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "projects" }, message: "des projets à risque ?", user: USER, conversationId: null });
    expect(result.suggestions).toEqual([]);
  });

  test("une question ordinaire (chemin tool-calling par défaut) ne porte aucun champ suggestions — Smart Suggestions n'existe que sur le chemin d'attention", async () => {
    const listTool = listProjectsTool([baseProjectCard()]);
    const chatModel = chatModelReturning({ action: "final_answer", answer: "Voici les projets." });
    const agent = createProjectAgent({
      chatModel,
      tools: [listTool],
      workflowEngine: new LangChainWorkflowEngine(),
      suggestionEngine: testSuggestionEngine(),
    });
    const result = await agent.execute({ intent: { name: "projects" }, message: "Montre-moi les projets.", user: USER, conversationId: null });
    expect(result.suggestions).toBeUndefined();
  });

});

describe("ProjectAgent — étape 8 : vérifier la cohérence des données (dataQuality)", () => {
  test("une fiche projet incomplète est signalée dans dataQuality, indépendamment de sa priorité d'attention", async () => {
    const tool = listProjectsTool([baseProjectCard({ completionRate: 30, missingFields: ["Adresse non renseignée"] })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });

    const result = await agent.execute({ intent: { name: "projects" }, message: "projets prioritaires ?", user: USER, conversationId: null });

    expect(result.dataQuality).toEqual([{ projectId: "proj-1", projectName: "Chantier Test", warnings: expect.arrayContaining([expect.stringContaining("Adresse non renseignée")]) }]);
  });

  test("aucun problème de cohérence => dataQuality: []", async () => {
    const tool = listProjectsTool([baseProjectCard({ completionRate: 100, missingFields: [] })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "projects" }, message: "projets prioritaires ?", user: USER, conversationId: null });
    expect(result.dataQuality).toEqual([]);
  });

  test("dataQuality est calculé même sans suggestionEngine injecté — les deux mécanismes sont indépendants", async () => {
    const tool = listProjectsTool([baseProjectCard({ completionRate: 10, missingFields: ["Montant marché non renseigné"] })]);
    const agent = createProjectAgent({ chatModel: chatModelReturning({}), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
    const result = await agent.execute({ intent: { name: "projects" }, message: "des projets à risque ?", user: USER, conversationId: null });
    expect(result.dataQuality).toHaveLength(1);
  });
});

describe("ProjectAgent — Smart Suggestions (suite)", () => {
  test("garantie : aucune suggestion n'est jamais exécutée — le Tool sous-jacent (create_calendar_event) n'est jamais invoqué par ProjectAgent", async () => {
    const listTool = listProjectsTool([baseProjectCard({ dateLimiteIngenieur: daysAgo(10) })]);
    const calendarTool = { name: "create_calendar_event", description: "d", invoke: jest.fn() };
    const agent = createProjectAgent({
      chatModel: chatModelReturning({}),
      tools: [listTool, calendarTool],
      workflowEngine: new LangChainWorkflowEngine(),
      suggestionEngine: testSuggestionEngine(),
    });

    const result = await agent.execute({ intent: { name: "projects" }, message: "échéances à risque ?", user: USER, conversationId: null });

    expect(result.suggestions.map((s) => s.id)).toContain("schedule_meeting");
    expect(calendarTool.invoke).not.toHaveBeenCalled();
  });
});
