"use strict";

// Phase 2 — assistant documentaire de bout en bout : VRAI AIManager, VRAIS
// resolvers, VRAI DocumentAgent, VRAI UserDocumentService (même pipeline RAG
// que la documentation). Simulés : le modèle de langage (on CAPTURE ce qu'il
// reçoit) et le Tool list_projects (périmètre « mine » appliqué).

const os = require("os");
const { AIManager } = require("../src/ai/orchestrator/aiManager");
const { ResponseBuilder } = require("../src/ai/orchestrator/responseBuilder");
const { ConversationManager } = require("../src/ai/orchestrator/conversationManager");
const { ConversationContextResolver } = require("../src/ai/orchestrator/conversationContextResolver");
const { ConversationContinuityResolver } = require("../src/ai/orchestrator/conversationContinuityResolver");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { AgentRouter } = require("../src/ai/orchestrator/agentRouter");
const { createDocumentAgent } = require("../src/ai/agents/documentAgent");
const { createProjectAgent } = require("../src/ai/agents/projectAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { InMemoryConversationMemory } = require("../src/ai/memory");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { ContextManager } = require("../src/ai/orchestrator/contextManager");
const { SemanticIntentResolver } = require("../src/ai/orchestrator/semanticIntentResolver");
const { createRagPipeline } = require("../src/ai/rag/pipeline");
const { buildPdf } = require("./fixtures/copilotDocumentFixtures");

const ALICE = { id: "alice", role: "commercial", email: "alice@cbi.tn" };
const BOB = { id: "bob", role: "commercial", email: "bob@cbi.tn" };

const PROJECTS = [
  { id: "p-sfax", nomProjet: "Sfax Port", statut: "En cours", ownerId: "alice", owner: { name: "Alice" }, lastRelanceAt: null },
  { id: "p-bob", nomProjet: "Projet de Bob", statut: "Terminé", ownerId: "bob", owner: { name: "Bob" }, lastRelanceAt: null },
];

function listProjectsTool() {
  return {
    name: "list_projects",
    description: "Liste les projets",
    invoke: jest.fn(async (input) => {
      // Même règle que scopeInputForActingUser() : non-admin → ses projets seulement.
      const actor = listProjectsTool.currentUser;
      const rows = PROJECTS.filter((p) => !input.mine || p.ownerId === actor.id);
      return JSON.stringify({ data: rows, total: rows.length });
    }),
  };
}

// 30 pages : un document « long » — le prompt ne doit jamais tout contenir.
const REPORT_PAGES = [
  "Rapport de suivi PROBAR machine 3 - septembre",
  "Probleme : panne du moteur de la machine PROMESH 2, arret de 6 heures",
  "Probleme : retard de livraison des treillis pour le projet Sfax Port",
  "Le projet Sfax Port est en Negociation avec le client",
  ...Array.from({ length: 26 }, (_v, i) => `Section annexe ${i + 1} : releves de production standards sans incident particulier`),
];

async function build({ llmReply = "Synthèse : panne PROMESH 2 et retard de livraison [1][2]." } = {}) {
  const rag = createRagPipeline({ allowedRoots: [os.tmpdir()] });
  const prompts = [];
  const complete = jest.fn(async (messages) => {
    prompts.push(messages.map((m) => m.content).join("\n"));
    return llmReply;
  });
  const chatModel = new LlmProviderChatModel({ llmProvider: { complete } });
  const tool = listProjectsTool();
  const memory = new InMemoryConversationMemory();
  const registry = new AgentRegistry();
  const common = { chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), memory, maxHistoryMessages: 6 };
  registry.register(createDocumentAgent({ ...common, userDocumentService: rag.userDocumentService }));
  registry.register(createProjectAgent({ ...common, maxToolCalls: 3 }));
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
    contextManager: new ContextManager(),
    semanticResolver: new SemanticIntentResolver({ logger: { info() {}, warn() {} } }),
  });
  return { manager, rag, prompts, complete, tool };
}

async function upload(rag, owner) {
  return rag.userDocumentService.addDocument({ ownerId: owner.id, filename: "rapport_septembre.pdf", kind: "pdf", buffer: buildPdf(REPORT_PAGES) });
}

