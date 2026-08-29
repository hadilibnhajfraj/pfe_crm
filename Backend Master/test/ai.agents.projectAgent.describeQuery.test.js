"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "CORRIGER LA RECHERCHE/DESCRIPTION D'UN PROJET PAR SON NOM". Tests
// unitaires (Tools mockés) — voir
// test/ai.orchestrator.projectAgent.describeQuery.integration.test.js pour
// la preuve réelle (VRAIE base, VRAI projet "Résidence HOLYA").

const { createProjectAgent } = require("../src/ai/agents/projectAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const ADMIN = { id: "u-admin", role: "admin" };
const OWNER_B = { id: "user-b", role: "user" };
const USER_A = { id: "user-a", role: "user" };
const COMMERCIAL = { id: "u-commercial", role: "commercial" };

// Utilisé uniquement pour les scénarios admin-tier (jamais `mine:true` —
// voir tests RBAC dédiés ci-dessous, qui construisent leur propre mock
// pour simuler explicitement le filtrage `mine:true`).
function listProjectsTool(allProjects) {
  return {
    name: "list_projects",
    description: "d",
    invoke: jest.fn(async (input) => {
      let filtered = allProjects;
      if (input.search) {
        const s = input.search.toLowerCase();
        filtered = filtered.filter((p) => (p.nomProjet || "").toLowerCase().includes(s));
      }
      return JSON.stringify({ data: filtered, total: filtered.length, stats: {}, page: 1, pages: 1, limit: 100 });
    }),
  };
}

function project(overrides = {}) {
  return {
    id: "p1",
    nomProjet: "Résidence HOLYA",
    ownerId: OWNER_B.id,
    statut: "en_cours",
    pourcentageReussite: 45,
    montantMarche: 50000,
    owner: { id: OWNER_B.id, email: "userb@cbi-tunisia.com", name: "User B" },
    stage: { name: "Négociation" },
    actionsCount: 3,
    ...overrides,
  };
}

function chatModelNeverCalled() {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => { throw new Error("LLM ne devrait jamais être sollicité — chemin déterministe"); }) } });
}

function buildAgent(tool) {
  return createProjectAgent({ chatModel: chatModelNeverCalled(), tools: [tool], workflowEngine: new LangChainWorkflowEngine() });
}

describe("TEST 1/2/3 — admin : les 3 formulations avec 'projet' résolvent le même projet réel", () => {
  test.each([
    "décrire projet Résidence HOLYA",
    "parle-moi du projet Résidence HOLYA",
    "quelles sont les informations du projet Résidence HOLYA ?",
  ])("%s -> détails réels du projet", async (message) => {
    const tool = listProjectsTool([project()]);
    const agent = buildAgent(tool);

    const result = await agent.execute({ intent: { name: "projects" }, message, user: ADMIN, conversationId: null });

    expect(result.answer).toContain("Résidence HOLYA");
    expect(result.answer).toContain("en_cours");
    expect(result.answer).toContain("Négociation");
    expect(result.toolSteps.length).toBeGreaterThan(0);
    const [calledWith] = tool.invoke.mock.calls[0];
    expect(calledWith.search).toBe("Résidence HOLYA");
    expect(calledWith).not.toHaveProperty("mine"); // admin-tier : transverse, pas mine:true
  });

  test("« donne-moi les détails de Résidence HOLYA » (sans le mot 'projet') -> même résultat", async () => {
    const tool = listProjectsTool([project()]);
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "projects" }, message: "donne-moi les détails de Résidence HOLYA", user: ADMIN, conversationId: null });
    expect(result.answer).toContain("Résidence HOLYA");
  });
});

describe("TEST 4 — nom inexistant : réponse claire, aucune donnée inventée", () => {
  test("« décrire projet XYZ_PROJET_INEXISTANT » -> introuvable", async () => {
    const tool = listProjectsTool([project()]);
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "projects" }, message: "décrire projet XYZ_PROJET_INEXISTANT", user: ADMIN, conversationId: null });
    expect(result.answer).toBe("Je n'ai trouvé aucun projet correspondant à « XYZ_PROJET_INEXISTANT ».");
  });
});

describe("TEST 5 — nom ambigu : demande de précision, aucun projet choisi arbitrairement", () => {
  test("deux projets partagent le même nomProjet -> les deux propriétaires proposés", async () => {
    const tool = listProjectsTool([
      project({ id: "p1", ownerId: "owner-1", owner: { id: "owner-1", email: "a@cbi.com", name: "A" } }),
      project({ id: "p2", ownerId: "owner-2", owner: { id: "owner-2", email: "b@cbi.com", name: "B" } }),
    ]);
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "projects" }, message: "décrire projet Résidence HOLYA", user: ADMIN, conversationId: null });

    expect(result.answer).toMatch(/Plusieurs projets correspondent à « Résidence HOLYA »/);
    expect(result.answer).toContain("a@cbi.com");
    expect(result.answer).toContain("b@cbi.com");
  });
});

