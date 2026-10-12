"use strict";

const { BaseAgent } = require("./baseAgent");
const { ConfigurationError } = require("./errors");
const { isAuthorized } = require("../utils/authorization");
const { TaskPlanner } = require("../planning/taskPlanner");
const { PlanStep, STEP_STATUS } = require("../planning/planStep");
const { ExecutionContext } = require("../planning/executionContext");
const { PlanExecutor } = require("../planning/planExecutor");
const { ConfirmationManager, classifyDecision, TASK_PLAN_PENDING_TYPE } = require("../planning/confirmationManager");
const { PLAN_TOOL_NAMES } = require("../planning/toolContracts");
const answers = require("../reasoning/taskPlanAnswerBuilder");

// Requis par BaseAgent ; cet Agent n'appelle JAMAIS le modèle de langage :
// plan, paramètres, résultats et textes sont déterministes.
const SYSTEM_PROMPT =
  "Agent de planification multi-étapes du CRM CBI Tunisia : lit les données par de vrais Tools, prépare les écritures, " +
  "attend une confirmation explicite, exécute et rapporte uniquement les résultats réels des Tools.";

/**
 * # TaskPlannerAgent — demandes composées, exécutées en deux tours (Phase 3)
 *
 * Tour 1 (la demande) :
 *   1. comprendre (`TaskPlanner.plan`, déterministe) ;
 *   2. construire le plan (READ → ANALYZE → WRITE) ;
 *   3. exécuter la lecture via le vrai Tool (RBAC appliqué par le serveur MCP) ;
 *   4. analyser les lignes lues (filtre déterministe) ;
 *   5. préparer une écriture par ligne retenue ;
 *   6. afficher le résumé ;
 *   7. demander confirmation (`ConfirmationManager` → PendingActionStore).
 * Tour 2 (« confirme » / « annule ») :
 *   8. exécuter UNIQUEMENT après confirmation, en relisant d'abord le
 *      périmètre : une cible qui n'est plus visible pour l'utilisateur
 *      (réaffectée, supprimée, statut changé) n'est pas écrite ;
 *   9. renvoyer le résultat réel de chaque Tool (succès avec identifiant,
 *      refus RBAC, échec, délai dépassé).
 *
 * ## Qui autorise ?
 * Jamais cet Agent ni un modèle de langage : `requiredRoles: []` (ouvert à
 * tous les rôles du Copilot) et chaque appel passe par l'adaptateur MCP lié
 * à l'utilisateur authentifié (`PermissionManager`). La vérification
 * préalable du Tool d'écriture (`toolPermissionIndex`, mêmes rôles que ceux
 * déclarés par le Tool) évite seulement de proposer une action que le
 * serveur refuserait ; elle ne remplace pas le contrôle du serveur, qui
 * reste appliqué à l'exécution.
 */
class TaskPlannerAgent extends BaseAgent {
  constructor({ taskPlanner = null, confirmationManager, toolPermissionIndex = null, stepTimeoutMs = 15000, planTimeoutMs = 60000, now = () => Date.now(), ...rest }) {
    super(rest);
    if (!confirmationManager) {
      throw new ConfigurationError(`Agent "${rest.name || "task_planner_agent"}" requires a 'confirmationManager' (never write without confirmation).`);
    }
    this.taskPlanner = taskPlanner || new TaskPlanner();
    this.confirmationManager = confirmationManager;
    this.toolPermissionIndex = toolPermissionIndex;
    this.stepTimeoutMs = stepTimeoutMs;
    this.planTimeoutMs = planTimeoutMs;
    this.now = now;
  }

  _context(user, conversationId) {
    return new ExecutionContext({ user, conversationId, stepTimeoutMs: this.stepTimeoutMs, planTimeoutMs: this.planTimeoutMs, now: this.now });
  }

  _executor() {
    return new PlanExecutor({ tools: this._allowedTools(), logger: this.logger });
  }

  async _run({ message, user, conversationId }) {
    const decision = classifyDecision(message);
    if (decision) {
      const pending = this.confirmationManager.pendingFor(conversationId, user);
      if (!pending) return { answer: answers.buildNoPendingAnswer(), citations: [], toolSteps: [], pendingAction: null };
      if (decision === "cancel") {
        this.confirmationManager.take(conversationId, user);
        this.logger.info(`plan ${pending.id} annulé (${pending.steps.length} action(s) non exécutée(s))`);
        return { answer: answers.buildCancelledAnswer(pending), citations: [], toolSteps: [], pendingAction: null };
      }
      return this._executeConfirmed({ user, conversationId });
    }
    return this._prepare({ message, user, conversationId });
  }

