"use strict";

const bridge = require("../services/aiCopilotBridge.service");
const dashboardBriefing = require("../services/dashboardBriefing.service");
const { buildReportPdf } = require("../services/reportPdf.service");
const { classifyAiCopilotError } = require("../services/errorClassifier");
const { withNamespace } = require("../../../ai/utils/logger");

const logger = withNamespace("copilot:http");

// Classifie CHAQUE erreur qui atteint un contrôleur de ce module en une
// famille stable (`errorClassifier.js`) — jamais un seul "Internal server
// error" fourre-tout. Corrige l'incident où une VRAIE panne PostgreSQL
// (`SequelizeDatabaseError`, colonne manquante — voir
// AI-Business-Copilot/07_INCIDENT_COPILOT_DATEEXPIRATION.md) n'était
// distinguable, côté client, d'aucune autre panne 500 — jamais confondue
// avec `AI_PROVIDER_NOT_CONFIGURED` (503, fournisseur LLM réellement
// absent) : deux causes, deux codes, jamais le même message pour les deux.
// `err.message`/`err.stack` ne sont JAMAIS transmis au client — le
// classifieur choisit un message fixe par famille, jamais un détail
// interne (PostgreSQL, secrets, chemin de fichier...).
function handle(res, err) {
  const { code, status, message } = classifyAiCopilotError(err);
  logger.error(`[${code}] ${err && err.message}`, err);
  // `reason` — même nom de champ que la porte d'entrée du module
  // (`copilot_disabled`/`role_not_allowed`, voir aiCopilot.routes.js) :
  // un seul contrat de réponse d'erreur pour tout /ai-copilot, jamais deux
  // noms de champ différents selon l'étape où l'échec survient.
  return res.status(status).json({ success: false, message, reason: code });
}

// POST /ai-copilot/chat — { message, conversationId?, pageContext? } -> the
// full ResponseBuilder envelope (see src/ai/orchestrator/responseBuilder.js).
// Always 200 even for a permission/validation refusal: AIManager itself
// never throws for those (they come back as `mode: "error"` inside the
// envelope, already safe to show — see aiManager.js's own catch-all) — only
// a genuinely unexpected failure (kernel misconfiguration, LLM/network
// outage) reaches this controller's own try/catch.
//
// `pageContext` (Context Awareness — voir pageContextFormatter.js) : un
// objet libre `{screen, label?, data?}` décrivant où se trouve l'utilisateur
// côté Flutter au moment de l'envoi. Jamais validé par un schéma strict ici
// — formatPageContext() est déjà défensif (typeof partout, tronque, ignore
// silencieusement tout ce qui est malformé plutôt que de rejeter la
// requête) : un pageContext cassé ne doit jamais empêcher un message
// d'aboutir.
async function chat(req, res) {
  const { message, conversationId, pageContext } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, message: "'message' is required and must be a non-empty string." });
  }
  try {
    const data = await bridge.sendMessage(req.user, { message, conversationId: conversationId || null, pageContext: pageContext || null });
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

// GET /ai-copilot/conversations — this user's own conversation history
// list (id/preview/intent/updatedAt), newest first.
async function listConversations(req, res) {
  const limit = Number.parseInt(req.query.limit, 10);
  try {
    const data = bridge.listConversations(req.user, { limit: Number.isFinite(limit) && limit > 0 ? limit : undefined });
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

// GET /ai-copilot/conversations/:id — full message history of ONE
// conversation, only if it belongs to the caller (never another user's,
// even if the id is guessed) — see aiCopilotBridge.getConversationHistory().
async function getConversation(req, res) {
  try {
    const history = await bridge.getConversationHistory(req.user, req.params.id);
    if (history === null) {
      return res.status(404).json({ success: false, message: "Conversation not found." });
    }
    res.json({ success: true, data: { conversationId: req.params.id, messages: history } });
  } catch (err) {
    handle(res, err);
  }
}

// GET /ai-copilot/dashboard — AI Dashboard : le briefing proactif affiché à
// l'ouverture du Copilot (greeting, compteurs du jour, qualité CRM, cartes
// de risque/recommandation, timeline, graphique) — voir
// dashboardBriefing.service.js. Aucune dépendance LLM (contrairement à
// /chat) : ne renvoie donc jamais 503 NotConfiguredError, seulement 500 pour
// un échec réellement inattendu.
async function dashboard(req, res) {
  try {
    const data = await dashboardBriefing.getDashboardBriefing(req.user);
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

// POST /ai-copilot/proactive/:workflowId/confirm — Proactive AI : EXÉCUTE
// réellement le workflow proposé par une alerte proactive (voir
// src/ai/proactive/) — seulement si l'appelant est exactement le
// destinataire à qui il a été proposé, et une seule fois (consommé
// immédiatement, jamais ré-exécutable). 404 si expiré/déjà traité/jamais
// proposé à cet utilisateur — jamais une confirmation "au nom de" quelqu'un
// d'autre, et jamais une distinction visible entre ces 3 cas (qui
// révélerait l'existence d'un workflow appartenant à un autre utilisateur).
async function confirmProactiveWorkflow(req, res) {
  try {
    const result = await bridge.confirmProactiveWorkflow(req.user, req.params.workflowId);
    if (result === null) {
      return res.status(404).json({ success: false, message: "Ce workflow n'existe plus, a expiré, ou ne vous a pas été proposé." });
    }
    res.json({ success: true, data: result });
  } catch (err) {
    handle(res, err);
  }
}

// POST /ai-copilot/proactive/:workflowId/reject — écarte le workflow SANS
// jamais l'exécuter — même contrôle de propriété que confirm ci-dessus.
async function rejectProactiveWorkflow(req, res) {
  try {
    const rejected = bridge.rejectProactiveWorkflow(req.user, req.params.workflowId);
    if (!rejected) {
      return res.status(404).json({ success: false, message: "Ce workflow n'existe plus, a expiré, ou ne vous a pas été proposé." });
    }
    res.json({ success: true });
  } catch (err) {
    handle(res, err);
  }
}

// POST /ai-copilot/reports/pdf — { title?, content } -> un vrai fichier PDF
// (voir reportPdf.service.js). Toujours le texte déjà produit par une
// réponse `reporting` de /chat (`response.answer`) : le client renvoie
// exactement ce qu'il a déjà reçu et affiché — ce endpoint ne fait QUE la
// mise en page PDF, jamais un nouvel appel LLM, jamais de lecture depuis une
// conversation stockée (aucun risque de renvoyer le rapport d'un autre
// utilisateur via un id deviné). Sans état : rien n'est écrit sur disque.
async function reportPdf(req, res) {
  const { title, content } = req.body || {};
  if (typeof content !== "string" || !content.trim()) {
    return res.status(400).json({ success: false, message: "'content' is required and must be a non-empty string." });
  }
  try {
    const doc = buildReportPdf({ title: typeof title === "string" ? title : "", content });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'inline; filename="rapport-copilot.pdf"');
    doc.pipe(res);
    doc.end();
  } catch (err) {
    handle(res, err);
  }
}

module.exports = { chat, listConversations, getConversation, dashboard, confirmProactiveWorkflow, rejectProactiveWorkflow, reportPdf };
