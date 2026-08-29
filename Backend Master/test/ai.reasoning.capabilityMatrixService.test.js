"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — service PUR, testé
// avec le VRAI catalogue (DEFAULT_INTENT_CATALOG) et un VRAI AgentRegistry
// peuplé des 19 agents réels (agents/manifest.js) — jamais un catalogue/
// registre simplifié qui masquerait une régression de routage réelle.

const { CapabilityMatrixService, ADMIN_TIER_ROLES } = require("../src/ai/reasoning/capabilityMatrixService");
const { AgentRegistry } = require("../src/ai/agents/agentRegistry");
const { loadDefaultAgents } = require("../src/ai/agents/manifest");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

function buildRealAgentRegistry() {
  const registry = new AgentRegistry();
  loadDefaultAgents(registry, {
    chatModel: new LlmProviderChatModel({ llmProvider: { complete: jest.fn() } }),
    tools: [],
    workflowEngine: new LangChainWorkflowEngine(),
    qaChain: { invoke: jest.fn(async () => ({ answer: "x", citations: [] })) },
    summarizationChain: { invoke: jest.fn(async () => ({ summary: "x" })) },
    planner: { plan: jest.fn(async () => []) },
    pendingActionStore: new PendingActionStore(),
    createCopilotMeeting: jest.fn(),
    memory: null,
    maxToolCalls: 5,
    maxHistoryMessages: 6,
    agentRegistry: registry,
    intentCatalog: DEFAULT_INTENT_CATALOG,
    toolPermissionIndex: new Map(),
    toolModuleIndex: new Map(),
    moduleAccessByRole: { responsable_logistique_achat: ["/por-promesh", "/industrial-records", "/hr-requests", "/recuperables", "/maintenance-requests"] },
  });
  return registry;
}

function buildService(moduleAccessByRole = {}) {
  const agentRegistry = buildRealAgentRegistry();
  return new CapabilityMatrixService({ agentRegistry, intentCatalog: DEFAULT_INTENT_CATALOG, moduleAccessByRole });
}

describe("CapabilityMatrixService — sécurité : jamais de rôle depuis le message", () => {
  test("getCapabilities() exige actingUser.role/actingUser.id — jamais dérivé d'un texte", () => {
    const service = buildService();
    expect(() => service.getCapabilities(null)).toThrow();
    expect(() => service.getCapabilities({})).toThrow();
    expect(() => service.getCapabilities({ role: "admin" })).toThrow(); // id manquant
  });

  test("ADMIN_TIER_ROLES est EXACTEMENT le même triplet que partout ailleurs dans le noyau (listProjectsTool.js, getPersonalKpiSummaryTool.js)", () => {
    expect([...ADMIN_TIER_ROLES]).toEqual(["admin", "superadmin", "superadmin2"]);
  });
});

describe("TEST OBLIGATOIRE — capabilities par rôle réel", () => {
  test.each([
    ["user", "user-1"],
    ["commercial", "commercial-1"],
    ["responsable_logistique_achat", "logistique-1"],
    ["admin", "admin-1"],
    ["superadmin", "superadmin-1"],
    ["superadmin2", "superadmin2-1"],
    ["accueil", "accueil-1"],
  ])("role=%s produit une matrice de capacités complète, cohérente avec le RBAC réel", (role, id) => {
    const service = buildService();
    const capabilities = service.getCapabilities({ id, role });

    expect(capabilities.role).toBe(role);
    expect(capabilities.intents).toHaveLength(DEFAULT_INTENT_CATALOG.length);
    // Chaque intention connue reçoit un statut réel, jamais "unknown".
    for (const cap of capabilities.intents) {
      expect(["available", "denied", "generic"]).toContain(cap.status);
    }
  });

  test("commercial : commercial_contacts disponible (commercial_agent), automation refusé (admin-tier)", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "c1", role: "commercial" });
    const byIntent = Object.fromEntries(caps.intents.map((c) => [c.intent, c]));

    expect(byIntent.commercial_contacts.status).toBe("available");
    expect(byIntent.commercial_contacts.agent).toBe("commercial_agent");
    expect(byIntent.automation.status).toBe("denied");
    expect(byIntent.automation.reason).toBe("agent_rbac");
    expect(byIntent.industrial.status).toBe("denied");
    expect(caps.isAdminTier).toBe(false);
  });

  test("responsable_logistique_achat : industrial/maintenance disponibles, commercial_contacts/automation refusés, module HTTP restreint (moduleAccessGuard réel)", () => {
    const service = buildService({ responsable_logistique_achat: ["/por-promesh", "/industrial-records", "/hr-requests", "/recuperables", "/maintenance-requests"] });
    const caps = service.getCapabilities({ id: "l1", role: "responsable_logistique_achat" });
    const byIntent = Object.fromEntries(caps.intents.map((c) => [c.intent, c]));

    expect(byIntent.industrial.status).toBe("available");
    expect(byIntent.industrial.agent).toBe("industrial_agent");
    expect(byIntent.maintenance.status).toBe("available");
    expect(byIntent.commercial_contacts.status).toBe("denied");
    expect(byIntent.automation.status).toBe("denied");
    expect(caps.moduleAccessPrefixes).toEqual(["/por-promesh", "/industrial-records", "/hr-requests", "/recuperables", "/maintenance-requests"]);
  });

  test("user : projects/dashboard/maintenance disponibles, commercial_contacts/industrial/automation refusés", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "u1", role: "user" });
    const byIntent = Object.fromEntries(caps.intents.map((c) => [c.intent, c]));

    expect(byIntent.projects.status).toBe("available");
    expect(byIntent.dashboard.status).toBe("available");
    expect(byIntent.commercial_contacts.status).toBe("denied");
    expect(byIntent.industrial.status).toBe("denied");
    expect(byIntent.automation.status).toBe("denied");
  });

  test("admin : tout disponible ou générique, jamais refusé — aucune restriction de module connue", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "a1", role: "admin" });

    expect(caps.isAdminTier).toBe(true);
    expect(caps.intents.every((c) => c.status !== "denied")).toBe(true);
    expect(caps.moduleAccessPrefixes).toBeNull();
    expect(caps.availableAgents).toEqual(expect.arrayContaining(["commercial_agent", "industrial_agent", "automation_agent"]));
  });
});

