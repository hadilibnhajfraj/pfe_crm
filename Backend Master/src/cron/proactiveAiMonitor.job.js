"use strict";

// Proactive AI — surveille projets/ventes/activités/échéances/interventions/
// KPI SANS qu'une question soit posée (voir src/ai/proactive/PROACTIVE_AI.md).
// Un risque détecté devient une alerte réelle (e-mail + notification in-app
// + push temps réel) — jamais une action métier exécutée automatiquement.
//
// Résolution de l'identité agissante : contrairement au reste de
// `src/ai/`, qui reçoit toujours un `actingUser` réel depuis une requête
// HTTP authentifiée, un cron n'a personne "connecté" — le premier compte
// admin-tier actif est résolu ICI (lecture Sequelize directe, comme
// `cron/followup.job.js` le fait déjà pour d'autres besoins — ce fichier
// est un point d'ENTRÉE/bootstrap, pas du code sous `src/ai/`, donc hors du
// périmètre de la règle "l'IA n'accède jamais directement à Sequelize"
// vérifiée par `test/ai.mcp.tools.policy.test.js`/`ai.agents.policy.test.js`,
// qui ne scanne que `src/ai/mcp/tools/`/`src/ai/agents/`).

const cron = require("node-cron");
const { Op } = require("sequelize");
const User = require("../models/User");
const { createServer } = require("../ai/mcp/server/start");
const { createProactivePipeline } = require("../ai/proactive/pipeline");
const { emitToUser } = require("../socket");
// ⚠️ TEMPORAIRE — voir src/diagnostics/crashDiagnostics.js (mission crash cron).
const { setCronContext } = require("../diagnostics/crashDiagnostics");

console.log("🔥 PROACTIVE AI MONITOR CRON LOADED");

const ADMIN_TIER_ROLES = ["admin", "superadmin", "superadmin2"];
const AI_PROACTIVE_MONITORING_ENABLED = process.env.AI_PROACTIVE_MONITORING_ENABLED === "true";

let mcpServerSingleton = null;
function getMcpServer() {
  if (!mcpServerSingleton) mcpServerSingleton = createServer();
  return mcpServerSingleton;
}

async function resolveActingUser() {
  const admin = await User.findOne({ where: { role: { [Op.in]: ADMIN_TIER_ROLES }, isActive: true }, order: [["createdAt", "ASC"]] });
  return admin ? { id: admin.id, role: admin.role, email: admin.email } : null;
}

async function runProactiveMonitoring() {
  const actingUser = await resolveActingUser();
  if (!actingUser) {
    console.warn("[proactiveAiMonitor] Aucun compte admin-tier actif trouvé — surveillance ignorée pour ce cycle.");
    return { alertsCount: 0, dispatched: null };
  }

  const { monitor, dispatcher, listUsersByRoleTool } = createProactivePipeline({ mcpServer: getMcpServer(), actingUser, emitToUser });

  const alerts = await monitor.detectAlerts();
  if (alerts.length === 0) {
    console.log("[proactiveAiMonitor] Aucun risque détecté sur ce cycle.");
    return { alertsCount: 0, dispatched: null };
  }

  const rawRecipients = await listUsersByRoleTool.invoke({ role: "admin" });
  const recipients = JSON.parse(rawRecipients);
  const dispatched = await dispatcher.dispatch(alerts, recipients);

  console.log(`[proactiveAiMonitor] ${alerts.length} alerte(s) détectée(s), ${dispatched.sent.length} envoi(s) réussi(s), ${dispatched.errors.length} échec(s).`);
  return { alertsCount: alerts.length, dispatched };
}

if (AI_PROACTIVE_MONITORING_ENABLED) {
  // Une fois par jour à 7h du matin (heure Tunis) — avant le début de la
  // journée de travail, pour que les alertes de la veille soient visibles
  // dès la connexion.
  cron.schedule(
    "0 7 * * *",
    () => {
      setCronContext("PROACTIVE AI MONITOR", "start"); // ⚠️ TEMPORAIRE — diagnostic crash
      runProactiveMonitoring()
        .then(() => setCronContext("PROACTIVE AI MONITOR", "end")) // ⚠️ TEMPORAIRE — diagnostic crash
        .catch((err) => console.error("❌ [proactiveAiMonitor] cron error:", err.message));
    },
    { timezone: "Africa/Tunis" }
  );
} else {
  console.log("[proactiveAiMonitor.job] AI_PROACTIVE_MONITORING_ENABLED=false — cron NOT scheduled.");
}

module.exports = { runProactiveMonitoring, resolveActingUser };
