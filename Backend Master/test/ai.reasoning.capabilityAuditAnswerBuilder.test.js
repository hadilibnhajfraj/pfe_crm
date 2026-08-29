"use strict";

const { buildCapabilityAnswer, buildIntentCapabilityAnswer } = require("../src/ai/reasoning/capabilityAuditAnswerBuilder");

function fakeCapabilities({ role, isAdminTier, moduleAccessPrefixes = null }) {
  return {
    role,
    isAdminTier,
    moduleAccessPrefixes,
    availableAgents: ["project_agent"],
    intents: [
      { intent: "projects", description: "Projets", agent: "project_agent", status: "available" },
      { intent: "commercial_contacts", description: "Contacts commerciaux", agent: "commercial_agent", requiredRoles: ["commercial", "admin"], status: "denied", reason: "agent_rbac" },
      { intent: "users", description: "Utilisateurs", agent: null, status: "generic" },
    ],
  };
}

describe("buildCapabilityAnswer — TEST OBLIGATOIRE : refus correct pour un commercial voulant voir les données d'un autre", () => {
  test("un rôle NON admin-tier reçoit explicitement la garantie 'jamais les données d'un autre utilisateur'", () => {
    const answer = buildCapabilityAnswer(fakeCapabilities({ role: "commercial", isAdminTier: false }));
    expect(answer).toMatch(/vous ne voyez jamais les données d'un autre utilisateur/i);
  });

  test("un rôle admin-tier ne reçoit PAS cette phrase (visibilité transverse réelle, déjà établie ailleurs)", () => {
    const answer = buildCapabilityAnswer(fakeCapabilities({ role: "admin", isAdminTier: true }));
    expect(answer).not.toMatch(/vous ne voyez jamais les données d'un autre utilisateur/i);
  });

  test("liste bien les intentions disponibles/refusées/génériques, sans en cacher aucune", () => {
    const answer = buildCapabilityAnswer(fakeCapabilities({ role: "commercial", isAdminTier: false }));
    expect(answer).toMatch(/projects/);
    expect(answer).toMatch(/commercial_contacts/);
    expect(answer).toMatch(/users/);
  });

  test("reflète le module HTTP restreint quand il existe (responsable_logistique_achat)", () => {
    const answer = buildCapabilityAnswer(fakeCapabilities({ role: "responsable_logistique_achat", isAdminTier: false, moduleAccessPrefixes: ["/por-promesh", "/maintenance-requests"] }));
    expect(answer).toMatch(/por-promesh/);
    expect(answer).toMatch(/maintenance-requests/);
  });

  test("indique honnêtement l'absence de restriction connue quand moduleAccessPrefixes est null", () => {
    const answer = buildCapabilityAnswer(fakeCapabilities({ role: "user", isAdminTier: false, moduleAccessPrefixes: null }));
    expect(answer).toMatch(/aucune restriction de module connue/i);
  });
});

describe("buildIntentCapabilityAnswer — réponse à 'Puis-je utiliser X ?'", () => {
  test("intention disponible : réponse affirmative, nomme l'agent réel", () => {
    const answer = buildIntentCapabilityAnswer(
      { intent: "projects", description: "Projets", agent: "project_agent", status: "available" },
      { role: "user" }
    );
    expect(answer).toMatch(/^Oui/);
    expect(answer).toMatch(/project_agent/);
  });

  test("intention refusée : réponse négative, cite les rôles réellement autorisés (jamais une raison inventée)", () => {
    const answer = buildIntentCapabilityAnswer(
      { intent: "automation", description: "Automatisation", agent: "automation_agent", requiredRoles: ["admin", "superadmin", "superadmin2"], status: "denied", reason: "agent_rbac" },
      { role: "commercial" }
    );
    expect(answer).toMatch(/^Non/);
    expect(answer).toMatch(/admin, superadmin, superadmin2/);
    expect(answer).toMatch(/commercial/);
  });

  test("aucune intention nommée (null) : ne fabrique jamais une capacité inventée", () => {
    const answer = buildIntentCapabilityAnswer(null, { role: "user" });
    expect(answer).toMatch(/ne correspond à aucune intention réelle/i);
  });
});