  async _prepare({ message, user, conversationId }) {
    const result = this.taskPlanner.plan(message, { user });
    if (result.unsupported) return { answer: result.unsupported, citations: [], toolSteps: [], pendingAction: null };
    const { plan } = result;

    const writePermission = this.toolPermissionIndex && this.toolPermissionIndex.get(plan.action.tool);
    if (writePermission && !isAuthorized(writePermission, user)) {
      this.logger.warn(`plan refusé : "${plan.action.tool}" non autorisé pour le rôle "${user && user.role}"`);
      return { answer: answers.buildWritePermissionAnswer({ plan }), citations: [], toolSteps: [], pendingAction: null };
    }

    const ctx = this._context(user, conversationId);
    const executor = this._executor();
    const [readStep, analyzeStep] = plan.steps;
    const { rows } = await executor.runRead(readStep, ctx);
    if (!rows) return { answer: answers.buildReadFailureAnswer({ plan, readStep }), citations: [], toolSteps: ctx.toolSteps, pendingAction: null };

    const analysis = this.taskPlanner.analyze(plan, rows);
    analyzeStep.markDone({ kept: analysis.kept.length, excluded: analysis.excluded });
    if (!analysis.kept.length) {
      return { answer: answers.buildNothingToDoAnswer({ plan, readStep, analysis }), citations: [], toolSteps: ctx.toolSteps, pendingAction: null };
    }

    const prepared = this.taskPlanner.prepareWrites(plan, analysis.kept);
    if (!conversationId) {
      return { answer: answers.buildNoConversationAnswer(), citations: [], toolSteps: ctx.toolSteps, pendingAction: null };
    }
    const pending = this.confirmationManager.request({
      conversationId,
      user,
      goal: plan.goal,
      writeSteps: prepared.steps,
      summary: { read: { tool: readStep.tool, input: readStep.input }, entityType: plan.entityType },
    });
    this.logger.info(`plan ${pending.id} préparé : ${prepared.steps.length} écriture(s) en attente de confirmation`);

    return {
      answer: answers.buildProposalAnswer({ plan, readStep, analysis, prepared, ttlMinutes: this.confirmationManager.ttlMinutes }),
      citations: [],
      toolSteps: ctx.toolSteps,
      pendingAction: {
        id: pending.id,
        type: TASK_PLAN_PENDING_TYPE,
        goal: pending.goal,
        // `reason` : même forme que les propositions d'AutomationAgent
        // (déjà affichées par le client Flutter).
        steps: pending.steps.map((s) => ({ tool: s.tool, input: s.input, reason: s.description, target: s.target })),
      },
    };
  }

  async _executeConfirmed({ user, conversationId }) {
    const pending = this.confirmationManager.take(conversationId, user);
    if (!pending) return { answer: answers.buildNoPendingAnswer(), citations: [], toolSteps: [], pendingAction: null };

    const ctx = this._context(user, conversationId);
    const executor = this._executor();
    const steps = pending.steps.map((s) => PlanStep.fromJSON(s));

    // Relecture du périmètre AVANT toute écriture : seules les cibles encore
    // renvoyées par le vrai Tool, pour CET utilisateur, peuvent être écrites.
    const recheck = new PlanStep({ id: "recheck", kind: "read", tool: pending.summary.read.tool, input: pending.summary.read.input, description: "Revérifier le périmètre" });
    const { rows } = await executor.runRead(recheck, ctx);
    if (!rows) {
      for (const step of steps) step.markFailed(STEP_STATUS.SKIPPED, `non exécutée : vérification du périmètre impossible (${recheck.error})`);
    } else {
      const stillVisible = new Set(rows.map((r) => r.id));
      const inScope = steps.filter((s) => {
        if (stillVisible.has(s.target && s.target.id)) return true;
        s.markFailed(STEP_STATUS.SKIPPED, "non exécutée : l'enregistrement n'est plus dans votre périmètre ou ne correspond plus");
        return false;
      });
      await executor.runWrites(inScope, ctx);
    }

    const done = steps.filter((s) => s.status === STEP_STATUS.DONE).length;
    this.logger.info(`plan ${pending.id} exécuté : ${done}/${steps.length} action(s) réussie(s)`);
    return { answer: answers.buildExecutedAnswer({ pending, steps }), citations: [], toolSteps: ctx.toolSteps, pendingAction: null };
  }
}

// `confirmationManager` : sinon construit sur le PendingActionStore partagé
// (`pendingActionStore`, même dépendance qu'AutomationAgent/MeetingAgent).
function createTaskPlannerAgent({ chatModel, tools = [], workflowEngine, memory = null, maxHistoryMessages, promptInjectionGuard = null, confirmationManager = null, pendingActionStore = null, taskPlanner = null, toolPermissionIndex = null, stepTimeoutMs, planTimeoutMs }) {
  return new TaskPlannerAgent({
    name: "task_planner_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["multi_step_task"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: PLAN_TOOL_NAMES,
    workflowEngine,
    memory,
    maxHistoryMessages,
    promptInjectionGuard,
    confirmationManager: confirmationManager || (pendingActionStore ? new ConfirmationManager({ store: pendingActionStore }) : null),
    taskPlanner,
    toolPermissionIndex,
    ...(stepTimeoutMs ? { stepTimeoutMs } : {}),
    ...(planTimeoutMs ? { planTimeoutMs } : {}),
  });
}

module.exports = { TaskPlannerAgent, createTaskPlannerAgent, SYSTEM_PROMPT };
