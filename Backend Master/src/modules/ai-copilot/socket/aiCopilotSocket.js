"use strict";

// Real-time delivery for the Copilot: typing indicator + an artificial
// "streaming reveal" of an already-complete answer (see
// services/streamingChunker.js for why this isn't genuine token
// streaming), over the SAME authenticated Socket.IO connection every other
// real-time feature in this backend already uses (src/socket.js).
//
// Deliberately NOT wired inside src/socket.js itself: that file is
// required directly by several lightweight call sites (cron jobs,
// followupAutomation.service.js, test/socket.test.js) that must NOT
// transitively load the MCP/RAG/orchestrator stack (and, through
// mcp/server/start.js, every Sequelize model) just to get emitToUser().
// Instead, `attach(io)` is called once, from src/app.js's start() —
// exactly the same guarded block that already calls socket.init(httpServer)
// — and registers itself as an ADDITIONAL "connection" listener (Socket.IO
// runs every listener registered via io.on("connection", ...), so this
// never replaces socket.js's own room-join logic, only adds to it).
//
// Events (all under the caller's own authenticated room, user:${id} — see
// socket.js::_authenticate/emitToUser, never a client-chosen id):
//   IN  "ai-copilot:send"     { message, conversationId?, pageContext? }    — pageContext: Context Awareness, see pageContextFormatter.js
//   OUT "ai-copilot:typing"   { conversationId }                          — sent immediately
//   OUT "ai-copilot:chunk"    { conversationId, text }                    — 1..N, artificial reveal
//   OUT "ai-copilot:complete" { ...full ResponseBuilder envelope }        — always last on success
//   OUT "ai-copilot:error"    { message }                                 — instead of chunk/complete on failure

const { emitToUser } = require("../../../socket");
const bridge = require("../services/aiCopilotBridge.service");
const { chunkAnswerForStreaming } = require("../services/streamingChunker");
const { classifyAiCopilotError } = require("../services/errorClassifier");
const { withNamespace } = require("../../../ai/utils/logger");

const logger = withNamespace("copilot:socket");

const DEFAULT_CHUNK_DELAY_MS = 35;
const defaultWait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function attach(io, { chunkDelayMs = DEFAULT_CHUNK_DELAY_MS, wait = defaultWait } = {}) {
  io.on("connection", (socket) => {
    socket.on("ai-copilot:send", async (payload) => {
      const { message, conversationId = null, pageContext = null } = payload || {};
      const userId = socket.user.id;

      if (typeof message !== "string" || !message.trim()) {
        emitToUser(userId, "ai-copilot:error", { message: "'message' is required and must be a non-empty string." });
        return;
      }
      // Même source de vérité unique que la route HTTP — voir
      // aiCopilot.routes.js::requireCopilotEnabled.
      const decision = bridge.canUseAiCopilot(socket.user);
      if (!decision.allowed) {
        const message = decision.reason === "copilot_disabled" ? "Le Copilot IA est actuellement désactivé." : "Votre rôle n'est pas autorisé à utiliser le Copilot IA.";
        emitToUser(userId, "ai-copilot:error", { message });
        return;
      }

      emitToUser(userId, "ai-copilot:typing", { conversationId });

      try {
        const response = await bridge.sendMessageAsActingUser(socket.user, { message, conversationId, pageContext });

        const chunks = chunkAnswerForStreaming(response.answer);
        for (const chunk of chunks) {
          emitToUser(userId, "ai-copilot:chunk", { conversationId: response.conversationId, text: chunk });
          if (chunkDelayMs > 0) await wait(chunkDelayMs);
        }

        emitToUser(userId, "ai-copilot:complete", response);
      } catch (err) {
        const { code, message } = classifyAiCopilotError(err);
        logger.error(`ai-copilot:send failed for user ${userId} [${code}]: ${err.message}`);
        emitToUser(userId, "ai-copilot:error", { message, reason: code });
      }
    });
  });
}

module.exports = { attach };
