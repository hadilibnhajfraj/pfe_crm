"use strict";

const { BaseAgent } = require("./baseAgent");

// Les 5 Tools du module Notifications (voir mcp/tools/notifications/).
const ALLOWED_TOOL_NAMES = [
  "list_my_notifications",
  "mark_notification_read",
  "mark_all_notifications_read",
  "delete_notification",
  "send_notification_email",
];

const SYSTEM_PROMPT = [
  "Tu es l'Agent Notifications du CRM CBI Tunisia.",
  "Tu aides l'utilisateur à consulter ses notifications, les marquer comme",
  "lues et les supprimer, exclusivement via les Tools fournis.",
  "Ne marque comme lues ou ne supprime que les notifications explicitement",
  "désignées par l'utilisateur, jamais l'intégralité sans confirmation claire.",
].join(" ");

/**
 * NotificationAgent — prend en charge l'intention `notifications`.
 * Permissions laissées ouvertes au niveau de l'Agent : les 4 premiers Tools
 * sont ouverts à tout authentifié (chacun scope déjà ses données à
 * l'`actingUser` côté service), seul `send_notification_email` exige
 * `admin`/`superadmin`/`superadmin2` au niveau du Tool lui-même (voir
 * mcp/tools/notifications/sendNotificationEmailTool.js).
 */
function createNotificationAgent({ chatModel, tools = [], workflowEngine, qaChain = null, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "notification_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["notifications"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    qaChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createNotificationAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