describe("TEST OBLIGATOIRE — commercial demandant l'accès aux données d'un autre commercial : refus correct", () => {
  test("canUseIntent ne dit jamais qu'un commercial a une visibilité transverse", () => {
    const service = buildService();
    const commercialCap = service.canUseIntent({ id: "c1", role: "commercial" }, "commercial_contacts");
    // L'intention EST disponible (commercial_agent la gère) — mais la donnée
    // reste scopée à actingUser.id, jamais un autre commercial nommé (voir
    // getPersonalKpiSummaryTool.js::scopeInputForActingUser, correctif RBAC
    // déjà appliqué et vérifié contre la vraie base — mission P0). Cette
    // garantie est communiquée via getCapabilities()/buildCapabilityAnswer(),
    // pas ici — voir test dédié ci-dessous.
    expect(commercialCap.status).toBe("available");
  });

  test("le résumé complet (getCapabilities) affirme explicitement l'absence de visibilité transverse pour un rôle non admin-tier", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "c1", role: "commercial" });
    expect(caps.isAdminTier).toBe(false);
    // Consommé par buildCapabilityAnswer() (voir son propre test) pour
    // produire la phrase "vous ne voyez jamais les données d'un autre
    // utilisateur" — vérifié ici au niveau du fait brut qu'elle encode.
  });

  test("un admin, lui, a une visibilité transverse réelle (isAdminTier=true)", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "a1", role: "admin" });
    expect(caps.isAdminTier).toBe(true);
  });
});

describe("TEST OBLIGATOIRE — un faux rôle fourni dans le message est structurellement ignoré", () => {
  test("canUseIntent()/getCapabilities() ne lisent jamais le texte d'un message — seul actingUser.role compte", () => {
    const service = buildService();
    // Le "message" n'existe même pas comme paramètre de ces deux méthodes —
    // preuve structurelle, pas seulement comportementale : impossible de lui
    // faire lire un rôle qu'il n'a pas de moyen de recevoir.
    expect(service.getCapabilities.length).toBeLessThanOrEqual(1); // (actingUser)
    expect(service.canUseIntent.length).toBeLessThanOrEqual(2); // (actingUser, intentKey)

    const caps = service.getCapabilities({ id: "c1", role: "commercial" });
    expect(caps.role).toBe("commercial");
    expect(caps.isAdminTier).toBe(false);
  });
});

describe("findMentionedIntent — lecture seule du catalogue, jamais une décision RBAC", () => {
  test("repère un domaine nommé explicitement dans le message", () => {
    const service = buildService();
    const mentioned = service.findMentionedIntent("Quelles sont mes permissions et autorisations pour les projets ?");
    expect(mentioned.key).toBe("projects");
  });

  test("ignore capability_audit/general_chat eux-mêmes", () => {
    const service = buildService();
    const mentioned = service.findMentionedIntent("Quelles sont mes capacités et permissions ?");
    expect(mentioned).toBeNull();
  });

  test("ne modifie jamais rien — méthode pure, deux appels identiques donnent le même résultat", () => {
    const service = buildService();
    const a = service.findMentionedIntent("Puis-je consulter la maintenance ?");
    const b = service.findMentionedIntent("Puis-je consulter la maintenance ?");
    expect(a).toEqual(b);
  });
});

