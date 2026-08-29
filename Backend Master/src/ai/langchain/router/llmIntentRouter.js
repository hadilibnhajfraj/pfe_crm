"use strict";

const { RunnableSequence } = require("@langchain/core/runnables");
const { ChatPromptTemplate } = require("@langchain/core/prompts");
const { JsonOutputParser } = require("@langchain/core/output_parsers");
const { IRouter } = require("./router.interface");
const { RoutingError } = require("../errors");
const { createLangChainLogger } = require("../logger");

const logger = createLangChainLogger("router");

const SYSTEM_TEMPLATE = [
  "Tu choisis, parmi les routes suivantes, celle qui correspond le mieux à la",
  "demande de l'utilisateur. Réponds UNIQUEMENT avec un objet JSON de la forme",
  '{{"route":"<clé_exacte>"}}.',
  "Routes disponibles :",
  "{routeList}",
].join("\n");

/**
 * # LlmIntentRouter — routage par classification via le modèle
 *
 * ## Rôle
 * Demande au modèle de choisir une route parmi celles enregistrées, avec
 * leur description en langage naturel (plus flexible que le recouvrement
 * de mots-clés de `LexicalIntentRouter`, au prix de dépendre d'un modèle
 * configuré). Si le modèle renvoie une clé inconnue ou un JSON invalide,
 * retombe sur `fallbackRouter` (typiquement une `LexicalIntentRouter`)
 * plutôt que d'échouer — voir `pipeline.js` pour le câblage recommandé
 * "LLM d'abord, lexical en secours".
 *
 * ## Entrée
 * `route(input: string)`
 *
 * ## Sortie
 * `Promise<string>` — une clé parmi `routes[].key`.
 *
 * ## Composition LangChain
 * `ChatPromptTemplate` → `chatModel` → `JsonOutputParser`, via
 * `RunnableSequence`.
 *
 * ## Erreurs
 * `RoutingError` si le modèle choisit une route inconnue ET qu'aucun
 * `fallbackRouter` n'est configuré (ou que celui-ci échoue aussi).
 */
class LlmIntentRouter extends IRouter {
  constructor({ chatModel, routes, fallbackRouter = null }) {
    super();
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new RoutingError("LlmIntentRouter requires at least one route");
    }
    this.chatModel = chatModel;
    this.routes = routes;
    this.routeKeys = new Set(routes.map((r) => r.key));
    this.fallbackRouter = fallbackRouter;
  }

  async route(input, context) {
    const routeList = this.routes.map((r) => `- ${r.key}: ${r.description}`).join("\n");
    const prompt = ChatPromptTemplate.fromMessages([
      ["system", SYSTEM_TEMPLATE],
      ["human", "{input}"],
    ]);
    const runnable = RunnableSequence.from([prompt, this.chatModel, new JsonOutputParser()]);

    let parsed;
    try {
      parsed = await runnable.invoke({ input, routeList });
    } catch (err) {
      return this._fallbackOrThrow(input, context, `model output could not be parsed as JSON: ${err.message}`);
    }

    if (parsed && this.routeKeys.has(parsed.route)) {
      return parsed.route;
    }

    return this._fallbackOrThrow(input, context, `model chose an unknown route "${parsed && parsed.route}"`);
  }

  async _fallbackOrThrow(input, context, reason) {
    logger.warn(`falling back: ${reason}`);
    if (this.fallbackRouter) return this.fallbackRouter.route(input, context);
    throw new RoutingError(reason);
  }
}

module.exports = { LlmIntentRouter };
