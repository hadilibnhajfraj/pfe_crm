"use strict";

// Mission "CORRIGER LE FILTRAGE DES PROJETS PAR STATUT". Tests unitaires
// (Tool list_projects mocké) — voir
// test/ai.orchestrator.projectAgent.statusQuery.integration.test.js pour la
// preuve réelle (VRAIE base). Cause racine (vérifiée en direct avant tout
// correctif) : project.repository.js::buildBaseWhere() n'avait JAMAIS de
// branche pour filtrer sur `statut` — corrigée dans
// project.repository.js/project.service.js/listProjectsTool.js ; ce fichier
// verrouille en plus l'extraction/normalisation déterministe côté
// ProjectAgent (jamais confiée au LLM).

const { createProjectAgent, KNOWN_STATUS_VALUES, normalizeAccents } = require("../src/ai/agents/projectAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");

const ADMIN = { id: "u-admin", role: "admin" };
const USER = { id: "u-user", role: "user" };

function project(overrides = {}) {
  return { id: "p1", nomProjet: "Chantier X", statut: "Négociation", owner: { name: "Karim" }, dateDemarrage: "2026-08-01", ...overrides };
}

function listProjectsTool(projects, total = projects.length) {
  return {
    name: "list_projects",
    description: "d",
    invoke: jest.fn(async () => JSON.stringify({ data: projects, total, stats: {}, page: 1, pages: 1, limit: 100 })),
  };
}

function chatModelNeverCalled() {
  const complete = jest.fn(async () => {
    throw new Error("LLM ne devrait jamais être sollicité — chemin déterministe");
  });
  return { model: new LlmProviderChatModel({ llmProvider: { complete } }), complete };
}

function buildAgent(tools, chatModel) {
  return createProjectAgent({ chatModel, tools, workflowEngine: new LangChainWorkflowEngine() });
}

