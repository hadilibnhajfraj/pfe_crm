"use strict";

const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const ctrl = require("../controllers/aiCopilot.controller");
const bridge = require("../services/aiCopilotBridge.service");
const { authRequired } = require("../../../middleware/auth.middleware");
const { copilotDocumentUpload } = require("../../../middleware/copilotDocumentUpload.middleware");

// Every route requires an authenticated caller (coarse gate), then the
// AI_COPILOT_ENABLED/AI_COPILOT_ROLES_ALLOWED gate (fine gate, per-role) —
// same two-tier pattern as modules/ai-dashboard, but this second tier is
// NEW: ai-dashboard has no AiManager gate at all (its own permission model
// lives in DashboardService/DomainAnalyzer instead). The Copilot's
// conversational surface is guarded by BOTH: this gate first (a hard
// "feature is off" / "role not on the allow-list" 403), then AIManager's
// own per-intent permission check inside the envelope (a per-question
// refusal, never a thrown exception — see aiCopilot.controller.js).
router.use(authRequired);

// Le message ne cite JAMAIS une valeur supposée de AI_COPILOT_ENABLED — un
// message du type "(AI_COPILOT_ENABLED=true)" affiché alors que cette
// branche vient de constater `isEnabled() === false` est nécessairement
// FAUX (contradictoire pour qui le lit) : soit une simple affirmation
// périmée, soit trompeuse quant à la vraie cause (le plus souvent, la
// variable est absente du .env réellement chargé — voir
// ai.config.js::loadAiConfig, qui logge la valeur réellement lue au
// démarrage, `[AI-COPILOT] enabled=...`, pour un diagnostic fiable).
//
// Délègue la décision ENTIÈRE à bridge.canUseAiCopilot(req.user) — une
// SEULE source de vérité (AiManager.canUseAiCopilot(), voir aiManager.js),
// partagée avec aiCopilotSocket.js, jamais une seconde liste de rôles ou un
// second if/else recopié ici. Journalise elle-même la décision
// (`[AI-COPILOT] permission check ...`) — voir la doc de la fonction.
function requireCopilotEnabled(req, res, next) {
  const decision = bridge.canUseAiCopilot(req.user);
  if (decision.allowed) return next();
  if (decision.reason === "copilot_disabled") {
    return res.status(503).json({ success: false, message: "Le Copilot IA est actuellement désactivé.", reason: "copilot_disabled" });
  }
  return res.status(403).json({ success: false, message: "Votre rôle n'est pas autorisé à utiliser le Copilot IA.", reason: "role_not_allowed" });
}
router.use(requireCopilotEnabled);

const isTestEnv = () => process.env.NODE_ENV === "test";

// A conversational turn calls a real LLM (network round-trip, real cost) —
// a tighter budget than the dashboard's read-only 60/min.
const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});

// Listing/reading history is cheap (in-memory lookups, no LLM call) — same
// budget as the dashboard.
const readLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});

router.post("/chat", chatLimiter, ctrl.chat);
router.get("/conversations/:id", readLimiter, ctrl.getConversation);
router.get("/conversations", readLimiter, ctrl.listConversations);
router.get("/dashboard", readLimiter, ctrl.dashboard);
// Proactive AI — confirmer/rejeter un workflow proposé par une alerte
// proactive : exécute un Tool d'écriture réel (confirm) ou consomme la
// proposition sans rien exécuter (reject) — le même budget resserré que
// /chat, jamais celui, plus large, réservé aux lectures.
router.post("/proactive/:workflowId/confirm", chatLimiter, ctrl.confirmProactiveWorkflow);
router.post("/proactive/:workflowId/reject", chatLimiter, ctrl.rejectProactiveWorkflow);
// Export PDF d'un rapport déjà généré par /chat (intent `reporting`) — mise
// en page uniquement, aucun appel LLM : le budget large de lecture, pas
// celui, resserré, réservé aux tours de conversation.
router.post("/reports/pdf", readLimiter, ctrl.reportPdf);

// Phase 2 — documents du Copilot (assistant documentaire). Mêmes gardes que
// tout /ai-copilot (authRequired + requireCopilotEnabled, voir plus haut) ;
// envoi limité à 10 fichiers/minute/utilisateur.
const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isTestEnv,
});
router.post("/documents", uploadLimiter, copilotDocumentUpload, ctrl.uploadDocument);
router.get("/documents", readLimiter, ctrl.listDocuments);
router.delete("/documents/:id", readLimiter, ctrl.deleteDocument);

module.exports = router;
