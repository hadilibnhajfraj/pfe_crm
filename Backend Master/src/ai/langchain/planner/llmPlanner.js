"use strict";

const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { JsonOutputParser } = require("@langchain/core/output_parsers");
const { IPlanner } = require("./planner.interface");
const { PlanningError } = require("../errors");
const { createLangChainLogger } = require("../logger");

const logger = createLangChainLogger("planner");

const SYSTEM_TEMPLATE = [
  "Tu es un planificateur. Décompose l'objectif de l'utilisateur en une liste",
  "ordonnée d'étapes, chacune utilisant si besoin un des outils disponibles.",
  "Outils disponibles :",
  "{toolList}",
  "",
  "Réponds UNIQUEMENT avec un objet JSON de la forme :",
  '{{"steps":[{{"tool":"<nom_outil_ou_null>","input":{{}},"reason":"..."}}]}}',
  "Une étape sans outil pertinent utilise \"tool\": null.",
  "N'invente jamais un nom d'outil qui n'est pas dans la liste ci-dessus.",
].join("\n");

/**
 * # LlmPlanner — décomposition d'un objectif en étapes ordonnées
 *
 * ## Rôle
 * Implémente `IPlanner.plan(goal, context)` : demande au modèle de
 * décomposer un objectif en liste de `PlanStep` (chacune référençant, ou
 * non, un outil MCP disponible), puis **valide** la sortie — chaque étape
 * dont le `tool` nommé n'existe pas dans `availableTools` est rejetée
 * plutôt que transmise telle quelle à un futur exécuteur (WorkflowEngine).
 * Le planificateur ne s'assure jamais qu'un plan est *correct* (il ne peut
 * pas le savoir), seulement qu'il est *exécutable* avec les outils
 * réellement disponibles.
 *
 * ## Entrée
 * `plan(goal: string, context?: { availableTools?: {name,description}[] })`
 *
 * ## Sortie
 * `PlanStep[]` — `{ tool: string|null, input: object, reason: string }[]`,
 * tronqué à `maxSteps` (garde-fou anti-plan-infini).
 *
 * ## Composition LangChain
 * `ChatPromptTemplate` → `chatModel` → `JsonOutputParser`, via
 * `RunnableSequence` — la sortie structurée (JSON) est parsée par LangChain
 * lui-même plutôt qu'à la main, contrairement à `ToolCallingChain` (qui a
 * besoin d'inspecter le texte brut pour gérer les erreurs de parsing avec
 * un message d'erreur riche — ici, une sortie non-JSON est simplement une
 * erreur de planification).
 *
 * ## Erreurs
 * `PlanningError` si le modèle ne renvoie pas un JSON avec un tableau
 * `steps`, ou si AUCUNE étape ne survit à la validation contre
 * `availableTools`.
 */
class LlmPlanner extends IPlanner {
  constructor({ chatModel, maxSteps = 8 }) {
    super();
    this.chatModel = chatModel;
    this.maxSteps = maxSteps;
  }

  async plan(goal, context = {}) {
    if (!goal || !goal.trim()) {
      throw new PlanningError("goal must not be empty");
    }

    const availableTools = context.availableTools || [];
    const toolNames = new Set(availableTools.map((t) => t.name));
    const toolList = availableTools.length
      ? availableTools.map((t) => `- ${t.name}: ${t.description}`).join("\n")
      : "(aucun outil disponible — toutes les étapes doivent avoir tool: null)";

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_TEMPLATE],
      ["human", "Objectif : {goal}"],
    ]);
    const runnable = RunnableSequence.from([prompt, this.chatModel, new JsonOutputParser()]);

    let parsed;
    try {
      parsed = await runnable.invoke({ goal, toolList });
    } catch (err) {
      throw new PlanningError(`model output could not be parsed as JSON: ${err.message}`);
    }

    if (!parsed || !Array.isArray(parsed.steps)) {
      throw new PlanningError('model output is missing a "steps" array');
    }

    const validated = parsed.steps
      .filter((step) => {
        if (step.tool === null || step.tool === undefined) return true;
        const ok = toolNames.has(step.tool);
        if (!ok) logger.warn(`dropping plan step referencing unknown tool "${step.tool}"`);
        return ok;
      })
      .slice(0, this.maxSteps)
      .map((step) => ({ tool: step.tool ?? null, input: step.input || {}, reason: step.reason || "" }));

    if (validated.length === 0) {
      throw new PlanningError("no plan step survived validation against availableTools");
    }

    return validated;
  }
}

module.exports = { LlmPlanner };
