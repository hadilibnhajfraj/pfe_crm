"use strict";

const crypto = require("crypto");
const { BaseAgent } = require("./baseAgent");
const { ConfigurationError } = require("./errors");
const { tokenize } = require("../utils/tokenize");
const {
  buildProposalAnswer,
  buildExecutedAnswer,
  buildCancelledAnswer,
  buildToolsUnavailableAnswer,
  buildExpiredOrMissingAnswer,
  buildNoActionAnswer,
} = require("../reasoning/automationAnswerBuilder");

// Contrairement à tous les autres Agents spécialisés, aucune liste blanche
// de Tools : une automatisation peut légitimement enchaîner des actions de
// N'IMPORTE QUEL module (voir orchestrator/intentCatalog.js, l'intention
// "automation" a délibérément `moduleKey: null`). Le garde-fou n'est donc
// pas "quels Tools", mais "qui a le droit d'invoquer cet Agent du tout" —
// voir REQUIRED_ROLES ci-dessous — ET, désormais, "aucun Tool n'est JAMAIS
// appelé sans confirmation explicite" (voir _run ci-dessous).
const ALLOWED_TOOL_NAMES = null;

// Restreint aux rôles admin-tier : cet Agent peut enchaîner plusieurs
// actions d'écriture à travers plusieurs modules en une seule demande — un
// rayon d'action plus large justifie un filtre d'entrée plus conservateur
// que les autres Agents (qui laissent le Permission Manager MCP trancher
// Tool par Tool). Chaque Tool individuellement appelé reste, de toute façon,
// encore soumis à SA PROPRE vérification de permission (voir
// mcpToolAdapter.js) — cette restriction est une couche supplémentaire, pas
// un remplacement.
const REQUIRED_ROLES = ["admin", "superadmin", "superadmin2"];

// Les mots que CE système invite explicitement l'utilisateur à répondre
// (voir automationAnswerBuilder.js::buildProposalAnswer, "Répondez « confirme »
// ... ou « annule »") — jamais "oui"/"non" (trop génériques pour un mot-clé
// global, voir intentCatalog.js) : le Copilot contrôle lui-même le mot magique
// qu'il demande, donc il n'a besoin de reconnaître QUE celui-là.
const CONFIRM_MARKERS = ["confirme", "confirmer"];
const CANCEL_MARKERS = ["annule", "annuler"];

const SYSTEM_PROMPT = [
  "Tu es l'Agent Automatisation du CRM CBI Tunisia.",
  "Tu décomposes une demande en une séquence d'actions concrètes, mais tu ne",
  "les exécutes JAMAIS immédiatement : tu les PROPOSES d'abord, en détail,",
  "et tu attends une confirmation explicite ('confirme' ou 'annule') avant",
  "toute exécution réelle.",
  "N'exécute qu'une action à la fois si elle est ambiguë, et signale toute",
  "étape que tu ne peux pas réaliser avec les Tools fournis.",
].join(" ");

/**
 * # AutomationAgent — proposer, jamais exécuter sans confirmation explicite
 *
 * ## Rôle
 * Décompose une demande en actions concrètes via `IPlanner`
 * (`LlmPlanner`, déjà livré lors de l'intégration LangChain), exactement
 * comme avant — mais ne les exécute JAMAIS dans le même tour. Chaque plan
 * devient une PROPOSITION stockée dans `PendingActionStore`
 * (`orchestrator/pendingActionStore.js`), scopée à `conversationId`, et
 * l'exécution réelle n'a lieu qu'au tour SUIVANT, si (et seulement si) ce
 * tour contient le mot « confirme »/« confirmer ». Voir
 * `orchestrator/AUTOMATION_WORKFLOWS.md` pour le cycle complet et sa
 * justification.
 *
 * ## Les 5 actions demandées
 * Ne sont pas 5 chemins de code séparés : `IPlanner` choisit lui-même,
 * parmi les VRAIS Tools disponibles, lesquels appeler pour répondre à la
 * demande (création d'activité/rappel → `create_project_action`, rendez-vous
 * → `create_calendar_event`, email → `send_notification_email`, rapport →
 * `get_dashboard_kpis`) — la logique de proposition/confirmation/exécution
 * ci-dessous est UNIFORME et cross-module, pas répétée 5 fois.
 *
 * ## Le cycle en 3 étapes
 * 1. **Proposer** (`_propose`) : `planner.plan()` produit des étapes ; celles
 *    référençant un Tool réellement disponible deviennent une proposition
 *    (jamais exécutée), stockée pour CETTE conversation, et décrite en
 *    détail dans la réponse (Tool + paramètres + raison, voir
 *    `automationAnswerBuilder.js::buildProposalAnswer`).
 * 2. **Confirmer/annuler** (`_executeConfirmed`/annulation) : si le tour
 *    suivant contient « confirme »/« confirmer », la proposition en attente
 *    (si non expirée, 15 minutes) est retirée du `PendingActionStore` et
 *    SEULEMENT ALORS exécutée réellement, étape par étape, via
 *    `LangChainWorkflowEngine` (même mécanisme `{type:"tool",...}` qu'avant).
 *    « annule »/« annuler » la retire sans jamais l'exécuter.
 * 3. **Rien en attente + confirme/annule isolé** : réponse honnête plutôt
 *    que de tenter de "planifier" un message d'une poignée de mots qui ne
 *    contient aucune demande réelle.
 *
 * ## Erreurs
 * `ConfigurationError` à la construction sans `planner` NI sans
 * `pendingActionStore` — les deux sont désormais requis (l'un pour décider
 * QUOI proposer, l'autre pour ne JAMAIS exécuter sans confirmation). Toute
 * erreur d'exécution (`PlanningError`, Tool indisponible) est absorbée par
 * `BaseAgent.execute()` et transformée en réponse dégradée.
 */
