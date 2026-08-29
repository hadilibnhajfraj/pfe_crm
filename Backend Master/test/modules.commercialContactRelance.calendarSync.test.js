"use strict";

// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — mission
// "SYNCHRONISER LES RELANCES COMMERCIALES DU COPILOT AVEC LE CRM ET LE
// CALENDRIER". VRAIE base (contact/commercial réels, Task/CalendarEventSync
// réels), Google Calendar MOCKÉ (déterministe, réseau/OAuth non nécessaire)
// — voir test/ai.orchestrator.commercialAgent.relanceAction.integration.test.js
// pour la preuve LIVE (compte + Google réels).
require("dotenv").config();

jest.mock("../src/services/googleCalendar.service", () => ({
  createCalendarEvent: jest.fn(),
  updateCalendarEvent: jest.fn(),
  deleteCalendarEvent: jest.fn(),
}));
// Preuve directe du TEST 10 (aucun email/WhatsApp) : si
// `scheduleContactRelance()`/`_syncCalendars()` appelait un jour ces
// fonctions, ce mock le rendrait immédiatement visible (mock jamais appelé).
jest.mock("../src/services/email.service", () => ({ sendEmail: jest.fn() }));
jest.mock("../src/services/whatsapp.service", () => ({ sendWhatsappMessage: jest.fn(), isConfigured: () => false }));

const { sequelize } = require("../src/db");
const googleCalendarService = require("../src/services/googleCalendar.service");
const emailService = require("../src/services/email.service");
const whatsappService = require("../src/services/whatsapp.service");
const { scheduleContactRelance, _syncCalendars } = require("../src/modules/commercial-contacts/services/commercialContactRelance.service");
const CalendarEventSync = require("../src/models/CalendarEventSync");
const Task = require("../src/models/Task");
const CommercialContactRelance = require("../src/models/CommercialContactRelance");

const REAL_COMMERCIAL = { id: "b7c50110-31de-4d2c-96b4-5a117c9e262a", role: "commercial", email: "info@probardistribution.com" };
const AWLED_CONTACT_ID = "008aea48-50ed-4aa4-86bf-6d51a3411c4e"; // Pépinière awled el HAJ — créé par REAL_COMMERCIAL (vérifié en base)
const HADIL_ID = "516f6dca-7a6f-43cb-b527-5c5652e3e03f"; // hadil.ibnhajfraj@gmail.com — role "user", éligible

const createdRelanceIds = [];

afterEach(() => jest.clearAllMocks());

afterAll(async () => {
  if (createdRelanceIds.length) {
    const syncs = await CalendarEventSync.findAll({ where: { entityType: "commercial_contact_relance", entityId: createdRelanceIds } });
    const taskIds = syncs.map((s) => s.taskId).filter(Boolean);
    if (taskIds.length) await Task.destroy({ where: { id: taskIds } });
    await CalendarEventSync.destroy({ where: { entityType: "commercial_contact_relance", entityId: createdRelanceIds } });
    await CommercialContactRelance.destroy({ where: { id: createdRelanceIds } });
  }
  await sequelize.close();
});

function trackAndReturn(result) {
  if (result.ok) createdRelanceIds.push(result.relance.id);
  return result;
}

describe("TEST 1 — sans heure -> 09:00, tâche CRM créée, événement Google créé", () => {
  test("Task.startAt = 09:00 locale, CalendarEventSync liée, calendarSync.crmSynced/googleSynced = true", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-1", eventLink: "https://calendar.google.com/evt1", calendarId: "primary" });

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-01", commercialId: HADIL_ID }, REAL_COMMERCIAL));
    expect(result.ok).toBe(true);
    expect(result.calendarSync.crmSynced).toBe(true);
    expect(result.calendarSync.googleSynced).toBe(true);
    expect(result.calendarSync.googleError).toBeNull();

    const sync = await CalendarEventSync.findOne({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id, userId: HADIL_ID } });
    expect(sync).not.toBeNull();
    expect(sync.googleEventId).toBe("g-evt-1");

    const task = await Task.findByPk(sync.taskId);
    expect(task).not.toBeNull();
    expect(task.createdBy).toBe(HADIL_ID);
    // combineDateTime() retombe sur "09:00" par défaut quand aucune heure —
    // vérifié sur l'heure UTC réelle stockée en base (dayjs() interprète
    // "YYYY-MM-DDT09:00" en heure LOCALE du serveur, donc on compare
    // directement le composant heure:minute local plutôt que l'ISO UTC).
    const local = new Date(task.startAt);
    expect(`${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`).toBe("09:00");
  });
});

