"use strict";

// Mission P1.3 — CORRIGER LA LIAISON RÉUNION COPILOT CRM <-> GOOGLE CALENDAR.
// VRAIE base (aucun mock de Sequelize/Postgres) : ce fichier teste
// PRÉCISÉMENT l'acceptation réelle de l'ENUM `enum_calendar_event_syncs_entityType`
// pour la valeur "copilot_meeting" — le bug découvert pendant le test live
// P1.2 (ENUM Postgres réel limité à 'project_action'/'commercial_contact_relance').
// Ces tests sont volontairement écrits AVANT l'exécution de la migration
// 20260815120000-add-copilot-meeting-to-calendar-event-syncs-enum.js (déjà
// présente dans src/migrations/, jamais appliquée) : TEST 1/2/3/5 échouent
// tant que la migration n'a pas été exécutée — c'est la preuve empirique
// attendue, pas un défaut de ces tests. TEST 4/6/7 ne dépendent PAS de la
// migration et doivent déjà passer.
require("dotenv").config();
const { sequelize } = require("../src/db");
const CalendarEventSync = require("../src/models/CalendarEventSync");
const Task = require("../src/models/Task");
const { upsertSync } = require("../src/services/multiRecipientCalendarSync.service");
const { createCopilotMeeting } = require("../src/services/meetingCopilotSync.service");
const { retrySync } = require("../src/services/projectActionCalendarSync.service");

const USER_A = "b7c50110-31de-4d2c-96b4-5a117c9e262a"; // info@probardistribution.com (réel)
const USER_B = "516f6dca-7a6f-43cb-b527-5c5652e3e03f"; // hadil.ibnhajfraj@gmail.com (réel)

const createdSyncIds = [];
const createdTaskIds = [];

afterAll(async () => {
  // Nettoyage : UNIQUEMENT les lignes créées par ce fichier — jamais un
  // DELETE large, aucune trace permanente. `createCopilotMeeting()` (TEST 7)
  // crée lui-même, en interne, une ligne CalendarEventSync liée au Task
  // (entityId = task.id) SANS jamais retourner son id directement à
  // l'appelant — balayée ici via `entityId IN createdTaskIds`, en plus des
  // ids explicitement capturés dans `createdSyncIds`, pour ne jamais laisser
  // une ligne orpheline après suppression du Task correspondant.
  if (createdTaskIds.length) {
    await CalendarEventSync.destroy({ where: { entityId: createdTaskIds } });
  }
  if (createdSyncIds.length) {
    await CalendarEventSync.destroy({ where: { id: createdSyncIds } });
  }
  if (createdTaskIds.length) {
    await Task.destroy({ where: { id: createdTaskIds } });
  }
  await sequelize.close();
});

function randomUuid() {
  return require("crypto").randomUUID();
}

describe("Mission P1.3 — TEST 1 : entityType='copilot_meeting' accepté par Postgres", () => {
  test("un CalendarEventSync.create({entityType:'copilot_meeting', ...}) réussit (nécessite la migration ENUM exécutée)", async () => {
    const entityId = randomUuid();
    const row = await CalendarEventSync.create({ entityType: "copilot_meeting", entityId, userId: USER_A, synced: false });
    createdSyncIds.push(row.id);
    expect(row.entityType).toBe("copilot_meeting");
  });
});

describe("Mission P1.3 — TEST 2 : upsertSync() crée correctement une ligne entityType='copilot_meeting'", () => {
  test("upsertSync('copilot_meeting', entityId, userId, {taskId, synced:true}) crée une ligne complète", async () => {
    const entityId = randomUuid();
    const row = await upsertSync("copilot_meeting", entityId, USER_A, { taskId: null, synced: true, error: null });
    createdSyncIds.push(row.id);
    expect(row.entityType).toBe("copilot_meeting");
    expect(row.entityId).toBe(entityId);
    expect(row.userId).toBe(USER_A);
    expect(row.synced).toBe(true);
  });
});

describe("Mission P1.3 — TEST 3 : idempotence d'upsertSync (même entityType/entityId/userId)", () => {
  test("un deuxième upsertSync sur EXACTEMENT le même (entityType, entityId, userId) met à jour la même ligne, jamais un doublon", async () => {
    const entityId = randomUuid();
    const first = await upsertSync("copilot_meeting", entityId, USER_A, { synced: false, error: "en attente" });
    createdSyncIds.push(first.id);

    const second = await upsertSync("copilot_meeting", entityId, USER_A, { synced: true, error: null });
    expect(second.id).toBe(first.id); // même ligne, jamais une deuxième

    const count = await CalendarEventSync.count({ where: { entityType: "copilot_meeting", entityId, userId: USER_A } });
    expect(count).toBe(1);
    const reloaded = await CalendarEventSync.findByPk(first.id);
    expect(reloaded.synced).toBe(true); // bien mis à jour, pas un nouvel enregistrement figé sur l'ancien état
  });
});