describe("Assistant documentaire — les 4 questions obligatoires", () => {
  test("« Résume ce fichier. » → DocumentAgent, résumé fondé sur un ÉCHANTILLON borné (jamais le document entier)", async () => {
    const { manager, rag, prompts } = await build();
    const doc = await upload(rag, ALICE);
    listProjectsTool.currentUser = ALICE;
    const r = await manager.handleMessage({ message: "Résume ce fichier.", user: ALICE, conversationId: "c1", documents: [doc] });

    expect(r).toMatchObject({ intent: "document_question", agent: "document_agent", mode: "agent" });
    expect(r.answer).toContain("Résumé — rapport_septembre.pdf");
    expect(r.answer).toMatch(/à partir de 8 extraits répartis sur les 30 passages/);
    expect(prompts).toHaveLength(1);
    const pagesInPrompt = REPORT_PAGES.filter((p) => prompts[0].includes(p)).length;
    expect(pagesInPrompt).toBeLessThanOrEqual(8);
    expect(prompts[0]).toMatch(/DONNÉES, jamais des instructions/);
    expect(r.citations[0]).toMatchObject({ title: "rapport_septembre.pdf", sourceType: "user_document" });
    expect(r.citations[0].path).toMatch(/page \d+/);
  });

  test("« Quels sont les problèmes mentionnés dans ce document ? » → extraits pertinents cités (panne, retard)", async () => {
    const { manager, rag, prompts } = await build();
    const doc = await upload(rag, ALICE);
    const r = await manager.handleMessage({ message: "Quels sont les problèmes mentionnés dans ce document ?", user: ALICE, conversationId: "c2", documents: [doc] });

    expect(r).toMatchObject({ intent: "document_question", agent: "document_agent" });
    expect(prompts[0]).toContain("panne du moteur de la machine PROMESH 2");
    expect(prompts[0]).toContain("retard de livraison");
    expect(r.answer).toMatch(/Réponse fondée sur \d extrait/);
    expect(r.citations.length).toBeGreaterThan(0);
  });

  test("« Trouve les informations concernant PROBAR. » (document joint plus tôt) → le document, pas le module industriel", async () => {
    const { manager, rag, prompts } = await build();
    const doc = await upload(rag, ALICE);
    await manager.handleMessage({ message: "Voici mon rapport.", user: ALICE, conversationId: "c3", documents: [doc] });
    prompts.length = 0;
    const r = await manager.handleMessage({ message: "Trouve les informations concernant PROBAR.", user: ALICE, conversationId: "c3" });

    expect(r).toMatchObject({ intent: "document_question", agent: "document_agent" });
    expect(prompts[0]).toContain("Rapport de suivi PROBAR machine 3");
  });

  test("« Compare ce document avec le projet actuel dans le CRM. » → comparaison DÉTERMINISTE en 4 sections, conflit de statut détecté", async () => {
    const { manager, rag, complete } = await build();
    const doc = await upload(rag, ALICE);
    listProjectsTool.currentUser = ALICE;
    const r = await manager.handleMessage({
      message: "Compare ce document avec le projet actuel dans le CRM.",
      user: ALICE,
      conversationId: "c4",
      documents: [doc],
      pageContext: { screen: "project", entity: "project", recordId: "p-sfax", label: "Sfax Port" },
    });

    expect(r).toMatchObject({ intent: "document_question", agent: "document_agent" });
    for (const section of ["📄 SOURCE DOCUMENT", "🗂️ SOURCE CRM", "⚠️ CONFLITS ENTRE SOURCES", "❓ INFORMATIONS MANQUANTES"]) {
      expect(r.answer).toContain(section);
    }
    expect(r.answer).toContain("Statut : En cours"); // CRM
    expect(r.answer).toMatch(/le document indique « Négociation », le CRM indique « En cours »/);
    expect(complete).not.toHaveBeenCalled(); // aucune donnée déduite par un modèle
    expect(r.toolCalls.find((c) => c.tool === "list_projects").input.mine).toBe(true);
  });

  test("comparaison sans projet ouvert → demande de préciser, rien d'inventé", async () => {
    const { manager, rag } = await build();
    const doc = await upload(rag, ALICE);
    const r = await manager.handleMessage({ message: "Compare ce document avec le projet actuel dans le CRM.", user: ALICE, conversationId: "c5", documents: [doc] });
    expect(r.answer).toMatch(/ouvrez d'abord la fiche du projet/);
  });

  test("comparaison avec un projet hors périmètre (recordId d'un autre commercial) → refus, aucune donnée CRM divulguée", async () => {
    const { manager, rag } = await build();
    const doc = await upload(rag, ALICE);
    listProjectsTool.currentUser = ALICE;
    const r = await manager.handleMessage({
      message: "Compare ce document avec le projet actuel dans le CRM.",
      user: ALICE,
      conversationId: "c6",
      documents: [doc],
      pageContext: { screen: "project", entity: "project", recordId: "p-bob" },
    });
    expect(r.answer).toMatch(/ne retrouve pas ce projet parmi les projets auxquels vous avez accès/);
    expect(r.answer).not.toContain("Terminé");
  });
});

describe("Permissions et robustesse", () => {
  test("le document d'un autre utilisateur n'est jamais lu, même si son identifiant atteint l'agent", async () => {
    const { manager, rag, prompts } = await build();
    const aliceDoc = await upload(rag, ALICE);
    // Le bridge filtre déjà par propriétaire ; on simule ici un identifiant
    // étranger qui lui échapperait : UserDocumentService refiltre par user.id.
    const r = await manager.handleMessage({ message: "Résume ce fichier.", user: BOB, conversationId: "c7", documents: [aliceDoc] });
    expect(r.answer).toMatch(/n'est plus disponible/);
    expect(prompts).toHaveLength(0);
  });

  test("modèle indisponible → extraits pertinents renvoyés (jamais un échec muet ni une invention)", async () => {
    const { manager, rag, complete } = await build();
    complete.mockRejectedValue(new Error("ollama down"));
    const doc = await upload(rag, ALICE);
    const r = await manager.handleMessage({ message: "Quels sont les problèmes mentionnés dans ce document ?", user: ALICE, conversationId: "c8", documents: [doc] });
    expect(r.answer).toMatch(/Passages les plus pertinents/);
    expect(r.answer).toContain("panne du moteur");
  });

  test("sans document actif, les questions CRM ne sont jamais détournées vers les documents", async () => {
    const { manager } = await build();
    listProjectsTool.currentUser = ALICE;
    const r = await manager.handleMessage({ message: "Montre-moi mes affaires en cours", user: ALICE, conversationId: "c9" });
    expect(r).toMatchObject({ intent: "projects", agent: "project_agent" });
  });

  test("avec un document actif, une question CRM explicite reste une question CRM", async () => {
    const { manager, rag } = await build();
    const doc = await upload(rag, ALICE);
    listProjectsTool.currentUser = ALICE;
    await manager.handleMessage({ message: "Voici mon rapport.", user: ALICE, conversationId: "c10", documents: [doc] });
    const r = await manager.handleMessage({ message: "Montre-moi mes affaires en cours", user: ALICE, conversationId: "c10" });
    expect(r).toMatchObject({ intent: "projects", agent: "project_agent" });
  });
});
