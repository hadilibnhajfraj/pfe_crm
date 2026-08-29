"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES 3 PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT", problème 3. VRAI
// IntentDetector + VRAI catalogue.

const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");

const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });

async function intentOf(message) {
  return (await detector.detect(message)).name;
}

describe("projectOwnershipOverride — exemples POSITIFS de la mission -> projects", () => {
  test.each([
    "Donne-moi les projets associés à un autre utilisateur",
    "Donne-moi les projets associés à Hadil",
    "Quels projets appartiennent à Hadil ?",
    "Quels sont les projets de Hadil ?",
    "Montre-moi les projets d'un utilisateur",
    "Quels projets sont associés à cet utilisateur ?",
  ])("%s -> projects", async (message) => {
    expect(await intentOf(message)).toBe("projects");
  });
});

describe("projectOwnershipOverride — exemples NÉGATIFS de la mission -> users (inchangé)", () => {
  test.each([
    "Donne-moi les informations sur cet utilisateur",
    "Quel est le profil de Hadil ?",
    "Liste les utilisateurs",
  ])("%s -> users", async (message) => {
    expect(await intentOf(message)).toBe("users");
  });
});

describe("TEST OBLIGATOIRE — confiance honnête (jamais 0.55 FAIBLE sur une égalité déjà tranchée par règle)", () => {
  test("'Donne-moi les projets associés à un autre utilisateur' obtient confidence=0.9, agent=project_agent atteignable", async () => {
    const intent = await detector.detect("Donne-moi les projets associés à un autre utilisateur");
    expect(intent.name).toBe("projects");
    expect(intent.confidence).toBe(0.9);
    expect(intent.ambiguous).toBe(false);
    expect(intent.moduleKey).toBe("projects");
    expect(intent.requiresTools).toBe(true);
  });
});

describe("Non-régression — les 26 scénarios `users` déjà validés du corpus restent `users`", () => {
  const USERS_SCENARIOS = [
    "Liste-moi tous les utilisateurs actifs.",
    "Je veux désactiver le compte de Karim.",
    "Quel est le rôle de Sami dans le système ?",
    "Peux-tu activer le compte de la nouvelle recrue ?",
    "Montre-moi mon profil utilisateur.",
    "Combien de comptes utilisateurs avons-nous au total ?",
    "Change le rôle de Yasmine en commercial.",
    "Quels utilisateurs ont le rôle admin actuellement ?",
    "Un utilisateur standard peut-il désactiver un autre compte ?",
    "Mets à jour mon profil utilisateur avec mon nouveau numéro.",
    "Liste les utilisateurs filtrés par rôle commercial.",
    "Un rôle admin simple peut-il changer le rôle d'un compte ?",
    "Combien de comptes utilisateurs sont actifs actuellement ?",
    "Désactive le compte de l'ancien employé Karim.",
    "Quel est le profil complet de l'utilisateur Sami ?",
    "Qui peut changer mon rôle utilisateur ?",
    "Active le compte d'un utilisateur récemment créé.",
    "Liste tous les comptes utilisateurs avec le rôle superadmin.",
    "Mets à jour le profil utilisateur de Nadia avec sa nouvelle adresse.",
    "Un utilisateur standard peut-il désactiver son propre compte ?",
    "Quels comptes utilisateurs ont été désactivés ce mois ?",
    "Le rôle admin peut-il consulter le profil de tous les utilisateurs ?",
    "Combien d'utilisateurs ont le rôle commercial dans le système ?",
    "Réactive le compte utilisateur qui avait été suspendu.",
    "Quel est mon rôle actuel dans le système ?",
    "Liste les comptes utilisateurs inactifs depuis plus de 6 mois.",
  ];
  test.each(USERS_SCENARIOS)("%s -> users (aucun ne contient 'projet'/'projets')", async (message) => {
    expect(await intentOf(message)).toBe("users");
  });
});