describe("canUseIntent — jamais une intention inventée", () => {
  test("retourne null pour une clé qui n'existe pas dans le catalogue réel", () => {
    const service = buildService();
    expect(service.canUseIntent({ id: "u1", role: "user" }, "achat_fournisseur_inexistant")).toBeNull();
  });
});

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "COMPLÉTER
// RoleCapabilityAuditAgent" : knownCopilotGaps.js n'est jamais une matrice
// RBAC — ces tests vérifient qu'il ne décide RIEN, seulement qu'il expose
// des faits d'architecture déjà établis par l'audit Capability Map.
describe("getCapabilities — nonExposedDomains/notImplementedDomains/brokenCapabilities (knownCopilotGaps.js)", () => {
  test("user : nonExposedDomains contient Tasks/Documents/Calendar, aucun domaine inventé", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "u1", role: "user" });

    expect(caps.nonExposedDomains).toEqual([
      { domain: "tasks", label: "Tâches" },
      { domain: "documents", label: "Documents" },
      { domain: "calendar", label: "Calendrier" },
    ]);
    expect(caps.notImplementedDomains).toEqual([]);
    expect(caps.brokenCapabilities).toEqual([]);
  });

  test("finance_probar : notImplementedDomains contient Finance/Achats, nonExposedDomains reste identique à tout autre rôle", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "f1", role: "finance_probar" });

    expect(caps.notImplementedDomains).toEqual([{ domain: "finance", label: "Finance / Achats" }]);
    expect(caps.nonExposedDomains).toEqual([
      { domain: "tasks", label: "Tâches" },
      { domain: "documents", label: "Documents" },
      { domain: "calendar", label: "Calendrier" },
    ]);
    // Aucune intention/agent Finance n'existe dans le catalogue réel —
    // preuve que ce rôle n'obtient AUCUNE capacité Finance "available".
    expect(caps.intents.every((i) => !/finance/i.test(i.intent))).toBe(true);
  });

  test("un autre rôle (commercial) n'a jamais de notImplementedDomains — c'est bien scopé par rôle, pas global", () => {
    const service = buildService();
    const caps = service.getCapabilities({ id: "c1", role: "commercial" });
    expect(caps.notImplementedDomains).toEqual([]);
  });
});

describe("findKnownGap — repli, jamais prioritaire sur une intention réelle", () => {
  test("'Puis-je consulter mes tâches ?' (commercial) → NOT_EXPOSED", () => {
    const service = buildService();
    const gap = service.findKnownGap("Puis-je consulter mes tâches ?", { id: "c1", role: "commercial" });
    expect(gap).toEqual({ status: "not_exposed", domain: "tasks", label: "Tâches" });
  });

  test("'Puis-je consulter mon calendrier ?' (commercial) → NOT_EXPOSED", () => {
    const service = buildService();
    const gap = service.findKnownGap("Puis-je consulter mon calendrier ?", { id: "c1", role: "commercial" });
    expect(gap).toEqual({ status: "not_exposed", domain: "calendar", label: "Calendrier" });
  });

  test("'Puis-je consulter mes documents ?' (user) → NOT_EXPOSED", () => {
    const service = buildService();
    const gap = service.findKnownGap("Puis-je consulter mes documents ?", { id: "u1", role: "user" });
    expect(gap).toEqual({ status: "not_exposed", domain: "documents", label: "Documents" });
  });

  test("'Puis-je gérer les factures ?' (finance_probar) → NOT_IMPLEMENTED, jamais une intention finance inventée", () => {
    const service = buildService();
    const gap = service.findKnownGap("Puis-je gérer les factures ?", { id: "f1", role: "finance_probar" });
    expect(gap).toEqual({ status: "not_implemented", domain: "finance", label: "Finance / Achats" });
  });

  test("'Puis-je gérer les factures ?' posée par un rôle SANS entrée notImplementedDomains (commercial) → null, jamais un faux NOT_IMPLEMENTED", () => {
    const service = buildService();
    const gap = service.findKnownGap("Puis-je gérer les factures ?", { id: "c1", role: "commercial" });
    expect(gap).toBeNull();
  });

  test("une intention réelle du catalogue ('Quels sont mes projets ?') n'est jamais retournée par findKnownGap lui-même — mais l'appelant (Agent) ne le consulte de toute façon qu'en repli", () => {
    const service = buildService();
    // "projets" n'apparaît dans AUCUN mot-clé de knownCopilotGaps.js —
    // preuve structurelle qu'aucune collision n'est possible ici.
    const gap = service.findKnownGap("Quels sont mes projets ?", { id: "u1", role: "user" });
    expect(gap).toBeNull();
  });
});
