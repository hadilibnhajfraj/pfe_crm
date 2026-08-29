"use strict";

const { RunnableLambda } = require("@langchain/core/runnables");
const { IWorkflowEngine } = require("./workflowEngine.interface");
const { WorkflowError } = require("../errors");
const { createLangChainLogger } = require("../logger");

const logger = createLangChainLogger("workflow");

/**
 * # LangChainWorkflowEngine — orchestrateur déclaratif à base de Runnables
 *
 * ## Rôle
 * Exécute une liste de `WorkflowStep` (décrite en données, pas en code) en
 * enchaînant : `chain` (une `IChain` — voir chains/), `tool` (un outil MCP
 * adapté LangChain — voir tools/mcpToolAdapter.js), ou `router` (une
 * `IRouter` — voir router/, qui choisit dynamiquement quelle sous-liste
 * d'étapes exécuter ensuite). C'est la pièce qui **compose** les cinq
 * autres livrables de ce module (Chains, Tool Calling, Planner via des
 * étapes `chain` pointant vers un `LlmPlanner`, Router, Context Builder via
 * une `QaChain`) en une seule exécution.
 *
 * ## Entrée
 * `run(steps: WorkflowStep[], state?: object)` où chaque `WorkflowStep`
 * est l'une de :
 * - `{ type: "chain", chain: IChain, outputKey?, buildInput?: (state) => input }`
 * - `{ type: "tool", tool: DynamicStructuredTool, outputKey?, buildInput?: (state) => input }`
 * - `{ type: "router", router: IRouter, outputKey?, buildInput?: (state) => input, branches: { [routeKey]: WorkflowStep[] }, defaultBranch?: WorkflowStep[] }`
 *
 * ## Sortie
 * L'état final (`state` fusionné avec le résultat de chaque étape sous
 * `outputKey`, ou sous `chain.name`/`tool.name` si `outputKey` est omis).
 *
 * ## Composition LangChain
 * Chaque étape est exécutée via `RunnableLambda.from(...)`, le point
 * d'intégration standard de LangChain pour envelopper du code arbitraire
 * comme un `Runnable` — ce qui permet à quiconque appelle `run()` de
 * bénéficier du reste de l'écosystème `@langchain/core` (callbacks,
 * traçage) sans que cette classe ait besoin de le savoir explicitement.
 *
 * ## Erreurs
 * Toute erreur levée par une étape est enveloppée dans `WorkflowError`
 * (nommant l'étape fautive) avant de remonter — sauf si l'erreur est déjà
 * une `WorkflowError` (évite un double enveloppement lors de la récursion
 * sur les branches d'un routeur).
 */
class LangChainWorkflowEngine extends IWorkflowEngine {
  async run(steps, state = {}) {
    let currentState = { ...state };
    for (const step of steps) {
      currentState = await this._runStep(step, currentState);
    }
    return currentState;
  }

  async _runStep(step, state) {
    const stepName = step.name || `${step.type}${step.chain ? `:${step.chain.name}` : ""}${step.tool ? `:${step.tool.name}` : ""}`;
    logger.info(`running step "${stepName}"`);

    try {
      switch (step.type) {
        case "chain":
          return await this._runChainStep(step, state);
        case "tool":
          return await this._runToolStep(step, state);
        case "router":
          return await this._runRouterStep(step, state);
        default:
          throw new Error(`unknown step type "${step.type}"`);
      }
    } catch (err) {
      if (err instanceof WorkflowError) throw err;
      throw new WorkflowError(stepName, err);
    }
  }

  async _runChainStep(step, state) {
    const input = step.buildInput ? step.buildInput(state) : state;
    const runnable = RunnableLambda.from(() => step.chain.invoke(input, state));
    const output = await runnable.invoke(state);
    return { ...state, [step.outputKey || step.chain.name]: output };
  }

  async _runToolStep(step, state) {
    const input = step.buildInput ? step.buildInput(state) : {};
    const runnable = RunnableLambda.from(() => step.tool.invoke(input));
    const output = await runnable.invoke(state);
    return { ...state, [step.outputKey || step.tool.name]: output };
  }

  async _runRouterStep(step, state) {
    const input = step.buildInput ? step.buildInput(state) : state.input;
    const routeKey = await step.router.route(input, state);
    const nextState = { ...state, [step.outputKey || "route"]: routeKey };

    const branchSteps = (step.branches && step.branches[routeKey]) || step.defaultBranch;
    if (!branchSteps) return nextState;
    return this.run(branchSteps, nextState);
  }
}

module.exports = { LangChainWorkflowEngine };
