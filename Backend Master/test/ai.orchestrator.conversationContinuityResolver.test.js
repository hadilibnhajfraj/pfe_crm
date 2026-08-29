"use strict";

const { ConversationContinuityResolver, looksLikeSlotAnswer } = require("../src/ai/orchestrator/conversationContinuityResolver");

const CATALOG = [
  {
    key: "meetings",
    moduleKey: "googleCalendar",
    requiresRag: false,
    requiresTools: true,
    keywords: ["reunion", "réunion", "rendez", "rdv", "meeting"],
    description: "Réunions et rendez-vous.",
    conversational: true,
  },
  {
    key: "projects",
    moduleKey: "projects",
    requiresRag: false,
    requiresTools: true,
    keywords: ["projet", "projets"],
    description: "Gestion des projets.",
  },
  {
    key: "general_chat",
    moduleKey: null,
    requiresRag: true,
    requiresTools: false,
    keywords: [],
    description: "...",
  },
];

function intent(name, overrides = {}) {
  return { name, confidence: 0.9, entities: [], ambiguous: false, alternateIntent: null, ...overrides };
}

describe("looksLikeSlotAnswer — détecte les champs réels demandés par meeting_agent (email/date/heure)", () => {
  test.each([
    ["hadil.ibnhajfraj@gmail.com et programmer le projet cbi10 pour une date le 17/08/2026 à 12h"],
    ["Email hadil.ibnhajfraj@gmail.com, sujet point projet cbi10, demain à 12h"],
    ["le 17/08/2026 à 12h"],
    ["demain à 12h"],
  ])("'%s' contient un email, une date ou une heure", (message) => {
    expect(looksLikeSlotAnswer(message)).toBe(true);
  });

  test("un message sans email/date/heure ne ressemble pas à une réponse de créneau", () => {
    expect(looksLikeSlotAnswer("finalement je veux plutôt voir mes projets critiques")).toBe(false);
  });
});

describe("ConversationContinuityResolver — pas de sujet actif ou sujet non conversationnel : aucune intervention", () => {
  const resolver = new ConversationContinuityResolver({ catalog: CATALOG });

  test("activeTopic absent (conversation neuve) : freshIntent renvoyé inchangé", () => {
    const fresh = intent("projects");
    const result = resolver.resolve({ message: "donne-moi les projets associés à Hadil", freshIntent: fresh, activeTopic: null });
    expect(result).toBe(fresh);
  });

  test("activeTopic non déclaré 'conversational' dans le catalogue (ex. 'projects') : jamais collant", () => {
    const fresh = intent("general_chat", { confidence: 0.3 });
    const result = resolver.resolve({ message: "merci", freshIntent: fresh, activeTopic: "projects" });
    expect(result).toBe(fresh);
  });

  test("activeTopic inconnu du catalogue actuel : ignoré, comme absent", () => {
    const fresh = intent("projects");
    const result = resolver.resolve({ message: "un message quelconque", freshIntent: fresh, activeTopic: "une_intention_disparue" });
    expect(result).toBe(fresh);
  });

  test("freshIntent == activeTopic (aucun changement de sujet à arbitrer) : renvoyé inchangé", () => {
    const fresh = intent("meetings");
    const result = resolver.resolve({ message: "hadil.ibnhajfraj@gmail.com, demain à 12h", freshIntent: fresh, activeTopic: "meetings" });
    expect(result).toBe(fresh);
  });
});

