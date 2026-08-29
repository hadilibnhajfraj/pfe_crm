"use strict";

// Voir AI-Business-Copilot/11_MEETING_AGENT_FIX.md — ce fichier vérifie ce
// qui est PROPRE à MeetingAgent : le contenu du prompt système garantit
// qu'il ne réclame/n'invente jamais un champ "participants" (absent du Tool
// réel create_calendar_event), et qu'il collecte les champs réellement
// exigés avant d'appeler un Tool d'écriture. MeetingAgent n'est PLUS un
// Agent "config-only" (voir 29_MEETING_AGENT_CRM_CALENDAR_LINK.md/
// 30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md — `_run()` personnalisé,
// collaborateurs `pendingActionStore`/`createCopilotMeeting` obligatoires) :
// retiré de test/ai.agents.specialized.test.js, même précédent que
// ReportingAgent/AutomationAgent — sa couverture vit entièrement dans les
// fichiers test/ai.agents.meetingAgent.*.test.js.

const { createMeetingAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT, CONFIRMATION_REQUEST_RE, hasAffirmativeConfirmation } = require("../src/ai/agents/meetingAgent");
const { LlmProviderChatModel } = require("../src/ai/langchain/model");
const { LangChainWorkflowEngine } = require("../src/ai/langchain/workflow");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

function chatModelReturning(decision) {
  return new LlmProviderChatModel({ llmProvider: { complete: jest.fn(async () => JSON.stringify(decision)) } });
}

