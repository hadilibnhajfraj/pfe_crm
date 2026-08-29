"use strict";

const { BaseAgent } = require("./baseAgent");
const { AgentError, ConfigurationError } = require("./errors");
const { ToolCallingChain } = require("../langchain/chains");

// Mêmes Tools que KPIAgent (voir kpiAgent.js) : ReportingAgent ne lit pas
// une source différente, il en fait un usage différent (synthèse narrative
// plutôt que réponse chiffrée directe — voir la doc de classe ci-dessous).
const ALLOWED_TOOL_NAMES = ["get_dashboard_kpis", "get_user_dashboard", "get_professional_dashboard", "get_legacy_dashboard_kpis"];

const SYSTEM_PROMPT = [
  "Tu es l'Agent Reporting du CRM CBI Tunisia.",
  "Tu récupères les indicateurs pertinents puis rédiges une synthèse claire et",
  "structurée (tendances, points d'attention), à partir exclusivement des",
  "données renvoyées par les Tools fournis.",
].join(" ");

/**
 * # ReportingAgent — workflow à 2 étapes (tool-calling puis synthèse)
 *
 * ## Rôle
 * Distinct de `KPIAgent` par son **workflow**, pas par ses Tools autorisés
 * (les mêmes 4 Tools du module Dashboard) : `KPIAgent` renvoie la réponse
 * directe du `ToolCallingChain` ; `ReportingAgent` enchaîne une deuxième
 * étape — un `SummarizationChain` (déjà livré lors de l'intégration
 * LangChain, voir langchain/chains/summarizationChain.js) — pour transformer
 * la sortie brute du premier appel en une synthèse narrative. Démontre la
 * capacité de `LangChainWorkflowEngine` à faire circuler l'état d'une étape
 * `chain` vers la suivante (`buildInput` de l'étape 2 lit `state.raw` produit
 * par l'étape 1 — voir langchain/workflow/langChainWorkflowEngine.js et son
 * test "threads state through multiple sequential chain steps").
 *
 * ## Erreurs
 * `ConfigurationError` à la construction si aucun `summarizationChain` n'est
 * fourni (dépendance non optionnelle, contrairement à `qaChain` chez les
 * autres Agents). `AgentError` si aucun Tool autorisé n'est disponible au
 * moment de l'exécution — remonte via `BaseAgent.execute()`'s try/catch en
 * réponse dégradée, jamais une exception visible par l'utilisateur.
 */
class ReportingAgent extends BaseAgent {
  constructor({ summarizationChain, ...rest }) {
    super(rest);
    if (!summarizationChain) {
      throw new ConfigurationError(`Agent "${rest.name || "reporting_agent"}" requires a 'summarizationChain'.`);
    }
    this.summarizationChain = summarizationChain;
  }

  async _run({ message, conversationId }) {
    const tools = this._allowedTools();
    if (tools.length === 0) {
      throw new AgentError(`Agent "${this.name}" has no allowed Tool available to build a report from.`);
    }

    const instruction = await this._buildInstruction(message, conversationId);
    const toolCallingChain = new ToolCallingChain({ chatModel: this.chatModel, tools, maxToolCalls: this.maxToolCalls, promptInjectionGuard: this.promptInjectionGuard });

    const steps = [
      { type: "chain", chain: toolCallingChain, outputKey: "raw", buildInput: () => ({ instruction }) },
      {
        type: "chain",
        chain: this.summarizationChain,
        outputKey: "result",
        buildInput: (state) => ({ text: state.raw.answer, focus: "indicateurs clés, tendances et points d'attention" }),
      },
    ];

    const state = await this.workflowEngine.run(steps, {});
    return { answer: state.result.summary, citations: [], toolSteps: state.raw.steps || [] };
  }
}

function createReportingAgent({ chatModel, tools = [], workflowEngine, summarizationChain, memory = null, maxToolCalls, maxHistoryMessages, promptInjectionGuard = null }) {
  return new ReportingAgent({
    name: "reporting_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["reporting"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: ALLOWED_TOOL_NAMES,
    workflowEngine,
    summarizationChain,
    memory,
    maxToolCalls,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createReportingAgent, ReportingAgent, ALLOWED_TOOL_NAMES, SYSTEM_PROMPT };