describe("ConversationContinuityResolver — TEST 1/2/5 : le message ressemble à une réponse aux informations demandées (signal 1) => reste sur le sujet actif", () => {
  const resolver = new ConversationContinuityResolver({ catalog: CATALOG });

  test("email + date + heure, mot 'projet' présent : reste 'meetings' malgré une intention fraîche 'projects'", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({
      message: "hadil.ibnhajfraj@gmail.com et programmer le projet cbi10 pour une date le 17/08/2026 à 12h",
      freshIntent: fresh,
      activeTopic: "meetings",
    });
    expect(result.name).toBe("meetings");
    expect(result.continuedFrom).toBe("projects");
    expect(result.ambiguous).toBe(false);
    expect(result.alternateIntent).toBeNull();
    expect(result.conversational).toBe(true);
  });

  test("date + heure seules (pas d'email) suffisent déjà comme signal de créneau", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({ message: "demain à 12h, sujet point projet cbi10", freshIntent: fresh, activeTopic: "meetings" });
    expect(result.name).toBe("meetings");
  });

  // AI-Business-Copilot/27_MEETING_AGENT_SLOT_ACCUMULATION.md — TEST 2 (tour
  // 4) : un tour qui ne répond QUE le sujet (aucun email/date/heure) doit
  // rester aussi collant qu'un tour qui répond un créneau — reproduit en
  // direct (Ollama réel) : ce cas précis basculait vers project_agent avant
  // cette extension du signal 1.
  test("un sujet explicite ('sujet : ...'), sans aucun email/date/heure, suffit déjà comme signal de créneau", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({ message: "sujet : réunion projet cbi10", freshIntent: fresh, activeTopic: "meetings" });
    expect(result.name).toBe("meetings");
  });

  test("une mention 'projet X' isolée (sans marqueur 'sujet'), sans aucun email/date/heure, suffit aussi comme signal", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({ message: "c'est pour le projet cbi10", freshIntent: fresh, activeTopic: "meetings" });
    expect(result.name).toBe("meetings");
  });

  test("le message reconstruit reprend les champs RÉELS du catalogue pour 'meetings', jamais un intent inventé", () => {
    const fresh = intent("projects", { confidence: 0.9, entities: ["cbi10"] });
    const result = resolver.resolve({ message: "hadil.ibnhajfraj@gmail.com, le 17/08/2026 à 12h", freshIntent: fresh, activeTopic: "meetings" });
    expect(result.moduleKey).toBe("googleCalendar");
    expect(result.requiresTools).toBe(true);
    expect(result.description).toBe("Réunions et rendez-vous.");
    expect(result.entities).toEqual(["cbi10"]);
  });
});

describe("ConversationContinuityResolver — TEST 4 : marqueur de correction explicite, aucun signal de créneau => bascule vers la nouvelle intention", () => {
  const resolver = new ConversationContinuityResolver({ catalog: CATALOG });

  test("'finalement'/'plutôt' sans email/date/heure : freshIntent l'emporte", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({ message: "finalement je veux plutôt voir mes projets critiques", freshIntent: fresh, activeTopic: "meetings" });
    expect(result).toBe(fresh);
  });

  test("'non' en tête de phrase compte comme une correction", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({ message: "Non, montre-moi plutôt mes projets", freshIntent: fresh, activeTopic: "meetings" });
    expect(result).toBe(fresh);
  });
});

describe("ConversationContinuityResolver — signal 2 (repli confiance) quand aucun signal de créneau n'est présent", () => {
  const resolver = new ConversationContinuityResolver({ catalog: CATALOG });

  test("pas de créneau, pas de correction, confiance FAIBLE (< 0.9) : reste sur le sujet actif (probablement une réponse informelle)", () => {
    const fresh = intent("projects", { confidence: 0.55 });
    const result = resolver.resolve({ message: "Oui c'est urgent, quand es-tu disponible ?", freshIntent: fresh, activeTopic: "meetings" });
    expect(result.name).toBe("meetings");
  });

  test("pas de créneau, pas de correction, confiance FORTE (>= 0.9) : la nouvelle intention l'emporte (vrai changement de sujet)", () => {
    const fresh = intent("projects", { confidence: 0.9 });
    const result = resolver.resolve({ message: "je voudrais voir mes projets", freshIntent: fresh, activeTopic: "meetings" });
    expect(result).toBe(fresh);
  });
});

describe("ConversationContinuityResolver — TEST 3 : une intention 'projects' ordinaire ne devient jamais un sujet actif collant", () => {
  test("le catalogue par défaut ne marque QUE meetings/reminders comme 'conversational' — projects laissé complètement inchangé", () => {
    const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
    const projectsEntry = DEFAULT_INTENT_CATALOG.find((e) => e.key === "projects");
    expect(projectsEntry.conversational).toBeUndefined();
    const meetingsEntry = DEFAULT_INTENT_CATALOG.find((e) => e.key === "meetings");
    expect(meetingsEntry.conversational).toBe(true);
  });
});