describe("TEST 2 — avec heure fournie -> conservée, durée 30 minutes", () => {
  test("Task.startAt = heure fournie, Task.endAt - Task.startAt = 30 min", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-2" });

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-02", heureRelance: "14:30", commercialId: HADIL_ID }, REAL_COMMERCIAL));
    const sync = await CalendarEventSync.findOne({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id, userId: HADIL_ID } });
    const task = await Task.findByPk(sync.taskId);

    const local = new Date(task.startAt);
    expect(`${String(local.getHours()).padStart(2, "0")}:${String(local.getMinutes()).padStart(2, "0")}`).toBe("14:30");
    expect(task.endAt.getTime() - task.startAt.getTime()).toBe(30 * 60 * 1000);
  });
});

describe("TEST 3 — le commercial affecté (résolu côté serveur) est bien le destinataire", () => {
  test("Task.createdBy et l'appel Google ciblent HADIL_ID, jamais un id du message", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-3" });

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-03", commercialId: HADIL_ID }, REAL_COMMERCIAL));
    const call = googleCalendarService.createCalendarEvent.mock.calls.find(([args]) => args.userId === HADIL_ID);
    expect(call).toBeDefined();

    const sync = await CalendarEventSync.findOne({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id, userId: HADIL_ID } });
    expect(sync).not.toBeNull();
  });
});

describe("TEST 4 — double synchronisation (même relance.id) -> aucun doublon", () => {
  test("un second appel à _syncCalendars() pour la MÊME relance met à jour, ne duplique jamais Task/CalendarEventSync", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-4a" });
    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-04", commercialId: HADIL_ID }, REAL_COMMERCIAL));

    const before = await CalendarEventSync.count({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id } });
    const tasksBefore = await Task.count({ where: { id: (await CalendarEventSync.findAll({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id } })).map((s) => s.taskId) } });

    googleCalendarService.updateCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-4a" });
    await _syncCalendars(result.relance, result.contact);

    const after = await CalendarEventSync.count({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id } });
    const syncsAfter = await CalendarEventSync.findAll({ where: { entityType: "commercial_contact_relance", entityId: result.relance.id } });
    const tasksAfter = await Task.count({ where: { id: syncsAfter.map((s) => s.taskId) } });

    expect(after).toBe(before); // aucune ligne CalendarEventSync supplémentaire
    expect(tasksAfter).toBe(tasksBefore); // aucune Task supplémentaire
    expect(googleCalendarService.updateCalendarEvent).toHaveBeenCalled(); // 2e appel = update, jamais un create
  });
});

describe("TEST 6 — Google Calendar non connecté -> relance CRM conservée, erreur signalée honnêtement", () => {
  test("calendarSync.crmSynced=true, googleSynced=false, googleError='not_connected'", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: false, skipped: true, reason: "not_connected" });

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-06", commercialId: HADIL_ID }, REAL_COMMERCIAL));
    expect(result.ok).toBe(true); // la relance CRM reste créée
    expect(result.calendarSync.crmSynced).toBe(true);
    expect(result.calendarSync.googleSynced).toBe(false);
    expect(result.calendarSync.googleError).toBe("not_connected");

    // La ligne CommercialContactRelance existe bel et bien en base malgré
    // l'échec Google — jamais annulée.
    const row = await CommercialContactRelance.findByPk(result.relance.id);
    expect(row).not.toBeNull();
  });
});

