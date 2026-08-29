"use strict";

/**
 * AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md —
 * meetingCopilotSync.service.js::createCopilotMeeting() en isolation :
 * CRM (Task) -> Google (Tool réel injecté) -> liaison (CalendarEventSync via
 * upsertSync, réutilisé depuis multiRecipientCalendarSync.service.js).
 * `Task.create` et `upsertSync` sont mockés (même convention que
 * test/followupJob.dedup.test.js) — aucune vraie connexion DB dans ce
 * fichier. Couvre en particulier TEST 7 (Google échoue) et TEST 8 (CRM
 * échoue) du mandat : jamais un succès complet affirmé, jamais un
 * identifiant inventé.
 */

jest.mock("../src/models/Task", () => ({ create: jest.fn() }));
jest.mock("../src/services/multiRecipientCalendarSync.service", () => ({ upsertSync: jest.fn() }));

const Task = require("../src/models/Task");
const { upsertSync } = require("../src/services/multiRecipientCalendarSync.service");
const { createCopilotMeeting, ENTITY_TYPE } = require("../src/services/meetingCopilotSync.service");

const PAYLOAD = {
  projectId: null,
  projectName: "projet cbi10",
  email: "hadil.ibnhajfraj@gmail.com",
  summary: "projet cbi10",
  description: "Email mentionné : hadil.ibnhajfraj@gmail.com",
  startDateTime: "2026-08-17T12:00:00",
  endDateTime: "2026-08-17T13:00:00",
};

function fakeTool(invoke) {
  return { name: "create_calendar_event", description: "...", invoke };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("createCopilotMeeting — chemin nominal (CRM + Google réussissent tous les deux)", () => {
  test("crée le Task CRM, appelle le VRAI Tool avec EXACTEMENT le payload, lie via upsertSync(entityType:'copilot_meeting')", async () => {
    Task.create.mockResolvedValue({ id: "task-1" });
    const tool = fakeTool(jest.fn(async () => JSON.stringify({ success: true, eventId: "evt-1", eventLink: "https://calendar.google.com/evt-1", calendarId: "primary" })));

    const result = await createCopilotMeeting({ actingUserId: "u1", payload: PAYLOAD, tool });

    expect(Task.create).toHaveBeenCalledWith({
      title: "projet cbi10",
      description: PAYLOAD.description,
      startAt: new Date(PAYLOAD.startDateTime),
      endAt: new Date(PAYLOAD.endDateTime),
      projectId: null,
      createdBy: "u1",
    });
    expect(tool.invoke).toHaveBeenCalledWith({
      summary: "projet cbi10",
      description: PAYLOAD.description,
      location: undefined,
      startDateTime: PAYLOAD.startDateTime,
      endDateTime: PAYLOAD.endDateTime,
      timeZone: undefined,
    });
    expect(upsertSync).toHaveBeenCalledWith(
      ENTITY_TYPE,
      "task-1",
      "u1",
      expect.objectContaining({ taskId: "task-1", googleEventId: "evt-1", googleEventLink: "https://calendar.google.com/evt-1", synced: true, error: null })
    );

    expect(result).toEqual({
      crmCreated: true,
      crmEventId: "task-1",
      crmError: null,
      googleCreated: true,
      googleEventId: "evt-1",
      googleEventLink: "https://calendar.google.com/evt-1",
      googleError: null,
    });
  });
});

describe("createCopilotMeeting — TEST 8 : le CRM échoue", () => {
  test("Task.create() échoue : Google n'est JAMAIS appelé, aucune affirmation de création complète", async () => {
    Task.create.mockRejectedValue(new Error("connection refused"));
    const tool = fakeTool(jest.fn());

    const result = await createCopilotMeeting({ actingUserId: "u1", payload: PAYLOAD, tool });

    expect(tool.invoke).not.toHaveBeenCalled();
    expect(upsertSync).not.toHaveBeenCalled();
    expect(result.crmCreated).toBe(false);
    expect(result.crmError).toContain("connection refused");
    expect(result.googleCreated).toBe(false);
    expect(result.googleEventId).toBeNull();
  });
});

describe("createCopilotMeeting — TEST 7 : le CRM réussit mais Google échoue", () => {
  test("le Task CRM existe (crmCreated:true, crmEventId réel) mais googleCreated:false, googleEventId:null — jamais un eventId inventé", async () => {
    Task.create.mockResolvedValue({ id: "task-2" });
    const tool = fakeTool(jest.fn(async () => {
      throw new Error("Google Calendar API unavailable");
    }));

    const result = await createCopilotMeeting({ actingUserId: "u1", payload: PAYLOAD, tool });

    expect(result.crmCreated).toBe(true);
    expect(result.crmEventId).toBe("task-2");
    expect(result.googleCreated).toBe(false);
    expect(result.googleEventId).toBeNull();
    expect(result.googleError).toContain("Google Calendar API unavailable");
    // La tentative échouée est quand même tracée (synced:false, error) —
    // jamais silencieuse, jamais un événement orphelin caché.
    expect(upsertSync).toHaveBeenCalledWith(ENTITY_TYPE, "task-2", "u1", expect.objectContaining({ synced: false, error: expect.stringContaining("Google Calendar API unavailable") }));
  });

  test("le Tool répond avec {success:false} (jamais une exception) : même traitement honnête", async () => {
    Task.create.mockResolvedValue({ id: "task-3" });
    const tool = fakeTool(jest.fn(async () => JSON.stringify({ success: false, skipped: true, reason: "not_connected" })));

    const result = await createCopilotMeeting({ actingUserId: "u1", payload: PAYLOAD, tool });

    expect(result.crmCreated).toBe(true);
    expect(result.googleCreated).toBe(false);
    expect(result.googleEventId).toBeNull();
  });
});
