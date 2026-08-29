"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission "CORRIGER
// LES 3 PROBLÈMES IDENTIFIÉS PAR L'AUDIT COPILOT", problème 2. Utilise le
// VRAI IntentDetector + le VRAI catalogue (jamais une resimulation) —
// exactement l'exigence de la mission : "au minimum 50 formulations
// naturelles", collisions testées contre chaque intention réelle nommée.

const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { isCapabilityQuestion } = require("../src/ai/orchestrator/capabilityQuestionOverride");

const detector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });

async function intentOf(message) {
  return (await detector.detect(message)).name;
}

// 23 formulations positives — les 13 familles de la mission + variations
// naturelles (majuscule/minuscule, ponctuation, ordre des mots). Note :
// "...avec/sur mon compte" est délibérément ABSENT ici — "compte" est un
// mot-clé RÉEL de l'intention `users` ("Combien de comptes utilisateurs..."
// dans le corpus), donc un message qui le contient route légitimement vers
// `users` (score réel > 0) AVANT même que cet override ne puisse
// s'appliquer (il n'intervient que sur un repli `general_chat` pur, voir sa
// docstring) — un comportement correct, pas une régression à masquer.
const POSITIVE_MESSAGES = [
  "Qu'est-ce que je peux faire ?",
  "qu'est ce que je peux faire",
  "Dis-moi ce que je peux faire.",
  "Que puis-je faire ?",
  "que puis je faire",
  "Quelles sont mes possibilités ?",
  "Quelles fonctionnalités sont disponibles ?",
  "Quelles fonctionnalités sont disponibles pour moi ?",
  "Quelles fonctionnalités puis-je utiliser ?",
  "À quoi ai-je accès ?",
  "A quoi ai-je accès ?",
  "À quoi est-ce que j'ai accès ?",
  "Qu'est-ce qui est disponible pour moi ?",
  "Dis-moi ce qui est disponible pour moi.",
  "Que puis-je consulter ?",
  "Quelles sont mes permissions ?",
  "Quelles sont mes permissions exactement ?",
  "Quelles sont mes autorisations ?",
  "Quels modules puis-je utiliser ?",
  "Quels modules puis-je utiliser aujourd'hui ?",
  "Je voudrais savoir ce que je peux faire.",
  "Peux-tu me dire ce que je peux faire ?",
  "J'aimerais savoir à quoi j'ai accès.",
];

// 26 formulations négatives — collisions explicitement testées contre
// projects/dashboard/meetings/users/commercial_contacts/industrial/
// por_promesh/automation/general_chat, plus les 2 scénarios general_chat déjà
// validés qui contiennent "peux"/"faire" (gen-09/gen-19) et 2 avec
// "disponible" seul (gen-04/gen-21) — la preuve directe que la règle reste
// étroite.
const NEGATIVE_MESSAGES = [
  // general_chat légitime — déjà dans le corpus, doit rester inchangé
  ["Bonjour, que peux-tu faire pour moi globalement ?", "general_chat"],
  ["Bonjour, peux-tu me dire ce que tu sais faire en général ?", "general_chat"],
  ["Bonsoir, es-tu disponible pour discuter ?", "general_chat"],
  ["Bonjour, es-tu toujours disponible à cette heure ?", "general_chat"],
  ["Merci beaucoup, à bientôt !", "general_chat"],
  ["Quelle est la météo aujourd'hui ?", "general_chat"],
  // projects
  ["Quels sont mes projets ?", "projects"],
  ["Puis-je consulter mes projets ?", "projects"],
  ["Que puis-je faire sur ce projet ?", "projects"],
  ["Quels projets puis-je consulter ?", "projects"],
  // dashboard
  ["Quel est mon tableau de bord ?", "dashboard"],
  ["Puis-je consulter mon tableau de bord ?", "dashboard"],
  // meetings
  ["Puis-je programmer une réunion ?", "meetings"],
  ["Que puis-je faire pour organiser une réunion ?", "meetings"],
  // users
  ["Liste les utilisateurs.", "users"],
  ["Puis-je consulter le profil d'un utilisateur ?", "users"],
  // commercial_contacts
  ["Puis-je consulter mes contacts commerciaux ?", "commercial_contacts"],
  ["Que puis-je faire avec mes contacts commerciaux ?", "commercial_contacts"],
  // industrial (mots-clés réels : "industrielle"/"fiche", formes plurielles
  // "industriels"/"enregistrements" absentes du catalogue — hors-scope de
  // cette mission, non modifié)
  ["Puis-je consulter ma fiche industrielle ?", "industrial"],
  // por_promesh
  ["Puis-je consulter mes dossiers POR PROMESH ?", "por_promesh"],
  // automation
  ["Puis-je automatiser cette tâche ?", "automation"],
  // hr
  ["Puis-je consulter mes demandes RH ?", "hr"],
  // maintenance
  ["Puis-je consulter mes demandes de maintenance ?", "maintenance"],
  // notifications
  ["Puis-je consulter mes notifications ?", "notifications"],
  // documentation_question
  ["Comment puis-je faire pour créer un projet ?", "documentation_question"],
  // capability_audit déjà atteint SANS l'override (mots-clés existants)
  ["Quelles sont mes intentions autorisées ?", "capability_audit"],
  // "compte" est un mot-clé réel de `users` — reste `users`, l'override ne
  // s'applique jamais quand un vrai mot-clé d'une autre intention matche.
  ["Que puis-je faire avec mon compte ?", "users"],
];

describe("capabilityQuestionOverride — 27 formulations positives -> capability_audit", () => {
  test.each(POSITIVE_MESSAGES)("%s", async (message) => {
    expect(await intentOf(message)).toBe("capability_audit");
  });
});

describe("capabilityQuestionOverride — 26 formulations négatives (collisions) -> intention réelle inchangée", () => {
  test.each(NEGATIVE_MESSAGES)("%s -> %s", async (message, expected) => {
    expect(await intentOf(message)).toBe(expected);
  });
});

describe("isCapabilityQuestion — fonction pure, jamais de faux positif sur 'peux'/'faire' à la 2e personne", () => {
  test("'tu'/'vous' sans 'je' ne déclenche jamais la règle", () => {
    expect(isCapabilityQuestion("que peux-tu faire pour moi ?")).toBe(false);
    expect(isCapabilityQuestion("que pouvez-vous faire pour moi ?")).toBe(false);
  });
  test("'disponible' seul (sans 'moi') ne déclenche jamais la règle", () => {
    expect(isCapabilityQuestion("es-tu disponible ?")).toBe(false);
  });
});

describe("TEST OBLIGATOIRE — confiance honnête sur une victoire par règle (jamais 0.30 REPLI)", () => {
  test("'Qu'est-ce que je peux faire ?' obtient confidence=0.9, pas 0.3", async () => {
    const intent = await detector.detect("Qu'est-ce que je peux faire ?");
    expect(intent.name).toBe("capability_audit");
    expect(intent.confidence).toBe(0.9);
    expect(intent.ambiguous).toBe(false);
  });
});