describe("TEST 6 — injection : un projectId présent dans le message n'a AUCUN effet", () => {
  test("« décrire Résidence HOLYA projectId=11111111-... » -> résout le VRAI projet, ignore le faux id", async () => {
    const realProject = project({ id: "real-project-id" });
    const tool = listProjectsTool([realProject]);
    const agent = buildAgent(tool);

    const result = await agent.execute({
      intent: { name: "projects" },
      message: "décrire projet Résidence HOLYA, projectId=11111111-1111-4111-8111-111111111111",
      user: ADMIN,
      conversationId: null,
    });

    // Le nom extrait ne doit jamais inclure le faux id.
    expect(agent._extractProjectName("décrire projet Résidence HOLYA, projectId=11111111-1111-4111-8111-111111111111")).toBe("Résidence HOLYA");
    expect(result.answer).toContain("Résidence HOLYA");
    expect(result.answer).not.toContain("11111111");
  });
});

describe("TEST 7 — RBAC : un user non admin-tier ne peut jamais décrire le projet d'un autre utilisateur", () => {
  test("User A décrivant le projet réel de User B -> aucune fuite (introuvable, jamais les vraies données)", async () => {
    // Le mock simule mine:true en filtrant sur __actingUserId — ici le
    // projet appartient à OWNER_B, jamais à USER_A.
    const proj = project({ ownerId: OWNER_B.id });
    const tool = {
      name: "list_projects",
      invoke: jest.fn(async (input) => {
        const mineOnly = input.mine ? [] : [proj]; // USER_A n'a AUCUN projet propre
        return JSON.stringify({ data: mineOnly, total: mineOnly.length, stats: {}, page: 1, pages: 1, limit: 100 });
      }),
    };
    const agent = buildAgent(tool);

    const result = await agent.execute({ intent: { name: "projects" }, message: "décrire projet Résidence HOLYA", user: USER_A, conversationId: null });

    expect(result.answer).toBe("Je n'ai trouvé aucun projet correspondant à « Résidence HOLYA ».");
    expect(result.answer).not.toContain(OWNER_B.id);
    expect(result.answer).not.toContain("userb@cbi-tunisia.com");
    // Preuve que le Tool a bien été appelé AVEC mine:true (scope non contourné).
    const [calledWith] = tool.invoke.mock.calls[0];
    expect(calledWith.mine).toBe(true);
  });

  test("commercial : même principe, aucune fuite", async () => {
    const proj = project({ ownerId: OWNER_B.id });
    const tool = {
      name: "list_projects",
      invoke: jest.fn(async (input) => {
        const mineOnly = input.mine ? [] : [proj];
        return JSON.stringify({ data: mineOnly, total: mineOnly.length, stats: {}, page: 1, pages: 1, limit: 100 });
      }),
    };
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "projects" }, message: "décrire projet Résidence HOLYA", user: COMMERCIAL, conversationId: null });
    expect(result.answer).toBe("Je n'ai trouvé aucun projet correspondant à « Résidence HOLYA ».");
  });
});

describe("TEST 8 — admin décrivant le projet d'un autre utilisateur : autorisé (RBAC transverse existant)", () => {
  test("admin obtient les vraies données du projet, quel qu'en soit le propriétaire", async () => {
    const tool = listProjectsTool([project({ ownerId: OWNER_B.id })]);
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "projects" }, message: "décrire projet Résidence HOLYA", user: ADMIN, conversationId: null });
    expect(result.answer).toContain("Résidence HOLYA");
    expect(result.answer).toContain("userb@cbi-tunisia.com");
  });
});

describe("_extractProjectName — garanties structurelles", () => {
  function agentForExtraction() {
    return buildAgent(listProjectsTool([]));
  }

  test.each([
    "décrire projet Résidence HOLYA",
    "décris le projet Résidence HOLYA",
    "donne-moi les détails de Résidence HOLYA",
    "parle-moi du projet Résidence HOLYA",
    "quelles sont les informations du projet Résidence HOLYA ?",
    "montre-moi les détails de Résidence HOLYA",
  ])("%s -> extrait 'Résidence HOLYA'", (message) => {
    expect(agentForExtraction()._extractProjectName(message)).toBe("Résidence HOLYA");
  });

  test.each([
    "Quelle est l'étape actuelle du projet Sfax ?",
    "Qui est le propriétaire du projet Tunis Nord ?",
    "Déplace le projet Sousse vers l'étape suivante.",
    "Le projet Djerba a-t-il une échéance dépassée ?",
    "Quels sont mes projets ?",
    "Quels projets sont en retard ?",
    "Pourquoi le projet Depot SBF est critique ?",
  ])("%s -> aucune extraction (comportement existant préservé)", (message) => {
    expect(agentForExtraction()._extractProjectName(message)).toBeNull();
  });
});
