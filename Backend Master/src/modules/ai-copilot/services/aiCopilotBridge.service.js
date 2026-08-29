"use strict";

// Thin bridge between the HTTP/WebSocket delivery layer and the AI kernel
// (src/ai/orchestrator) — mirrors modules/ai-dashboard/services/
// aiDashboardBridge.service.js exactly: one of only two files under
// modules/ai-copilot/ that touch src/ai/ directly (the other is
// dashboardBriefing.service.js, for the AI Dashboard — deliberately kept
// separate since it needs NO ILlmProvider at all), so routes/controllers/
// the socket handler stay ordinary Express/Socket.IO code, easy to test
// with a mocked bridge.
//
// Unlike the dashboard bridge (which rebuilds a cheap, stateless
// DashboardService fresh on every request), a Copilot conversation carries
// state that MUST survive across requests for the same user: the shared
// conversation memory (createAiOrchestrator()'s `sharedMemory`) and the
// AutomationAgent's `pendingActionStore` ("proposed, awaiting confirmation"
// — see AUTOMATION_WORKFLOWS.md). Rebuilding the orchestrator per request
// would silently forget every pending automation and conversation history
// on the very next message. So this bridge caches ONE createAiOrchestrator()
// instance PER actingUser.id, built lazily on that user's first message and
// reused after — the McpServer, RAG pipeline and llmProvider underneath are
// all cheap-to-share, process-wide singletons (same reasoning as
// aiDashboardBridge's McpServer singleton), only the per-user orchestrator
// itself is NOT shared, because Tool calls are fixed to one identity at
// construction (see langchain/tools/mcpToolAdapter.js).
//
// Known limitation, same one already documented for
// InMemoryConversationMemory/ConversationIndexService: everything here is
// in-process and volatile — a restart forgets every conversation and every
// pending automation. Acceptable for this pass, not hidden.

const { v4: uuidv4 } = require("uuid");
const { createServer } = require("../../../ai/mcp/server/start");
const { createAiOrchestrator } = require("../../../ai/orchestrator/pipeline");
const { createRagPipeline } = require("../../../ai/rag/pipeline");
const { DEFAULT_CORPUS_ROOTS } = require("../../../ai/rag/reindex");
const { createSecurityPipeline } = require("../../../ai/security");
const { createDefaultAiManager } = require("../../../ai/manager");
const { withNamespace } = require("../../../ai/utils/logger");
const { ConversationIndexService } = require("./conversationIndex.service");
const { getProactiveActionStore } = require("../../../ai/proactive/proactiveActionStore");
// AI-Business-Copilot/30_MEETING_AGENT_NO_LLM_FOR_MISSING_FIELDS.md — le
// VRAI point d'injection de ce service CRM : rien sous src/ai/ (agents/ ET
// orchestrator/, voir leurs policy tests respectifs) n'a le droit de le
// require() lui-même — createAiOrchestrator() le reçoit ici, exactement
// comme llmProvider/retriever/mcpServer.
const { createCopilotMeeting } = require("../../../services/meetingCopilotSync.service");
// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — même discipline
// que createCopilotMeeting ci-dessus : `middleware/moduleAccessGuard.js`
// vit hors de `src/ai/`, injecté dans createAiOrchestrator() plutôt que
// require() directement sous src/ai/. Une seule source de vérité pour cette
// restriction — que ce soit le middleware Express ou RoleCapabilityAuditAgent
// (via CapabilityMatrixService) qui la consulte.
const { ALLOWED_PREFIXES_BY_ROLE } = require("../../../middleware/moduleAccessGuard");

const logger = withNamespace("copilot:http");

let securityPipelineSingleton = null;
let mcpServerSingleton = null;
let ragPipelineSingleton = null;
let ragIngestionPromise = null;
let gateManagerSingleton = null;
const orchestratorsByUserId = new Map();
const conversationIndex = new ConversationIndexService();

function getSecurityPipeline() {
  if (!securityPipelineSingleton) securityPipelineSingleton = createSecurityPipeline();
  return securityPipelineSingleton;
}

function getMcpServer() {
  if (!mcpServerSingleton) {
    const security = getSecurityPipeline();
    mcpServerSingleton = createServer({ rateLimiter: security.rateLimiter, auditLog: security.auditLog });
  }
  return mcpServerSingleton;
}

function getRagPipeline() {
  if (!ragPipelineSingleton) {
    ragPipelineSingleton = createRagPipeline({ allowedRoots: DEFAULT_CORPUS_ROOTS });
  }
  return ragPipelineSingleton;
}

// Ingests the real docs/ corpus into the shared in-memory vector store
// exactly once for the lifetime of this process — see
// docs/admin-guide/copilot-administration.md ("reindex.js est un script de
// démo... appeler ingestDirectories une fois au démarrage d'un process
// long-vivant"). This bridge singleton IS that long-lived process; every
// caller awaits the SAME promise, so concurrent first-requests never
// trigger a duplicate ingestion.
function ensureRagIngested() {
  if (!ragIngestionPromise) {
    ragIngestionPromise = getRagPipeline().ingestionService.ingestDirectories(DEFAULT_CORPUS_ROOTS);
  }
  return ragIngestionPromise;
}

