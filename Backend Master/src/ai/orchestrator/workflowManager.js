"use strict";

const { ToolCallingChain } = require("../langchain/chains");
const { OrchestratorError } = require("./errors");

/**
 * # WorkflowManager — appelle LangChain, utilise le RAG lorsque nécessaire
 *
 * ## Rôle
 * Traduit une décision déjà prise (intention + Tools sélectionnés par
 * `ToolRouter` + éventuel Agent choisi par `AgentRouter`) en une exécution
 * concrète, en construisant une liste de `WorkflowStep` déclarative et en la
 * confiant à `LangChainWorkflowEngine.run()` (langchain/workflow/) — la même
 * pièce que le composant "Workflow Engine" livré lors de l'intégration
 * LangChain. Deux stratégies, choisies sans logique métier :
 * - Si `tools.length > 0` (et `intent.requiresTools`) : construit une
 *   `ToolCallingChain` scopée à CES Tools précis (pas tous les Tools MCP
 *   enregistrés — c'est tout l'intérêt du filtrage de `ToolRouter`) et
 *   l'exécute comme unique étape `chain`.
 * - Sinon : exécute `qaChain` (RAG-grounded, voir langchain/chains/qaChain.js
 *   et langchain/context/ragContextBuilder.js) — c'est le chemin "utiliser
 *   le RAG lorsque nécessaire", et le repli par défaut pour toute intention
 *   qui n'a pas de Tool pertinent (y compris `general_chat`).
 *
 * Le cas "un Agent a été sélectionné" est délibérément géré par l'appelant
 * (`AIManager`), pas ici : un `IAgent` n'est pas une étape LangChain, il
 * possède l'intégralité du tour de conversation (voir agents/agent.interface.js).
 *
 * ## Entrée
 * `run({ intent, message, user, conversationId, tools })`
 *
 * ## Sortie
 * `{ mode: "tool_calling" | "qa", answer: string, citations: Citation[], toolSteps: object[] }`
 *
 * ## Erreurs
 * `OrchestratorError` si ni `message` ni un chemin exploitable n'est
 * disponible ; toute erreur de la chain/du moteur de workflow sous-jacent
 * (`WorkflowError`, `PlanningError`, ...) remonte telle quelle — cette classe
 * n'avale aucune erreur, elle choisit seulement quoi exécuter.
 *
 * ## Génération de réponse — ton par rôle
 * `role` (optionnel, constructeur) est transmis à la `ToolCallingChain`
 * fraîchement construite à chaque `run()` — voir
 * `langchain/prompts/responsePrompts.js`/`RESPONSE_PROMPTS.md`. `qaChain`
 * (chemin RAG) porte déjà son propre `role` depuis sa construction (voir
 * `langchain/pipeline.js`) — non re-transmis ici, une Chain injectée ne
 * doit jamais être reconfigurée par son appelant.
 */
class WorkflowManager {
  constructor({ chatModel, qaChain, workflowEngine, maxToolCalls = 5, promptInjectionGuard = null, role = null }) {
    this.chatModel = chatModel;
    this.qaChain = qaChain;
    this.workflowEngine = workflowEngine;
    this.maxToolCalls = maxToolCalls;
    this.promptInjectionGuard = promptInjectionGuard;
    this.role = role;
  }

  async run({ intent, message, user, conversationId, tools = [] }) {
    if (!message || !message.trim()) {
      throw new OrchestratorError("WorkflowManager.run requires a non-empty 'message'.");
    }

    const useTools = Boolean(intent.requiresTools) && tools.length > 0;

    const steps = useTools
      ? [
          {
            type: "chain",
            chain: new ToolCallingChain({ chatModel: this.chatModel, tools, maxToolCalls: this.maxToolCalls, promptInjectionGuard: this.promptInjectionGuard, role: this.role }),
            outputKey: "result",
            buildInput: () => ({ instruction: message }),
          },
        ]
      : [
          {
            type: "chain",
            chain: this.qaChain,
            outputKey: "result",
            buildInput: () => ({ question: message, user, scope: { conversationId } }),
          },
        ];

    const state = await this.workflowEngine.run(steps, {});
    const { answer, citations = [], steps: toolSteps = [] } = state.result;

    return {
      mode: useTools ? "tool_calling" : "qa",
      answer,
      citations,
      toolSteps,
    };
  }
}

module.exports = { WorkflowManager };