describe("Mission STATUT — TEST 1/2/3 : « Négociation »/« négociation »/« NEGOCIATION » -> mêmes projets réels retournés", () => {
  test.each([
    ["Négociation (casse/accent d'origine)", "donner moi les projet dont son statut est Négociation"],
    ["négociation (minuscule accentué)", "Donne-moi les projets avec le statut négociation"],
    ["NEGOCIATION (majuscule sans accent)", "donner moi les projet dont son statut est NEGOCIATION"],
  ])("%s", async (_label, message) => {
    const projects = [project({ id: "p1", nomProjet: "Résidence khlifa 5" }), project({ id: "p2", nomProjet: "ELLA 2" })];
    const tool = listProjectsTool(projects, 23);
    const { model: chatModel, complete } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    const result = await agent.execute({ intent: { name: "projects" }, message, user: ADMIN, conversationId: null });

    // La VALEUR envoyée au Tool est toujours la forme RÉELLEMENT stockée en
    // base ("Négociation"), jamais la casse/accentuation brute du message.
    expect(tool.invoke).toHaveBeenCalledWith(expect.objectContaining({ statut: "Négociation" }));
    expect(result.answer).toContain("Résidence khlifa 5");
    expect(result.answer).toContain("ELLA 2");
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("Mission STATUT — TEST 4 : « Liste les projets en Négociation » -> Tool réellement appelé", () => {
  test("le Tool list_projects est invoqué avec statut='Négociation', jamais une réponse sans appel réel", async () => {
    const tool = listProjectsTool([project()], 1);
    const { model: chatModel } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    const result = await agent.execute({ intent: { name: "projects" }, message: "Liste les projets en Négociation", user: ADMIN, conversationId: null });

    expect(tool.invoke).toHaveBeenCalledTimes(1);
    expect(tool.invoke).toHaveBeenCalledWith(expect.objectContaining({ statut: "Négociation" }));
    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0].tool).toBe("list_projects");
  });
});

describe("Mission STATUT — TEST 5 : statut inexistant -> réponse honnête, jamais une fabrication", () => {
  test("« Liste les projets en cours » avec 0 résultat réel -> message honnête, aucun projet inventé", async () => {
    const tool = listProjectsTool([], 0);
    const { model: chatModel } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    const result = await agent.execute({ intent: { name: "projects" }, message: "Liste les projets en cours", user: ADMIN, conversationId: null });

    expect(tool.invoke).toHaveBeenCalledWith(expect.objectContaining({ statut: "En cours" }));
    expect(result.answer).toMatch(/Aucun projet trouvé/i);
    expect(result.answer).toContain("En cours");
  });
});

describe("Mission STATUT — TEST 6 : le LLM ne peut jamais inventer un projet — le chemin est 100% déterministe", () => {
  test("complete() (le LLM) n'est JAMAIS appelé pour une requête de statut reconnue, résultat vide ou non", async () => {
    const tool = listProjectsTool([], 0);
    const { model: chatModel, complete } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    await agent.execute({ intent: { name: "projects" }, message: "Quels sont les projets dont le statut est Négociation ?", user: ADMIN, conversationId: null });

    // `complete` lève une erreur s'il est appelé (voir chatModelNeverCalled) —
    // le test aurait donc déjà échoué si le LLM avait été sollicité. Vérifié
    // explicitement en plus, pour que l'intention du test reste lisible.
    expect(complete).not.toHaveBeenCalled();
  });
});

describe("Mission STATUT — TEST 7 : le nombre annoncé correspond EXACTEMENT à ce que le Tool a renvoyé", () => {
  test("total réel du Tool (23) reflété tel quel dans la réponse, jamais recalculé/approché", async () => {
    const projects = Array.from({ length: 10 }, (_, i) => project({ id: `p${i}`, nomProjet: `Projet ${i}` }));
    const tool = listProjectsTool(projects, 23); // Tool renvoie 10 lignes (page) mais total=23
    const { model: chatModel } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    const result = await agent.execute({ intent: { name: "projects" }, message: "donner moi les projet dont son statut est Négociation", user: ADMIN, conversationId: null });

    expect(result.answer).toContain("23 projets trouvés");
    expect(result.toolSteps[0].output).toContain("10/23");
    // Jamais plus de 10 fiches détaillées affichées (lisibilité du panneau).
    expect((result.answer.match(/👤 Responsable/g) || []).length).toBeLessThanOrEqual(10);
  });
});

describe("Mission STATUT — TEST 8 : RBAC inchangé — même scoping mine/admin-tier que le reste de ProjectAgent", () => {
  test("rôle non admin-tier ('user') -> mine:true systématiquement ajouté", async () => {
    const tool = listProjectsTool([project()], 1);
    const { model: chatModel } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    await agent.execute({ intent: { name: "projects" }, message: "donner moi les projet dont son statut est Négociation", user: USER, conversationId: null });

    expect(tool.invoke).toHaveBeenCalledWith(expect.objectContaining({ statut: "Négociation", mine: true }));
  });

  test("rôle admin-tier ('admin') -> jamais mine:true forcé (visibilité transverse)", async () => {
    const tool = listProjectsTool([project()], 1);
    const { model: chatModel } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);

    await agent.execute({ intent: { name: "projects" }, message: "donner moi les projet dont son statut est Négociation", user: ADMIN, conversationId: null });

    const calledWith = tool.invoke.mock.calls[0][0];
    expect(calledWith.mine).toBeUndefined();
  });
});

describe("Mission STATUT — non-régression : messages qui NE doivent PAS déclencher ce chemin", () => {
  test.each([
    ["question de capacité générale", "Quels projets sont critiques ?"],
    ["requête propriétaire nommé", "projets de Hadil"],
    ["description d'un projet précis (le mot « statut » y figure aussi)", "Quel est le statut du projet Sfax ?"],
  ])("%s -> _extractStatus retourne null, chemin générique/existant inchangé", async (_label, message) => {
    const tool = listProjectsTool([project()], 1);
    const { model: chatModel } = chatModelNeverCalled();
    const agent = buildAgent([tool], chatModel);
    expect(agent._extractStatus(message)).toBeNull();
  });
});

describe("Mission STATUT — KNOWN_STATUS_VALUES / normalizeAccents", () => {
  test("11 valeurs réelles, vérifiées en base (dashboard.service.js — GROUP BY statut)", () => {
    expect(KNOWN_STATUS_VALUES).toHaveLength(11);
    expect(KNOWN_STATUS_VALUES).toContain("Négociation");
  });

  test("normalizeAccents est insensible à la casse et aux accents", () => {
    expect(normalizeAccents("Négociation")).toBe(normalizeAccents("negociation"));
    expect(normalizeAccents("NÉGOCIATION")).toBe(normalizeAccents("négociation"));
  });
});
