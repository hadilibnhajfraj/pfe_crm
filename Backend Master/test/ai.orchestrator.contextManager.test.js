"use strict";

// Phase 1 — ContextManager : état conversationnel STRUCTURÉ (entité active,
// derniers résultats, fiche courante, filtres, écran Flutter).

const { ContextManager, normalizePageContext } = require("../src/ai/orchestrator/contextManager");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");

const USER = "user-1";
const CONV = "conv-1";

function projectsOutput(rows) {
  return JSON.stringify({ data: rows, total: rows.length });
}
const ROWS = [
  { id: "p1", nomProjet: "Tunis Nord", statut: "En cours", lastRelanceAt: null, email: "secret@x.tn" },
  { id: "p2", nomProjet: "Sfax Port", statut: "Négociation", lastRelanceAt: null },
];

describe("ContextManager — mémorisation et références", () => {
  test("capture les résultats d'un Tool de liste (sortie JSON brute) — champs compacts uniquement, jamais d'email", () => {
    const cm = new ContextManager();
    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "projects", toolSteps: [{ tool: "list_projects", input: {}, output: projectsOutput(ROWS) }] });
    const state = cm.getState(CONV, USER);
    expect(state.activeEntity).toBe("project");
    expect(state.lastResults.items.map((i) => i.id)).toEqual(["p1", "p2"]);
    expect(JSON.stringify(state)).not.toContain("secret@x.tn");
  });

  test("un Tool d'écriture ou une sortie non-JSON n'est jamais interprété comme une liste", () => {
    const cm = new ContextManager();
    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "projects", toolSteps: [{ tool: "move_project_stage", output: "{}" }, { tool: "list_projects", output: "Error: boom" }] });
    expect(cm.getState(CONV, USER).lastResults).toBeNull();
  });

  test("« ceux qui sont en cours » → ensemble précédent + filtre statut + héritage du périmètre « mine »", () => {
    const cm = new ContextManager();
    cm.recordTurn({
      conversationId: CONV,
      userId: USER,
      intentName: "projects",
      turnContext: { entityType: "project", filters: { ownership: "mine" } },
      toolSteps: [{ tool: "list_projects", output: projectsOutput(ROWS) }],
    });
    const ctx = cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: extractEntities("Quels sont ceux qui sont encore en cours ?"), intentName: "projects" });
    expect(ctx.entityType).toBe("project");
    expect(ctx.reference).toMatchObject({ kind: "set", source: "last_result" });
    expect(ctx.reference.items).toHaveLength(2);
    expect(ctx.filters).toEqual({ ownership: "mine", status: "En cours" });
  });

  test("« le deuxième » → l'élément de rang 2 ; hors limites → clarification, jamais une supposition", () => {
    const cm = new ContextManager();
    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "projects", toolSteps: [{ tool: "list_projects", output: projectsOutput(ROWS) }] });
    const second = cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: extractEntities("Et le deuxième ?"), intentName: "projects" });
    expect(second.reference).toMatchObject({ kind: "single", source: "ordinal" });
    expect(second.reference.item.id).toBe("p2");
    const tenth = cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: extractEntities("Et le dixième ?"), intentName: "projects" });
    expect(tenth.reference).toBeNull();
    expect(tenth.clarification).toMatch(/ne contient que 2/);
  });

  test("« celui-ci » : fiche courante > résultat unique > écran Flutter ; sinon clarification", () => {
    const cm = new ContextManager();
    const e = extractEntities("Donne-moi les détails de celui-ci");
    expect(cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: e, intentName: "projects" }).clarification).toMatch(/Je ne sais pas/);

    cm.setPageContext(CONV, USER, { screen: "project", entity: "project", recordId: "p9", label: "Bizerte Lac" });
    const fromPage = cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: e });
    expect(fromPage.entityType).toBe("project");
    expect(fromPage.reference).toMatchObject({ kind: "single", source: "page" });
    expect(fromPage.reference.item.id).toBe("p9");

    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "projects", selectedRecord: { entity: "project", id: "p1", name: "Tunis Nord" } });
    expect(cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: e }).reference.item.id).toBe("p1");
  });

  test("références résolues UNIQUEMENT pour les entités dont l'Agent consomme le contexte (projets en Phase 1)", () => {
    const cm = new ContextManager();
    const ctx = cm.buildTurnContext({ conversationId: CONV, userId: USER, entities: extractEntities("Ajoute une relance pour celui-ci"), intentName: "commercial_contacts" });
    expect(ctx.reference).toBeNull();
    expect(ctx.clarification).toBeNull(); // le flux existant de CommercialAgent reste maître
  });

  test("changement d'entité : l'ancienne liste ne sert plus de référence", () => {
    const cm = new ContextManager();
    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "projects", toolSteps: [{ tool: "list_projects", output: projectsOutput(ROWS) }] });
    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "maintenance", turnContext: { entityType: "maintenance_request", filters: {} } });
    const state = cm.getState(CONV, USER);
    expect(state.activeEntity).toBe("maintenance_request");
    expect(state.lastResults).toBeNull();
  });

  test("isolation : jamais l'état d'un autre utilisateur, jamais un état expiré (TTL)", () => {
    let now = 0;
    const cm = new ContextManager({ ttlMs: 1000, clock: () => now });
    cm.recordTurn({ conversationId: CONV, userId: USER, intentName: "projects", toolSteps: [{ tool: "list_projects", output: projectsOutput(ROWS) }] });
    expect(cm.getState(CONV, "intrus")).toBeNull();
    // Un tiers ne peut ni écraser ni purger l'état du propriétaire.
    cm.recordTurn({ conversationId: CONV, userId: "intrus", intentName: "maintenance" });
    cm.setPageContext(CONV, "intrus", { screen: "project", recordId: "pX" });
    const ownerState = cm.getState(CONV, USER);
    expect(ownerState.activeEntity).toBe("project");
    expect(ownerState.pageContext).toBeNull();
    now = 5000;
    expect(cm.getState(CONV, USER)).toBeNull();
  });

  test("LRU : nombre maximal de conversations borné", () => {
    const cm = new ContextManager({ maxConversations: 2 });
    for (const id of ["a", "b", "c"]) cm.recordTurn({ conversationId: id, userId: USER, intentName: "projects" });
    expect(cm.getState("a", USER)).toBeNull();
    expect(cm.getState("c", USER)).not.toBeNull();
  });

  test("normalizePageContext : défensif (entrée malformée ignorée, champs bornés, entité déduite de l'écran)", () => {
    expect(normalizePageContext(null)).toBeNull();
    expect(normalizePageContext("x")).toBeNull();
    expect(normalizePageContext({ screen: "client", recordId: 42 })).toEqual({ screen: "client", entity: "commercial_contact", recordId: "42", label: null });
    expect(normalizePageContext({ screen: "project", entity: "admin_panel" }).entity).toBe("project"); // entité inconnue jamais acceptée
  });
});