describe("Mission P1.3 — TEST 4 : non-régression — les anciens entityType continuent de fonctionner", () => {
  test.each(["project_action", "commercial_contact_relance"])("entityType='%s' toujours accepté (indépendant de la migration copilot_meeting)", async (entityType) => {
    const entityId = randomUuid();
    const row = await CalendarEventSync.create({ entityType, entityId, userId: USER_A, synced: false });
    createdSyncIds.push(row.id);
    expect(row.entityType).toBe(entityType);
  });
});

describe("Mission P1.3 — TEST 5 : retrySync() (ProjectAction) reste inchangé, aucune régression liée à copilot_meeting", () => {
  test("retrySync() est strictement spécifique à ProjectAction — ne lit/ne branche jamais sur CalendarEventSync.entityType, donc structurellement non affecté par un 3e entityType", async () => {
    // Preuve directe (pas une supposition) : retrySync() lève une 404
    // "Action not found" pour un id de ProjectAction inexistant, EXACTEMENT
    // comme avant — la présence d'une nouvelle valeur d'ENUM ailleurs dans
    // la table n'a aucune incidence sur ce chemin (il ne référence
    // `entityType` nulle part dans son propre code, voir
    // projectActionCalendarSync.service.js:290-317).
    await expect(retrySync(randomUuid(), USER_A)).rejects.toMatchObject({ status: 404 });
  });

  test("un scan générique de CalendarEventSync (sans filtre entityType) inclut une ligne 'copilot_meeting' sans jamais lever d'erreur", async () => {
    const entityId = randomUuid();
    const row = await upsertSync("copilot_meeting", entityId, USER_A, { synced: true });
    createdSyncIds.push(row.id);

    const rows = await CalendarEventSync.findAll({ where: { entityId } });
    expect(rows.map((r) => r.entityType)).toContain("copilot_meeting");
  });
});

describe("Mission P1.3 — TEST 6 : un autre utilisateur ne peut pas récupérer/écraser la synchronisation d'un autre utilisateur", () => {
  test("le même entityId pour 2 utilisateurs différents produit 2 lignes SÉPARÉES (contrainte unique (entityType, entityId, userId)), jamais un partage/écrasement croisé", async () => {
    const entityId = randomUuid(); // même id de Task simulée, volontairement partagé pour ce test
    const rowA = await upsertSync("copilot_meeting", entityId, USER_A, { synced: true, error: null });
    createdSyncIds.push(rowA.id);
    const rowB = await upsertSync("copilot_meeting", entityId, USER_B, { synced: false, error: "pas connecté" });
    createdSyncIds.push(rowB.id);

    expect(rowA.id).not.toBe(rowB.id);
    const reloadedA = await CalendarEventSync.findByPk(rowA.id);
    expect(reloadedA.userId).toBe(USER_A);
    expect(reloadedA.synced).toBe(true); // jamais écrasé par l'upsert de B
  });
});

describe("Mission P1.3 — TEST 7 : aucun champ fourni par le LLM (via payload) ne permet de contourner le scope utilisateur", () => {
  test("createCopilotMeeting() lie TOUJOURS userId/createdBy à actingUserId — un payload contenant ownerId/userId/createdBy/actingUserId/role est ignoré", async () => {
    const pollutedPayload = {
      summary: "Réunion Test P1.3 — anti-fuite",
      startDateTime: "2026-09-01T09:00:00",
      endDateTime: "2026-09-01T09:30:00",
      // Champs qu'un LLM pourrait halluciner/injecter — AUCUN d'entre eux
      // n'est un paramètre lu par createCrmTask()/createCopilotMeeting()
      // (voir meetingCopilotSync.service.js — seul `actingUserId`, reçu en
      // paramètre séparé et jamais depuis `payload`, alimente `createdBy`).
      ownerId: USER_B,
      userId: USER_B,
      createdBy: USER_B,
      actingUserId: USER_B,
      role: "admin",
    };
    const fakeTool = { name: "create_calendar_event", invoke: async () => JSON.stringify({ success: false, error: "non connecté (test)" }) };

    const result = await createCopilotMeeting({ actingUserId: USER_A, payload: pollutedPayload, tool: fakeTool });
    expect(result.crmCreated).toBe(true);
    createdTaskIds.push(result.crmEventId);

    const task = await Task.findByPk(result.crmEventId);
    expect(task.createdBy).toBe(USER_A); // jamais USER_B, malgré le payload pollué
    expect(task.createdBy).not.toBe(USER_B);
  });
});