// AI_COPILOT_ENABLED/AI_COPILOT_ROLES_ALLOWED/AI_LLM_* gate — the SAME
// AiManager class (src/ai/manager) already documented as "built but never
// mounted anywhere" before this module. Also the source of the real
// llmProvider adapter (see services/providers/index.js), reused below
// rather than rebuilt per user.
function getGateManager() {
  if (!gateManagerSingleton) gateManagerSingleton = createDefaultAiManager();
  return gateManagerSingleton;
}

function isEnabled() {
  return getGateManager().isEnabled();
}

function isRoleAllowed(role) {
  return getGateManager().isRoleAllowed(role);
}

// Single source of truth for "can this caller use the Copilot at all" —
// see AiManager.canUseAiCopilot() for the actual enabled+role decision.
// Both HTTP (aiCopilot.routes.js) and WebSocket (aiCopilotSocket.js) call
// ONLY this, so there is exactly one place that decides + one place that
// logs the decision — never two copies of the same if/else to keep in
// sync. `user` accepts either the raw JWT payload ({sub, role, email}, see
// authRequired) or an already-mapped actingUser ({id, role, email}) — only
// `.role` is read for the decision itself.
//
// [AI-COPILOT] permission check — logged on EVERY call, success or
// refusal, precisely so a "role not allowed" report can be diagnosed from
// `pm2 logs` alone. Never the JWT, never a token, never a password — only
// the user id and role (already non-secret: visible in any admin screen
// listing users) and the boolean outcome.
function canUseAiCopilot(user) {
  const decision = getGateManager().canUseAiCopilot(user);
  const userId = (user && (user.sub || user.id)) || "unknown";
  const role = (user && user.role) || "unknown";
  logger.info(`[AI-COPILOT] permission check userId=${userId} role=${role} allowed=${decision.allowed}`);
  return decision;
}

// req.user is the JWT payload set by middleware/auth.middleware.js:
// { sub, email, role } — never { id, ... }. Same mapping as
// aiDashboardBridge.service.js::toActingUser, done exactly once here.
function toActingUser(reqUser) {
  return { id: reqUser.sub, role: reqUser.role, email: reqUser.email };
}

function getOrchestratorFor(actingUser) {
  let orchestrator = orchestratorsByUserId.get(actingUser.id);
  if (!orchestrator) {
    const security = getSecurityPipeline();
    orchestrator = createAiOrchestrator({
      llmProvider: getGateManager().requireLlmProvider(),
      retriever: getRagPipeline().retrievalService,
      mcpServer: getMcpServer(),
      actingUser,
      promptInjectionGuard: security.promptInjectionGuard,
      auditLog: security.auditLog,
      createCopilotMeeting,
      moduleAccessByRole: ALLOWED_PREFIXES_BY_ROLE,
    });
    orchestratorsByUserId.set(actingUser.id, orchestrator);
    logger.info(`orchestrator built for user ${actingUser.id}`);
  }
  return orchestrator;
}

// The one real conversational turn — POST /ai-copilot/chat AND the
// WebSocket "ai-copilot:send" event both funnel through
// sendMessageAsActingUser(), so the two transports can never drift in
// behaviour. Takes an ALREADY-MAPPED actingUser ({id, role, email}) because
// the two transports don't agree on the raw shape: Express's req.user is
// {sub, role, email} (see toActingUser()), but socket.js's own handshake
// auth already normalises socket.user to {id, role, email} (see
// socket.js::_authenticate) — mapping happens once, at the edge of each
// transport, never twice.
// AI-Business-Copilot/33_PAGE_CONTEXT_INTENT_CONTAMINATION.md — reproduit en
// direct : l'ancien mécanisme "Context Awareness" (voir historique git de ce
// fichier / pageContextFormatter.js) prépendait un préfixe factuel
// ("[Contexte d'écran actuellement affiché : le tableau de bord.]") au
// message AVANT AIManager.handleMessage(), avec une garde "n'ajoute le
// préfixe que si le message brut seul est general_chat". Cette garde ne
// protégeait que la moitié du problème : elle vérifiait le message AVANT
// concaténation, jamais APRÈS — et le préfixe lui-même porte de VRAIS
// mots-clés du catalogue ("tableau"/"bord", voir intentCatalog.js, entrée
// "dashboard") : "Créer une activité"/"Préparer un email" (aucun mot-clé
// propre, general_chat légitime) devenaient, une fois préfixés,
// "[...le tableau de bord.]\n\nCréer une activité" — classés "dashboard" par
// le VRAI IntentDetector à l'intérieur d'AIManager, routés vers kpi_agent,
// qui renvoyait un rapport KPI sans aucun rapport avec la demande.
//
// Architecture corrigée, demandée explicitement : message utilisateur ->
// IntentDetector -> intention -> AgentRouter+RBAC -> agent, `pageContext`
// (et le rôle, déjà lu uniquement depuis `actingUser`/le JWT — jamais depuis
// `pageContext` ni le texte du message, voir `toActingUser()` plus haut)
// restant une information auxiliaire qui ne doit JAMAIS influencer cette
// chaîne. La seule façon de le garantir avec la surface actuelle
// d'AIManager.handleMessage() (qui n'a — et n'a jamais eu — de second
// paramètre "contexte", voir l'ancien commentaire de tête de
// pageContextFormatter.js) est de ne plus jamais faire transiter
// `pageContext` par le texte classé par IntentDetector : `message` est donc
// désormais TOUJOURS transmis tel quel, jamais réécrit. `pageContext` reste
// accepté dans la signature (compatibilité du contrat HTTP/WebSocket
// existant, voir aiCopilot.controller.js/aiCopilotSocket.js) mais n'est plus
// utilisé ici — `formatPageContext()`/`getContextGateDetector()` (l'ancien
// mécanisme) ont été retirés avec lui, devenus du code mort une fois leur
// unique appelant supprimé. `pageContextFormatter.js` lui-même n'est pas
// supprimé (fonction pure, sa propre suite de tests existante) au cas où un
// futur canal RÉELLEMENT auxiliaire (jamais vu par IntentDetector) serait
// construit plus tard.
async function sendMessageAsActingUser(actingUser, { message, conversationId, pageContext: _pageContext }) {
  await ensureRagIngested();
  const orchestrator = getOrchestratorFor(actingUser);
  const effectiveConversationId = conversationId || uuidv4();

  const response = await orchestrator.aiManager.handleMessage({
    message,
    user: actingUser,
    conversationId: effectiveConversationId,
  });

  if (response.conversationId) {
    conversationIndex.touch(actingUser.id, response.conversationId, {
      preview: response.answer,
      intent: response.intent,
    });
  }
  return response;
}

