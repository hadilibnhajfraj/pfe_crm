"use strict";

// AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — crée une
// réunion issue du Copilot conversationnel (src/ai/agents/meetingAgent.js)
// dans le CRM (Task, déjà le "calendrier personnel" — src/models/Task.js)
// PUIS dans Google Calendar, et les lie via CalendarEventSync
// (entityType:"copilot_meeting") — le MÊME mécanisme déjà utilisé pour
// ProjectAction/CommercialContactRelance (multiRecipientCalendarSync.service.js),
// jamais une seconde implémentation.
//
// Appelé UNIQUEMENT après qu'un PendingAction ait été consommé
// (pendingActionStore.consume()) — le `payload` reçu ici est TOUJOURS celui
// stocké au moment de la proposition, jamais régénéré par le LLM (voir
// meetingAgent.js).

// Requires PARESSEUX (dans les fonctions, pas ici) : `src/models/Task.js`
// exige une vraie configuration DB dès son chargement (voir src/db.js) —
// avant cette passe, meetingAgent.js (donc n'importe quel test qui le
// requiert, même avec des Tools 100% factices) n'avait AUCUNE dépendance
// DB. Même précédent déjà établi dans ce repo (app.js::logStartupDiagnostics()
// require ses modèles à l'intérieur de la fonction, pas en haut du fichier).
// `require()` reste mis en cache par Node : aucun coût réel en production,
// juste un chargement différé jusqu'au premier réel besoin.
const ENTITY_TYPE = "copilot_meeting";

// Jamais via POST /tasks (qui exige un projectId, voir tasks.routes.js) —
// même précédent que multiRecipientCalendarSync.service.js::syncTaskForRecipients(),
// qui crée déjà des Task par appel direct avec projectId optionnel.
async function createCrmTask({ actingUserId, payload }) {
  const Task = require("../models/Task");
  return Task.create({
    title: payload.summary,
    description: payload.description || null,
    startAt: new Date(payload.startDateTime),
    endAt: payload.endDateTime ? new Date(payload.endDateTime) : null,
    projectId: payload.projectId || null,
    createdBy: actingUserId,
  });
}

// Appelle le VRAI Tool MCP create_calendar_event (jamais googleCalendar.service.js
// directement) — préserve Permission/Validation/Audit Manager de McpServer,
// exactement le Tool déjà autorisé pour meeting_agent. `tool.invoke()` renvoie
// du texte JSON (voir langchain/tools/mcpToolAdapter.js) — seul ce résultat
// réel fait foi, jamais le texte que le LLM aurait pu produire.
async function createGoogleEvent({ tool, payload }) {
  const raw = await tool.invoke({
    summary: payload.summary,
    description: payload.description || undefined,
    location: payload.location || undefined,
    startDateTime: payload.startDateTime,
    endDateTime: payload.endDateTime,
    timeZone: payload.timeZone || undefined,
  });
  try {
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    return parsed && typeof parsed === "object" ? parsed : { success: false, error: "Réponse du Tool Google Calendar inattendue." };
  } catch (_err) {
    return { success: false, error: `Réponse du Tool Google Calendar illisible : ${String(raw).slice(0, 200)}` };
  }
}

// Orchestre CRM -> Google -> liaison, à partir EXACTEMENT du payload d'un
// PendingAction déjà consommé. CRM d'abord : si ça échoue, Google n'est
// JAMAIS appelé (rien à lier). Google ensuite, best-effort (même discipline
// que projectActionCalendarSync.service.js::onActionCreated — pas de vraie
// transaction possible à travers un appel HTTP externe) : un échec Google
// laisse le Task CRM en place (jamais annulé rétroactivement) et est
// enregistré honnêtement (`synced:false`, `error`) plutôt que silencieux.
async function createCopilotMeeting({ actingUserId, payload, tool }) {
  let task;
  try {
    task = await createCrmTask({ actingUserId, payload });
  } catch (err) {
    return { crmCreated: false, crmEventId: null, crmError: err.message, googleCreated: false, googleEventId: null, googleEventLink: null, googleError: null };
  }

  let googleResult;
  try {
    googleResult = await createGoogleEvent({ tool, payload });
  } catch (err) {
    googleResult = { success: false, error: err.message };
  }

  try {
    const { upsertSync } = require("./multiRecipientCalendarSync.service");
    if (googleResult.success) {
      await upsertSync(ENTITY_TYPE, task.id, actingUserId, {
        taskId: task.id,
        googleEventId: googleResult.eventId,
        googleEventLink: googleResult.eventLink || null,
        calendarId: googleResult.calendarId || "primary",
        synced: true,
        error: null,
        googleUpdatedAt: new Date(),
      });
    } else {
      await upsertSync(ENTITY_TYPE, task.id, actingUserId, {
        taskId: task.id,
        synced: false,
        error: googleResult.error || "Échec de la création Google Calendar",
      });
    }
  } catch (linkErr) {
    // La liaison CalendarEventSync elle-même a échoué (ex. contrainte DB) —
    // le Task CRM et l'éventuel événement Google réels ne sont pas perdus,
    // mais leur lien ne l'est pas non plus caché : reflété dans crmError.
    return {
      crmCreated: true,
      crmEventId: task.id,
      crmError: `Réunion CRM créée mais liaison CalendarEventSync échouée : ${linkErr.message}`,
      googleCreated: Boolean(googleResult.success),
      googleEventId: googleResult.success ? googleResult.eventId : null,
      googleEventLink: googleResult.success ? googleResult.eventLink || null : null,
      googleError: googleResult.success ? null : googleResult.error || "Échec de la création Google Calendar",
    };
  }

  return {
    crmCreated: true,
    crmEventId: task.id,
    crmError: null,
    googleCreated: Boolean(googleResult.success),
    googleEventId: googleResult.success ? googleResult.eventId : null,
    googleEventLink: googleResult.success ? googleResult.eventLink || null : null,
    googleError: googleResult.success ? null : googleResult.error || "Échec de la création Google Calendar",
  };
}

module.exports = { createCopilotMeeting, createCrmTask, createGoogleEvent, ENTITY_TYPE };
