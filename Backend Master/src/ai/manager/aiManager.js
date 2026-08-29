"use strict";

const { withNamespace } = require("../utils/logger");
const { NotConfiguredError } = require("../utils/errors");

const logger = withNamespace("manager");

// Composition root for the AI kernel (SOLID-DIP): depends only on
// abstractions (ports) injected through the constructor, never on a
// concrete LLM SDK, vector DB, or MCP transport. See
// AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md §4, §10.1.
class AiManager {
  constructor({
    config,
    eventBus,
    memory,
    promptRepository,
    toolRegistry,
    workflowRunner,
    agentRegistry,
    mcpClient = null,
    retriever = null,
    vectorStore = null,
    llmProvider = null,
    guardrails = null,
    contextBuilder = null,
  }) {
    this.config = config;
    this.eventBus = eventBus;
    this.memory = memory;
    this.promptRepository = promptRepository;
    this.toolRegistry = toolRegistry;
    this.workflowRunner = workflowRunner;
    this.agentRegistry = agentRegistry;
    // Left unset on purpose: agents/mcp/rag/vector/llmProvider/guardrails/
    // contextBuilder are out of scope for this infrastructure pass.
    this.mcpClient = mcpClient;
    this.retriever = retriever;
    this.vectorStore = vectorStore;
    this.llmProvider = llmProvider;
    this.guardrails = guardrails;
    this.contextBuilder = contextBuilder;

    logger.info(`kernel initialised (enabled=${this.config.enabled})`);
  }

  isEnabled() {
    return this.config.enabled;
  }

  // Normalizes ONLY for comparison (trim + lowercase) — never mutates the
  // stored DB value or the caller's `role` string. Guards against the
  // classic sources of a false "not allowed": a role read with incidental
  // whitespace, or a AI_COPILOT_ROLES_ALLOWED entry typed with a different
  // case than the Sequelize ENUM (`src/models/User.js`) — e.g.
  // "Admin, SuperAdmin" in .env must still match "admin"/"superadmin".
  isRoleAllowed(role) {
    if (!this.config.enabled) return false;
    if (this.config.rolesAllowed.length === 0) return true;
    const normalizedRole = String(role || "").trim().toLowerCase();
    return this.config.rolesAllowed.some((allowed) => allowed.toLowerCase() === normalizedRole);
  }

  // Single source of truth for "can this user use the Copilot at all"
  // (the COARSE, feature-level gate — never the fine-grained per-Tool/
  // per-Agent permission check that still runs on every question, see
  // utils/authorization.js::isAuthorized, consumed independently by
  // orchestrator/aiManager.js). Wraps isEnabled()/isRoleAllowed() so
  // callers (aiCopilot.routes.js, aiCopilotSocket.js) never each maintain
  // their own copy of this two-step decision — see
  // AI-Business-Copilot/04_INCIDENT_COPILOT_PERMISSIONS.md.
  canUseAiCopilot(user) {
    const role = user && user.role;
    if (!this.isEnabled()) return { allowed: false, reason: "copilot_disabled" };
    if (!this.isRoleAllowed(role)) return { allowed: false, reason: "role_not_allowed" };
    return { allowed: true, reason: null };
  }

  // Fails loudly rather than silently no-op'ing: a caller reaching this
  // before Phase 1 wires a real ILlmProvider adapter is a bug, not a
  // degraded-but-working state.
  requireLlmProvider() {
    if (!this.llmProvider) {
      throw new NotConfiguredError("ILlmProvider adapter");
    }
    return this.llmProvider;
  }

  // Reports which ports have an adapter wired, without ever exposing secret
  // values (e.g. config.llm.apiKey) — safe to surface on an admin endpoint.
  getStatus() {
    return {
      enabled: this.config.enabled,
      rolesAllowed: this.config.rolesAllowed,
      llmProviderConfigured: Boolean(this.config.llm.provider && this.config.llm.apiKey),
      adapters: {
        eventBus: Boolean(this.eventBus),
        memory: Boolean(this.memory),
        promptRepository: Boolean(this.promptRepository),
        toolRegistry: Boolean(this.toolRegistry),
        workflowRunner: Boolean(this.workflowRunner),
        agentRegistry: Boolean(this.agentRegistry),
        mcpClient: Boolean(this.mcpClient),
        retriever: Boolean(this.retriever),
        vectorStore: Boolean(this.vectorStore),
        llmProvider: Boolean(this.llmProvider),
        guardrails: Boolean(this.guardrails),
        contextBuilder: Boolean(this.contextBuilder),
      },
    };
  }
}

module.exports = { AiManager };