class AutomationAgent extends BaseAgent {
  constructor({ planner, pendingActionStore, ...rest }) {
    super(rest);
    if (!planner) {
      throw new ConfigurationError(`Agent "${rest.name || "automation_agent"}" requires a 'planner'.`);
    }
    if (!pendingActionStore) {
      throw new ConfigurationError(`Agent "${rest.name || "automation_agent"}" requires a 'pendingActionStore' (never execute without confirmation).`);
    }
    this.planner = planner;
    this.pendingActionStore = pendingActionStore;
  }

  async _run({ message, user, conversationId }) {
    const terms = tokenize(message);
    const pending = this.pendingActionStore.peek(conversationId);

    if (pending && CONFIRM_MARKERS.some((m) => terms.includes(m))) {
      return this._executeConfirmed(pending, conversationId);
    }
    if (pending && CANCEL_MARKERS.some((m) => terms.includes(m))) {
      this.pendingActionStore.consume(conversationId);
      return { answer: buildCancelledAnswer(pending), citations: [], toolSteps: [], pendingAction: null };
    }
    // Un « confirme »/« annule » isolé sans rien en attente : ne PAS tenter
    // de le "planifier" comme une nouvelle demande (message trop court pour
    // porter une intention réelle) — une réponse honnête plutôt qu'un plan
    // halluciné à partir de rien.
    const isBareConfirmOrCancel = terms.length <= 3 && (CONFIRM_MARKERS.some((m) => terms.includes(m)) || CANCEL_MARKERS.some((m) => terms.includes(m)));
    if (!pending && isBareConfirmOrCancel) {
      return { answer: buildExpiredOrMissingAnswer(), citations: [], toolSteps: [], pendingAction: null };
    }

    return this._propose({ message, user, conversationId });
  }

  async _propose({ message, user, conversationId }) {
    const tools = this._allowedTools();
    const availableTools = tools.map((tool) => ({ name: tool.name, description: tool.description }));
    const plan = await this.planner.plan(message, { availableTools });

    const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
    const executableSteps = plan.filter((step) => step.tool && toolByName.has(step.tool));

    if (executableSteps.length === 0) {
      return { answer: buildNoActionAnswer(), citations: [], toolSteps: [], pendingAction: null };
    }

    const action = {
      id: crypto.randomUUID(),
      conversationId,
      userId: user && user.id,
      steps: executableSteps.map((s) => ({ tool: s.tool, input: s.input, reason: s.reason })),
    };
    this.pendingActionStore.propose(conversationId, action);

    return {
      answer: buildProposalAnswer(action),
      citations: [],
      toolSteps: [],
      pendingAction: { id: action.id, steps: action.steps },
    };
  }

  // Exécution réelle — la SEULE méthode de cette classe qui appelle
  // `tool.invoke`/`workflowEngine.run` avec un Tool d'écriture, et
  // uniquement parce qu'une confirmation explicite vient d'être reçue.
  async _executeConfirmed(pending, conversationId) {
    this.pendingActionStore.consume(conversationId);

    const tools = this._allowedTools();
    const toolByName = new Map(tools.map((tool) => [tool.name, tool]));
    const runnableSteps = pending.steps.filter((s) => toolByName.has(s.tool));

    if (runnableSteps.length === 0) {
      return { answer: buildToolsUnavailableAnswer(), citations: [], toolSteps: [], pendingAction: null };
    }

    const workflowSteps = runnableSteps.map((s, index) => ({
      type: "tool",
      tool: toolByName.get(s.tool),
      outputKey: `step_${index}`,
      buildInput: () => s.input,
    }));

    const state = await this.workflowEngine.run(workflowSteps, {});
    // Un Tool MCP réel renvoie un JSON sérialisé (voir mcpToolAdapter.js) —
    // même convention que dataQualityAgent.js/kpiAgent.js/advancedSearchAgent.js :
    // toujours désérialisé avant d'atteindre `toolSteps`, jamais laissé en
    // chaîne brute. Un Tool qui renvoie déjà un objet (ex. un mock de test)
    // reste utilisable tel quel.
    const toolSteps = runnableSteps.map((s, index) => {
      const raw = state[`step_${index}`];
      let output = raw;
      if (typeof raw === "string") {
        try {
          output = JSON.parse(raw);
        } catch {
          output = raw;
        }
      }
      return { tool: s.tool, input: s.input, output };
    });

    return { answer: buildExecutedAnswer(toolSteps), citations: [], toolSteps, pendingAction: null };
  }
}

function createAutomationAgent({ chatModel, tools = [], workflowEngine, planner, pendingActionStore, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new AutomationAgent({
    name: "automation_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["automation"],
    requiredRoles: REQUIRED_ROLES,
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    planner,
    pendingActionStore,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createAutomationAgent, AutomationAgent, ALLOWED_TOOL_NAMES, REQUIRED_ROLES, CONFIRM_MARKERS, CANCEL_MARKERS, SYSTEM_PROMPT };