describe("TEST 7 — Google Calendar en erreur -> relance CRM conservée, erreur réelle signalée (jamais un faux succès)", () => {
  test("calendarSync.googleSynced=false, googleError contient le message réel", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: false, error: "Simulated Google API error" });

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-07", commercialId: HADIL_ID }, REAL_COMMERCIAL));
    expect(result.ok).toBe(true);
    expect(result.calendarSync.crmSynced).toBe(true);
    expect(result.calendarSync.googleSynced).toBe(false);
    expect(result.calendarSync.googleError).toBe("Simulated Google API error");
  });
});

describe("TEST 7bis — anti-fuite : ownerId/userId/createdBy/commercialName fournis dans les options n'ont AUCUN effet", () => {
  test("scheduleContactRelance() ignore silencieusement tout champ hors {dateRelance,heureRelance,commercialId,commentaire}", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-7b" });

    const maliciousOptions = {
      dateRelance: "2027-09-08",
      commercialId: HADIL_ID,
      ownerId: "00000000-0000-4000-8000-000000000099",
      userId: "00000000-0000-4000-8000-000000000099",
      createdBy: "00000000-0000-4000-8000-000000000099",
      commercialName: "najeh",
    };
    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, maliciousOptions, REAL_COMMERCIAL));

    expect(result.ok).toBe(true);
    expect(result.relance.commercialId).toBe(HADIL_ID); // jamais l'id injecté
    const row = await CommercialContactRelance.findByPk(result.relance.id);
    expect(row.createdBy).toBe(REAL_COMMERCIAL.id); // jamais le createdBy injecté
  });
});

describe("TEST 8 — RBAC : un commercial ne peut pas créer une relance sur le contact d'un autre commercial", () => {
  test("actingUser different de contact.createdBy et non admin-tier -> forbidden, aucune écriture", async () => {
    const OTHER_COMMERCIAL = { id: "00000000-0000-4000-8000-000000000042", role: "commercial", email: "other@example.com" };
    const before = await CommercialContactRelance.count({ where: { commercialContactId: AWLED_CONTACT_ID } });

    const result = await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-09", commercialId: HADIL_ID }, OTHER_COMMERCIAL);

    expect(result.ok).toBe(false);
    expect(result.reason).toBe("forbidden");
    expect(googleCalendarService.createCalendarEvent).not.toHaveBeenCalled();
    const after = await CommercialContactRelance.count({ where: { commercialContactId: AWLED_CONTACT_ID } });
    expect(after).toBe(before); // aucune relance créée
  });
});

describe("TEST 9 — admin-tier : comportement transverse déjà autorisé conservé", () => {
  test("un admin peut créer une relance sur un contact qu'il n'a pas créé, synchronisation identique", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-9" });
    // Vrai utilisateur admin-tier (FK réelle sur commercial_contact_relances.createdBy
    // — un id inventé échouerait à l'INSERT, jamais un souci en production
    // puisque actingUser.id vient toujours d'un JWT valide).
    const ADMIN = { id: "239fcd74-ace2-465b-a185-a19bf0774fba", role: "superadmin", email: "bayrem@gmail.com" };

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-10", commercialId: HADIL_ID }, ADMIN));
    expect(result.ok).toBe(true);
    expect(result.calendarSync.crmSynced).toBe(true);
  });
});

describe("TEST 10 — aucun email ni WhatsApp n'est déclenché par le chemin Copilot", () => {
  test("sendEmail()/sendWhatsappMessage() ne sont JAMAIS appelés", async () => {
    googleCalendarService.createCalendarEvent.mockResolvedValue({ success: true, eventId: "g-evt-10" });

    const result = trackAndReturn(await scheduleContactRelance(AWLED_CONTACT_ID, { dateRelance: "2027-09-11", commercialId: HADIL_ID }, REAL_COMMERCIAL));
    expect(result.ok).toBe(true);

    expect(emailService.sendEmail).not.toHaveBeenCalled();
    expect(whatsappService.sendWhatsappMessage).not.toHaveBeenCalled();

    const row = await CommercialContactRelance.findByPk(result.relance.id);
    expect(row.emailSent).toBe(false);
    expect(row.whatsappSent).toBe(false);
    expect(row.notificationSent).toBe(false);
  });
});