describe("MeetingAgent — identité et prompt système", () => {
  test("gère 'meetings' ET 'reminders' (même mécanisme calendrier, jamais un second Agent) — voir AI-Business-Copilot/16_REMINDER_ROUTING.md", () => {
    const agent = createMeetingAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: new PendingActionStore(), createCopilotMeeting: jest.fn() });
    expect(agent.name).toBe("meeting_agent");
    expect(agent.canHandle({ name: "meetings" })).toBe(true);
    expect(agent.canHandle({ name: "reminders" })).toBe(true);
    expect(agent.canHandle({ name: "projects" })).toBe(false);
    expect(agent.requiredRoles).toEqual([]);
  });

  test("Tools autorisés = exactement les 4 Tools googleCalendar déjà réels, aucun nouveau Tool", () => {
    expect(ALLOWED_TOOL_NAMES).toEqual(["get_calendar_status", "create_calendar_event", "update_calendar_event", "delete_calendar_event"]);
  });

  test("le prompt système exige le sujet + début + fin avant toute création, jamais inventés", () => {
    expect(SYSTEM_PROMPT).toMatch(/sujet/i);
    expect(SYSTEM_PROMPT).toMatch(/date et l'heure de début/i);
    expect(SYSTEM_PROMPT).toMatch(/date et l'heure de fin/i);
    expect(SYSTEM_PROMPT).toMatch(/ne les invente jamais/i);
  });

  test("le prompt système interdit explicitement de prétendre gérer des participants (champ absent du Tool réel)", () => {
    expect(SYSTEM_PROMPT).toMatch(/n'affirme jamais pouvoir enregistrer des participants/i);
  });

  test("le prompt système impose de vérifier get_calendar_status avant de tenter une création sur un compte non connecté", () => {
    expect(SYSTEM_PROMPT).toMatch(/get_calendar_status/);
    expect(SYSTEM_PROMPT).toMatch(/non connecté/i);
  });

  // AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md — renforcé après
  // diagnostic direct (étapes 6/8) : une seule question à la fois, un
  // récapitulatif + une demande de confirmation EXPLICITE avant tout appel
  // d'écriture, jamais seulement pour la création.
  test("le prompt système pose une seule question à la fois, jamais plusieurs d'un coup", () => {
    expect(SYSTEM_PROMPT).toMatch(/UNE SEULE question à la fois/);
  });

  // AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — la CRÉATION
  // ne passe plus par une décision du LLM (cycle PendingAction, voir
  // meetingAgent.js) ; le prompt le dit explicitement. update_calendar_event/
  // delete_calendar_event gardent le mécanisme de confirmation textuelle
  // inchangé.
  test("le prompt système interdit explicitement au modèle d'appeler create_calendar_event lui-même", () => {
    expect(SYSTEM_PROMPT).toMatch(/n'appelle JAMAIS toi-même create_calendar_event/i);
  });

  test("le prompt système exige une confirmation explicite avant update_calendar_event/delete_calendar_event", () => {
    expect(SYSTEM_PROMPT).toMatch(/Confirmez-vous/);
    expect(SYSTEM_PROMPT).toMatch(/update_calendar_event\/delete_calendar_event/);
  });

  // AI-Business-Copilot/16_REMINDER_ROUTING.md — un rappel EST un événement
  // calendrier (sujet + horaire), jamais un second système ; le prompt doit
  // le dire explicitement et ne jamais prétendre pouvoir LISTER les
  // rappels/réunions existants (aucun Tool ne le permet aujourd'hui).
  test("le prompt système traite un rappel comme un événement calendrier, jamais un système séparé", () => {
    expect(SYSTEM_PROMPT).toMatch(/rappel/i);
    expect(SYSTEM_PROMPT).toMatch(/un rappel personnel sont TOUS les trois représentés de/i);
  });

  test("le prompt système avoue honnêtement ne pas pouvoir lister les rappels/réunions existants (aucun Tool de listing réel)", () => {
    expect(SYSTEM_PROMPT).toMatch(/tu ne peux PAS lister les rappels\/réunions déjà existants/i);
  });
});

describe("MeetingAgent — garde de confirmation déterministe (AI-Business-Copilot/28_MEETING_AGENT_CONFIRMATION_GATE.md)", () => {
  test("CONFIRMATION_REQUEST_RE reconnaît EXACTEMENT la phrase que le SYSTEM_PROMPT impose déjà au modèle", () => {
    expect(CONFIRMATION_REQUEST_RE.test("Confirmez-vous la création de cette réunion ?")).toBe(true);
    expect(CONFIRMATION_REQUEST_RE.test("Confirmez-vous l'annulation de ce rappel ?")).toBe(true);
    expect(CONFIRMATION_REQUEST_RE.test("Quel est le sujet de la réunion ?")).toBe(false);
  });

  test.each(["Oui", "oui, confirme", "Yes", "OK", "D'accord", "Vas-y", "Confirmé"])(
    "hasAffirmativeConfirmation('%s') est reconnu comme une confirmation",
    (message) => {
      expect(hasAffirmativeConfirmation(message)).toBe(true);
    }
  );

  test.each(["Non", "Peut-être", "je ne sais pas encore", "Annule plutôt", ""])(
    "hasAffirmativeConfirmation('%s') n'est JAMAIS déduit d'un message ambigu ou négatif",
    (message) => {
      expect(hasAffirmativeConfirmation(message)).toBe(false);
    }
  );
});

describe("MeetingAgent — classifyConfirmation (AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md)", () => {
  const { classifyConfirmation } = require("../src/ai/agents/meetingAgent");

  test.each(["oui", "oui, confirme la création", "confirmer", "je confirme", "confirme la création", "d'accord"])(
    "'%s' => confirm (liste exacte demandée)",
    (message) => {
      expect(classifyConfirmation(message)).toBe("confirm");
    }
  );

  test("'je pense que oui' => ambiguous, PAS confirm (contient 'oui' mais message trop long/non explicite)", () => {
    expect(classifyConfirmation("je pense que oui")).toBe("ambiguous");
  });

  test("'peut-être' => ambiguous", () => {
    expect(classifyConfirmation("peut-être")).toBe("ambiguous");
  });

  test.each(["non", "annule", "non, annule"])("'%s' => cancel", (message) => {
    expect(classifyConfirmation(message)).toBe("cancel");
  });

  test("un marqueur d'annulation l'emporte toujours, même mélangé à un marqueur de confirmation (fail-safe)", () => {
    expect(classifyConfirmation("non, ne confirme pas")).toBe("cancel");
  });
});

describe("MeetingAgent — construction (pendingActionStore et createCopilotMeeting requis)", () => {
  test("lève ConfigurationError sans pendingActionStore — ne jamais créer une réunion sans confirmation traçable", () => {
    const { ConfigurationError } = require("../src/ai/agents/errors");
    expect(() =>
      createMeetingAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine() })
    ).toThrow(ConfigurationError);
  });

  // AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md —
  // test/ai.agents.policy.test.js interdit à MeetingAgent de require() un
  // service CRM directement : `createCopilotMeeting` doit être INJECTÉ,
  // jamais optionnel silencieusement.
  test("lève ConfigurationError sans createCopilotMeeting — jamais un service CRM requis en dur dans l'Agent", () => {
    const { ConfigurationError } = require("../src/ai/agents/errors");
    const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");
    expect(() =>
      createMeetingAgent({ chatModel: chatModelReturning({}), workflowEngine: new LangChainWorkflowEngine(), pendingActionStore: new PendingActionStore() })
    ).toThrow(ConfigurationError);
  });
});