async function sendMessage(reqUser, opts) {
  return sendMessageAsActingUser(toActingUser(reqUser), opts);
}

function listConversations(reqUser, options) {
  return conversationIndex.list(toActingUser(reqUser).id, options);
}

// Returns `null` (never an empty array) when the caller never owned this
// conversationId — the controller turns that into 404, never a silent
// empty history that could be mistaken for "conversation exists but is
// empty".
async function getConversationHistory(reqUser, conversationId, options = {}) {
  const actingUser = toActingUser(reqUser);
  if (!conversationIndex.isOwner(actingUser.id, conversationId)) {
    return null;
  }
  const orchestrator = getOrchestratorFor(actingUser);
  return orchestrator.conversationManager.getHistory(conversationId, options);
}

// Proactive AI — confirmer/rejeter un workflow proposé par une alerte
// proactive (voir src/ai/proactive/, ProactiveActionStore). Contrairement à
// un message de chat ("confirme"/"annule", voir AutomationAgent), c'est un
// appel HTTP direct sur un `workflowId` précis — jamais une correspondance
// implicite avec "la dernière chose proposée" : il n'y a pas de
// `conversationId` ici, l'alerte n'est jamais née d'une conversation.
//
// `null`/`false` (jamais une exception) quand le workflow n'existe plus, a
// expiré (TTL 48h), ou n'a jamais été proposé à CET appelant précisément —
// le contrôleur traduit ça en 404, jamais en révélant si le workflow existe
// pour QUELQU'UN D'AUTRE (même discipline que
// getConversationHistory()/conversationIndex.isOwner ci-dessus).
async function confirmProactiveWorkflow(reqUser, workflowId) {
  const actingUser = toActingUser(reqUser);
  const store = getProactiveActionStore();
  const pending = store.peek(workflowId);
  if (!pending || pending.recipientUserId !== actingUser.id) {
    return null;
  }
  store.consume(workflowId);

  const server = getMcpServer();
  const response = await server.handleMessage({
    jsonrpc: "2.0",
    id: uuidv4(),
    method: "tools/call",
    params: { name: pending.tool, arguments: pending.input, actingUser },
  });

  if (response && response.error) {
    throw new Error(response.error.message || "Échec de l'exécution du workflow.");
  }

  const rawResult = response && response.result && response.result.content && response.result.content[0];
  let output = null;
  if (rawResult && rawResult.text) {
    try {
      output = JSON.parse(rawResult.text);
    } catch {
      output = null;
    }
  }

  return { workflowId, label: pending.label, domain: pending.domain, subject: pending.subject, result: output };
}

function rejectProactiveWorkflow(reqUser, workflowId) {
  const actingUser = toActingUser(reqUser);
  const store = getProactiveActionStore();
  const pending = store.peek(workflowId);
  if (!pending || pending.recipientUserId !== actingUser.id) {
    return false;
  }
  store.consume(workflowId);
  return true;
}

module.exports = {
  isEnabled,
  isRoleAllowed,
  canUseAiCopilot,
  toActingUser,
  sendMessage,
  sendMessageAsActingUser,
  listConversations,
  getConversationHistory,
  confirmProactiveWorkflow,
  rejectProactiveWorkflow,
};
