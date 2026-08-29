"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "EXPOSER LA
// LISTE DES CONTACTS À RELANCER AU COPILOT". Tests unitaires (Tool mocké) —
// voir test/ai.orchestrator.commercialAgent.relanceQuery.integration.test.js
// pour la preuve réelle (VRAI compte info@probardistribution.com).

const dayjs = require("dayjs");
const { createCommercialAgent, RELANCE_MARKERS } = require("../src/ai/agents/commercialAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const COMMERCIAL = { id: "u-commercial", role: "commercial" };
const ADMIN = { id: "u-admin", role: "admin" };
const USER = { id: "u-user", role: "user" };

// "21/08" (mission P1.4) résout toujours vers sa PROCHAINE occurrence future
// (voir meetingSlotExtractor.js::resolveYearForDayMonth, réutilisée par
// commercialActionSlotExtractor.js) — jamais une année codée en dur ici,
// pour ne pas casser ce test au fil du temps une fois le 21 août dépassé.
function nextOccurrence(day, month) {
  const now = dayjs();
  let candidate = dayjs(`${now.year()}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
  if (candidate.isBefore(now, "day")) candidate = candidate.add(1, "year");
  return candidate.format("YYYY-MM-DD");
}
const AUG_21 = nextOccurrence(21, 8);

function listTool(payload) {
  return {
    name: "get_my_commercial_contacts",
    description: "d",
    invoke: jest.fn(async () => JSON.stringify(payload)),
  };
}

function contact(overrides = {}) {
  return {
    id: "c-1",
    nom: "Ben Salah",
    prenom: "Amine",
    nomSociete: "Probar Distribution",
    telephone: "+21620000000",
    statut: "rappeler_plus_tard",
    dateAppel: "2026-07-01T10:00:00.000Z",
    ...overrides,
  };
}

function payload(overrides = {}) {
  return {
    contacts: [contact(), contact({ id: "c-2", nom: "Trabelsi", prenom: "Sana", nomSociete: "STE Trabelsi" })],
    total: 73,
    ...overrides,
  };
}

function chatModelNeverCalled() {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => { throw new Error("LLM ne devrait jamais être sollicité — chemin déterministe"); }) } });
}

// Même helpers que test/ai.agents.projectAgent.test.js (mêmes noms, même
// comportement) — `chatModelReturning` renvoie toujours la MÊME décision
// (insuffisant pour scripter "appelle un outil PUIS réponds") ;
// `chatModelSequence` scripte un tour différent par appel, dans l'ordre.
function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

function chatModelSequence(...decisions) {
  const complete = jest.fn();
  decisions.forEach((decision) => complete.mockResolvedValueOnce(JSON.stringify(decision)));
  return new LlmProviderChatModel({ llmProvider: { complete } });
}

function buildAgent(tool, { pendingActionStore = new PendingActionStore() } = {}) {
  return createCommercialAgent({ chatModel: chatModelNeverCalled(), tools: [tool], workflowEngine: new LangChainWorkflowEngine(), pendingActionStore });
}

function buildAgentWithTools(tools, { pendingActionStore = new PendingActionStore() } = {}) {
  return createCommercialAgent({ chatModel: chatModelNeverCalled(), tools, workflowEngine: new LangChainWorkflowEngine(), pendingActionStore });
}

// ── Fixtures pour le flux ACTION (mission "CORRIGER LES ACTIONS
// COMMERCIALES DEPUIS LA LISTE DES CONTACTS") ──────────────────────────
function searchTool(payloadForSearch) {
  return {
    name: "get_my_commercial_contacts",
    description: "d",
    invoke: jest.fn(async () => JSON.stringify(payloadForSearch)),
  };
}

function candidatesTool(candidates) {
  return {
    name: "list_commercial_candidates",
    description: "d",
    invoke: jest.fn(async () => JSON.stringify(candidates)),
  };
}

function scheduleTool(result) {
  return {
    name: "schedule_commercial_contact_relance",
    description: "d",
    invoke: jest.fn(async () => JSON.stringify(result)),
  };
}

const AWLED_CONTACT = { id: "contact-1", nom: "awled el HAJ", prenom: "Pépinière", nomSociete: null, telephone: "97 636 961", statut: "rappeler_plus_tard" };
const HADIL_CANDIDATE = { id: "user-hadil", fullName: "Hadil Ibn Haj Fraj", email: "hadil.ibnhajfraj@gmail.com", role: "user" };

describe("TEST OBLIGATOIRE — 8 formulations de la mission, réponse déterministe honnête", () => {
  test.each([
    "Quels clients dois-je relancer cette semaine ?",
    "Quels clients dois-je relancer ?",
    "Qui dois-je relancer ?",
    "Quels sont mes clients en retard de relance ?",
    "Quels contacts nécessitent une relance ?",
    "Montre-moi mes relances prioritaires",
    "Quels prospects dois-je relancer ?",
    "Quels clients sont à rappeler ?",
  ])("%s -> liste réelle de contacts, jamais le RAG documentaire", async (message) => {
    const tool = listTool(payload());
    const agent = buildAgent(tool);

    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message, user: COMMERCIAL, conversationId: null });

    expect(result.answer).toContain("73");
    expect(result.answer).toContain("Ben Salah");
    expect(result.answer).not.toMatch(/documentation/i);
    expect(result.toolSteps).toHaveLength(1);
    expect(result.toolSteps[0].tool).toBe("get_my_commercial_contacts");
    // Jamais de commercialName/ownerId/userId — seuls status/limit sont envoyés.
    expect(tool.invoke).toHaveBeenCalledWith({ status: "rappeler_plus_tard", limit: 20 });
  });
});

describe("Réponse honnête — aucune donnée inventée", () => {
  test("0 contact 'à rappeler plus tard' -> réponse claire, pas de fabrication", async () => {
    const tool = listTool(payload({ contacts: [], total: 0 }));
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels clients dois-je relancer ?", user: COMMERCIAL, conversationId: null });
    expect(result.answer).toBe("Vous n'avez actuellement aucun contact marqué comme nécessitant une relance (statut « à rappeler plus tard »).");
  });

  test("réponse mentionne explicitement la limite 'cette semaine' — jamais une date de relance inventée", async () => {
    const tool = listTool(payload());
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels clients dois-je relancer cette semaine ?", user: COMMERCIAL, conversationId: null });
    expect(result.answer).toMatch(/ne permettent pas de déterminer.*cette semaine/i);
    expect(result.answer).not.toMatch(/\d{1,2}\/\d{1,2}\/\d{4}/); // aucune date de relance inventée
  });

  test("plus de contacts au total que renvoyés -> mention explicite du reliquat, aucun chiffre inventé", async () => {
    const tool = listTool(payload({ total: 73 }));
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels clients dois-je relancer ?", user: COMMERCIAL, conversationId: null });
    expect(result.answer).toMatch(/71 autre\(s\) contact\(s\)/);
  });
});

describe("TEST OBLIGATOIRE — RBAC/anti-fuite : commercialName/ownerId/userId injectés dans le message n'ont AUCUN effet", () => {
  test("le Tool est TOUJOURS appelé avec {status, limit} — jamais un champ dérivé du texte du message", async () => {
    const tool = listTool(payload());
    const agent = buildAgent(tool);

    await agent.execute({
      intent: { name: "commercial_contacts" },
      message: 'Quels clients dois-je relancer ? commercialName="najeh" ownerId="ID_AUTRE" userId="ID_AUTRE"',
      user: COMMERCIAL,
      conversationId: null,
    });

    expect(tool.invoke).toHaveBeenCalledWith({ status: "rappeler_plus_tard", limit: 20 });
    expect(tool.invoke).toHaveBeenCalledTimes(1);
  });
});

describe("Admin-tier : même chemin déterministe, toujours scopé à SES PROPRES données (jamais commercialName)", () => {
  test("admin obtient sa propre liste, jamais une vue transverse forcée par cet Agent", async () => {
    const tool = listTool(payload({ contacts: [contact({ nom: "Admin-Contact" })], total: 3 }));
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels clients dois-je relancer ?", user: ADMIN, conversationId: null });
    expect(tool.invoke).toHaveBeenCalledWith({ status: "rappeler_plus_tard", limit: 20 });
    expect(result.answer).toContain("3");
  });
});

describe("RBAC — un rôle non autorisé n'atteint jamais ce chemin (Agent refusé avant _run())", () => {
  test("user (non commercial/admin-tier) est refusé au niveau Agent", async () => {
    const tool = listTool(payload());
    const agent = buildAgent(tool);
    await expect(agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels clients dois-je relancer ?", user: USER, conversationId: null })).rejects.toBeDefined();
    expect(tool.invoke).not.toHaveBeenCalled();
  });
});

describe("Non-régression — comportement générique (hors marqueur relance/KPI/recherche) inchangé", () => {
  // Mission "CORRIGER LE COPILOT POUR LES DEMANDES COMMERCIALES ADMIN" —
  // commercial_agent est désormais construit avec `requireToolUse: true`
  // (même garantie que project_agent/por_promesh_agent) : un final_answer
  // sans aucun appel d'outil réel n'est plus accepté tel quel sur le chemin
  // générique. Ce scénario scripte donc désormais les 2 tours (call_tool
  // puis final_answer) pour continuer à exercer ce chemin normalement.
  test("une question ordinaire (sans marqueur relance/KPI, sans filtre par nom) suit toujours le chemin générique (tool-calling LLM)", async () => {
    const tool = listTool(payload());
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "get_my_commercial_contacts", input: { status: "ok" } },
      { action: "final_answer", answer: "Voici vos KPI." }
    );
    const agent = createCommercialAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: new PendingActionStore() });

    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels sont mes KPI commerciaux ?", user: COMMERCIAL, conversationId: null });

    expect(result.answer).toBe("Voici vos KPI.");
    expect(tool.invoke).toHaveBeenCalledWith({ status: "ok" });
  });
});

describe("CommercialAgent — requireToolUse : le LLM n'est jamais la source de vérité (bug qwen3:8b/Ollama)", () => {
  // Reproduit en direct (mission "CORRIGER LE COPILOT POUR LES DEMANDES
  // COMMERCIALES ADMIN") : pour "Combien ai-je de contacts ?", le modèle a
  // une fois répondu "12" sans jamais appeler aucun Tool — un chiffre
  // entièrement fabriqué. Message reformulé ici pour ne pas être intercepté
  // par le chemin déterministe _runKpiQuery() (qui gère déjà "combien" —
  // voir test/ai.agents.commercialAgent.adminQueries.test.js) : ce test
  // vérifie spécifiquement la garde requireToolUse sur ce qui reste du
  // chemin générique.
  test("un final_answer qui arrive SANS aucun appel d'outil réel est rejeté et remplacé par une réponse honnête", async () => {
    const tool = listTool(payload());
    const chatModel = chatModelReturning({ action: "final_answer", answer: "Vous avez 12 contacts commerciaux." });
    const agent = createCommercialAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: new PendingActionStore() });

    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels sont mes KPI commerciaux ?", user: COMMERCIAL, conversationId: null });

    expect(result.answer).toBe("Je n'ai pas pu récupérer les données CRM nécessaires pour répondre à cette question.");
    expect(result.answer).not.toContain("12");
    expect(tool.invoke).not.toHaveBeenCalled();
  });

  test("un final_answer qui arrive APRÈS un vrai appel d'outil est accepté normalement — la garde ne bloque jamais une réponse réellement fondée", async () => {
    const tool = listTool(payload({ total: 3 }));
    const chatModel = chatModelSequence(
      { action: "call_tool", tool: "get_my_commercial_contacts", input: {} },
      { action: "final_answer", answer: "Vous avez 3 contacts." }
    );
    const agent = createCommercialAgent({ chatModel, tools: [tool], workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: new PendingActionStore() });

    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels sont mes KPI commerciaux ?", user: COMMERCIAL, conversationId: null });

    expect(result.answer).toBe("Vous avez 3 contacts.");
  });
});

describe("RELANCE_MARKERS — garanties structurelles", () => {
  test("contient exactement les 4 marqueurs vérifiés sans collision", () => {
    expect([...RELANCE_MARKERS].sort()).toEqual(["rappeler", "relance", "relancer", "relances"].sort());
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MISSION P1.4 — CORRIGER LES ACTIONS COMMERCIALES DEPUIS LA LISTE DES
// CONTACTS. Tests unitaires (Tools mockés) — voir
// test/ai.orchestrator.commercialAgent.relanceAction.integration.test.js
// pour la preuve réelle (VRAI compte info@probardistribution.com, VRAI
// contact "Pépinière awled el HAJ").
// ═══════════════════════════════════════════════════════════════════════

describe("PHASE 10 — TESTS OBLIGATOIRES : détection ACTION vs READ", () => {
  test("1. « relancer le contact Pépinière awled el HAJ pour 21/08 » -> PROPOSE (sans commercial)", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c1" });
    expect(result.pendingAction).toBeTruthy();
    expect(result.pendingAction.steps[0].input.contactId).toBe("contact-1");
    expect(result.pendingAction.steps[0].input.commercialId).toBeUndefined(); // absent, jamais null : voir _pendingActionView
    expect(result.pendingAction.steps[0].input.dateRelance).toBe(AUG_21);
    expect(result.answer).toMatch(/confirmez-vous/i);
    expect(search.invoke).toHaveBeenCalledWith({ search: "Pépinière awled el HAJ", limit: 20 });
  });

  test("2. « affecter Pépinière awled el HAJ à hadil.ibnhajfraj@gmail.com » (sans date) -> réponse honnête, PAS de PendingAction", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const candidates = candidatesTool([HADIL_CANDIDATE]);
    const agent = buildAgentWithTools([search, candidates]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "affecter Pépinière awled el HAJ à hadil.ibnhajfraj@gmail.com", user: COMMERCIAL, conversationId: "c2" });
    expect(result.pendingAction).toBeFalsy();
    expect(result.answer).toMatch(/date/i);
  });

  test("3. « relancer X pour 21/08 et affecter le commercial hadil.ibnhajfraj@gmail.com » -> PROPOSE (contact + commercial + date)", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const candidates = candidatesTool([HADIL_CANDIDATE]);
    const agent = buildAgentWithTools([search, candidates]);
    const result = await agent.execute({
      intent: { name: "commercial_contacts" },
      message: "relancer Pépinière awled el HAJ pour 21/08 et affecter le commercial hadil.ibnhajfraj@gmail.com",
      user: COMMERCIAL,
      conversationId: "c3",
    });
    expect(result.pendingAction).toBeTruthy();
    expect(result.pendingAction.steps[0].input.contactId).toBe("contact-1");
    expect(result.pendingAction.steps[0].input.commercialId).toBe("user-hadil");
    expect(result.pendingAction.steps[0].input.dateRelance).toBe(AUG_21);
    expect(result.answer).toContain("hadil.ibnhajfraj@gmail.com");
  });

  test("4. « programme une relance demain pour Pépinière awled el HAJ » -> PROPOSE (date = demain, sans commercial)", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "programme une relance demain pour Pépinière awled el HAJ", user: COMMERCIAL, conversationId: "c4" });
    expect(result.pendingAction).toBeTruthy();
    expect(result.pendingAction.steps[0].input.dateRelance).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(result.pendingAction.steps[0].input.commercialId).toBeUndefined();
  });

  test("5. « change le commercial responsable de Pépinière awled el HAJ » (sans date, sans commercial cible) -> réponse honnête, PAS de PendingAction", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "change le commercial responsable de Pépinière awled el HAJ", user: COMMERCIAL, conversationId: "c5" });
    expect(result.pendingAction).toBeFalsy();
    expect(result.answer).toMatch(/date/i);
  });

  test("6. « Quels clients dois-je relancer ? » -> continue de fonctionner comme avant (READ, jamais une PROPOSE)", async () => {
    const tool = listTool(payload());
    const agent = buildAgent(tool);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "Quels clients dois-je relancer ?", user: COMMERCIAL, conversationId: "c6" });
    expect(result.pendingAction).toBeFalsy();
    expect(result.answer).toContain("73");
  });

  test("Contact introuvable -> réponse honnête, jamais un id inventé", async () => {
    const search = searchTool({ contacts: [], total: 0 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Fournisseur Inconnu XYZ pour 21/08", user: COMMERCIAL, conversationId: "c7" });
    expect(result.pendingAction).toBeFalsy();
    expect(result.answer).toMatch(/aucun contact/i);
  });

  test("Contact ambigu (plusieurs correspondances) -> demande de clarification, jamais un choix arbitraire", async () => {
    const search = searchTool({
      contacts: [
        { id: "c-a", nom: "Pépinière", prenom: "Nord", telephone: "111" },
        { id: "c-b", nom: "Pépinière", prenom: "Sud", telephone: "222" },
      ],
      total: 2,
    });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière pour 21/08", user: COMMERCIAL, conversationId: "c8" });
    expect(result.pendingAction).toBeFalsy();
    expect(result.answer).toMatch(/plusieurs contacts/i);
  });

  test("Commercial introuvable/non éligible -> réponse honnête, l'action n'est jamais proposée", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const candidates = candidatesTool([]); // aucun candidat éligible
    const agent = buildAgentWithTools([search, candidates]);
    const result = await agent.execute({
      intent: { name: "commercial_contacts" },
      message: "relancer Pépinière awled el HAJ pour 21/08 et affecter le commercial inconnu@example.com",
      user: COMMERCIAL,
      conversationId: "c9",
    });
    expect(result.pendingAction).toBeFalsy();
    expect(result.answer).toMatch(/aucun commercial/i);
  });
});

describe("PHASE 11 — TEST CONFIRMATION", () => {
  test("message initial -> PendingAction créé ; « oui » -> exécutée UNE SEULE FOIS ; « oui » à nouveau -> aucune deuxième écriture", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: { id: "relance-1", commercialContactId: "contact-1", dateRelance: AUG_21, commercialId: null, commercialName: null, commercialEmail: null }, contact: { id: "contact-1", nom: "awled el HAJ", prenom: "Pépinière" } });
    const store = new PendingActionStore();
    const agent = buildAgentWithTools([search, schedule], { pendingActionStore: store });

    const proposed = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "conv-confirm" });
    expect(proposed.pendingAction).toBeTruthy();

    const confirmed = await agent.execute({ intent: { name: "commercial_contacts" }, message: "oui", user: COMMERCIAL, conversationId: "conv-confirm" });
    expect(confirmed.answer).toMatch(/effectuée avec succès/i);
    expect(schedule.invoke).toHaveBeenCalledTimes(1);
    expect(schedule.invoke).toHaveBeenCalledWith({ contactId: "contact-1", dateRelance: AUG_21 });

    const secondConfirm = await agent.execute({ intent: { name: "commercial_contacts" }, message: "oui", user: COMMERCIAL, conversationId: "conv-confirm" });
    expect(schedule.invoke).toHaveBeenCalledTimes(1); // toujours 1 — pas de deuxième écriture
    expect(secondConfirm.answer).toMatch(/aucune action en attente/i);
  });

  test("« non » -> action annulée, jamais exécutée", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: {}, contact: {} });
    const agent = buildAgentWithTools([search, schedule]);

    await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "conv-cancel" });
    const cancelled = await agent.execute({ intent: { name: "commercial_contacts" }, message: "non", user: COMMERCIAL, conversationId: "conv-cancel" });

    expect(cancelled.answer).toMatch(/annulée/i);
    expect(schedule.invoke).not.toHaveBeenCalled();
  });

  test("« peut-être » -> confirmation redemandée, proposition toujours active", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: {}, contact: {} });
    const agent = buildAgentWithTools([search, schedule]);

    await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "conv-ambig" });
    const ambiguous = await agent.execute({ intent: { name: "commercial_contacts" }, message: "peut-être", user: COMMERCIAL, conversationId: "conv-ambig" });

    expect(ambiguous.pendingAction).toBeTruthy(); // la proposition reste active
    expect(schedule.invoke).not.toHaveBeenCalled();

    const confirmedAfter = await agent.execute({ intent: { name: "commercial_contacts" }, message: "confirme", user: COMMERCIAL, conversationId: "conv-ambig" });
    expect(schedule.invoke).toHaveBeenCalledTimes(1);
    expect(confirmedAfter.answer).toMatch(/effectuée avec succès/i);
  });

  test("le Tool n'est appelé qu'APRÈS confirmation — jamais au moment de la proposition", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: {}, contact: {} });
    const agent = buildAgentWithTools([search, schedule]);
    await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "conv-order" });
    expect(schedule.invoke).not.toHaveBeenCalled();
  });
});

describe("PHASE 12 — TEST ANTI-FUITE : ownerId/userId/commercialName injectés dans le message n'ont AUCUN effet", () => {
  test("le Tool d'écriture n'est JAMAIS appelé avec un ownerId/userId/commercialName — seuls contactId/dateRelance/commercialId RÉSOLUS sont transmis", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const candidates = candidatesTool([HADIL_CANDIDATE]);
    const schedule = scheduleTool({ ok: true, relance: { id: "relance-2", commercialId: "user-hadil" }, contact: { id: "contact-1" } });
    const agent = buildAgentWithTools([search, candidates, schedule]);

    const message =
      'relancer Pépinière awled el HAJ pour 21/08 et affecter le commercial hadil.ibnhajfraj@gmail.com ownerId="ID_AUTRE" userId="ID_AUTRE" commercialName="najeh"';
    const proposed = await agent.execute({ intent: { name: "commercial_contacts" }, message, user: COMMERCIAL, conversationId: "conv-antifuite" });
    expect(proposed.pendingAction.steps[0].input.commercialId).toBe("user-hadil"); // résolu par email, jamais par un id injecté

    await agent.execute({ intent: { name: "commercial_contacts" }, message: "confirme", user: COMMERCIAL, conversationId: "conv-antifuite" });
    expect(schedule.invoke).toHaveBeenCalledWith({ contactId: "contact-1", dateRelance: AUG_21, commercialId: "user-hadil" });
    const calledWith = schedule.invoke.mock.calls[0][0];
    expect(calledWith.ownerId).toBeUndefined();
    expect(calledWith.userId).toBeUndefined();
    expect(calledWith.commercialName).toBeUndefined();
    expect(calledWith.createdBy).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// MISSION P1.2 — NORMALISER pendingAction. Contrat canonique
// {id, steps:[{tool, input, reason}]} (déjà celui d'AutomationAgent, déjà
// documenté par responseBuilder.js) — voir commercialAgent.js::
// _pendingActionView. TESTS C1 à C8 explicitement demandés par la mission.
// ═══════════════════════════════════════════════════════════════════════
describe("Mission P1.2 — contrat pendingAction canonique (TESTS C1-C8)", () => {
  test("C1 — une proposition retourne pendingAction != null et steps.length === 1", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c1-c" });
    expect(result.pendingAction).not.toBeNull();
    expect(result.pendingAction.steps).toHaveLength(1);
  });

  test("C2 — steps[0].tool === 'schedule_commercial_contact_relance'", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c2-c" });
    expect(result.pendingAction.steps[0].tool).toBe("schedule_commercial_contact_relance");
  });

  test("C3 — steps[0].input contient contactId/dateRelance/commercialId (quand résolu)", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const candidates = candidatesTool([HADIL_CANDIDATE]);
    const agent = buildAgentWithTools([search, candidates]);
    const result = await agent.execute({
      intent: { name: "commercial_contacts" },
      message: "relancer Pépinière awled el HAJ pour 21/08 et affecter le commercial hadil.ibnhajfraj@gmail.com",
      user: COMMERCIAL,
      conversationId: "c3-c",
    });
    const { input } = result.pendingAction.steps[0];
    expect(input.contactId).toBe("contact-1");
    expect(input.dateRelance).toBe(AUG_21);
    expect(input.commercialId).toBe("user-hadil");
  });

  test("C4 — steps[0].reason est une chaîne non vide", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const agent = buildAgentWithTools([search]);
    const result = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c4-c" });
    expect(typeof result.pendingAction.steps[0].reason).toBe("string");
    expect(result.pendingAction.steps[0].reason.length).toBeGreaterThan(0);
  });

  test("C5/C6 — 'oui' exécute une seule fois ; un deuxième 'oui' n'exécute jamais une deuxième fois", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: { id: "relance-c5" }, contact: { id: "contact-1" } });
    const agent = buildAgentWithTools([search, schedule]);

    await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c5-c" });
    await agent.execute({ intent: { name: "commercial_contacts" }, message: "oui", user: COMMERCIAL, conversationId: "c5-c" });
    expect(schedule.invoke).toHaveBeenCalledTimes(1); // C5

    await agent.execute({ intent: { name: "commercial_contacts" }, message: "oui", user: COMMERCIAL, conversationId: "c5-c" });
    expect(schedule.invoke).toHaveBeenCalledTimes(1); // C6 — toujours 1, aucune deuxième exécution
  });

  test("C7 — 'non' n'exécute jamais l'action", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: {}, contact: {} });
    const agent = buildAgentWithTools([search, schedule]);

    await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c7-c" });
    await agent.execute({ intent: { name: "commercial_contacts" }, message: "non", user: COMMERCIAL, conversationId: "c7-c" });
    expect(schedule.invoke).not.toHaveBeenCalled();
  });

  test("C8 — modifier artificiellement pendingAction.steps (comme le ferait un client compromis/buggé) n'a AUCUN effet sur l'exécution : le serveur relit exclusivement action.payload stocké, jamais un pendingAction reçu du client", async () => {
    const search = searchTool({ contacts: [AWLED_CONTACT], total: 1 });
    const schedule = scheduleTool({ ok: true, relance: { id: "relance-c8" }, contact: { id: "contact-1" } });
    const agent = buildAgentWithTools([search, schedule]);

    const proposed = await agent.execute({ intent: { name: "commercial_contacts" }, message: "relancer le contact Pépinière awled el HAJ pour 21/08", user: COMMERCIAL, conversationId: "c8-c" });

    // Un client malveillant/buggé falsifie la copie qu'il a reçue...
    const tampered = JSON.parse(JSON.stringify(proposed.pendingAction));
    tampered.steps[0].input.contactId = "AUTRE-CONTACT-INJECTE";
    tampered.steps[0].input.dateRelance = "2099-01-01";

    // ...et la renvoie explicitement au tour suivant : `execute()` ne
    // déclare même pas de paramètre `pendingAction` (voir sa signature,
    // baseAgent.js::execute({intent, message, user, conversationId})) — le
    // transmettre n'a donc structurellement aucun effet, prouvé ici en
    // vérifiant que le Tool réel reçoit bien le contactId/dateRelance
    // D'ORIGINE (stockés côté serveur), jamais la valeur falsifiée.
    await agent.execute({ intent: { name: "commercial_contacts" }, message: "oui", user: COMMERCIAL, conversationId: "c8-c", pendingAction: tampered });

    expect(schedule.invoke).toHaveBeenCalledWith({ contactId: "contact-1", dateRelance: AUG_21 });
    const calledWith = schedule.invoke.mock.calls[0][0];
    expect(calledWith.contactId).not.toBe("AUTRE-CONTACT-INJECTE");
    expect(calledWith.dateRelance).not.toBe("2099-01-01");
  });
});
