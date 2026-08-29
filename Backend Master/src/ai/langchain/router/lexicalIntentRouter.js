"use strict";

const { IRouter } = require("./router.interface");
const { RoutingError } = require("../errors");
const { tokenize } = require("../../utils/tokenize");

/**
 * # LexicalIntentRouter — routage par recouvrement de mots-clés, sans LLM
 *
 * ## Rôle
 * Choisit une route en comptant, pour chaque route enregistrée, combien de
 * ses mots-clés apparaissent dans l'entrée (réutilise le `tokenize` partagé
 * — voir utils/tokenize.js — plutôt que d'en réécrire un deuxième ; ce
 * primitif générique est aussi utilisé, indépendamment, par
 * `HashingEmbeddingProvider` (RAG), `LexicalOverlapReranker` (RAG) et
 * `ToolRouter` (orchestrator/) — aucun des quatre ne dépend des autres).
 * C'est le routeur **par défaut** du
 * module : entièrement offline, déterministe, ne dépend d'aucun modèle —
 * exactement le même principe que `HashingEmbeddingProvider` (RAG) ou
 * `LexicalOverlapReranker` (RAG) : le kernel expose toujours un adaptateur
 * générique qui fonctionne sans fournisseur LLM configuré.
 *
 * ## Entrée
 * `route(input: string)`
 *
 * ## Sortie
 * `Promise<string>` — la clé de route dont le score de recouvrement est le
 * plus élevé, ou `defaultRoute` si aucune route n'obtient un score > 0.
 *
 * ## Erreurs
 * `RoutingError` si aucune route ne correspond ET qu'aucun `defaultRoute`
 * n'a été configuré — échoue fermé plutôt que de retourner une route
 * arbitraire.
 */
class LexicalIntentRouter extends IRouter {
  constructor({ routes, defaultRoute = null }) {
    super();
    if (!Array.isArray(routes) || routes.length === 0) {
      throw new RoutingError("LexicalIntentRouter requires at least one route");
    }
    this.routes = routes;
    this.defaultRoute = defaultRoute;
  }

  async route(input) {
    const inputTerms = new Set(tokenize(input));
    let bestKey = null;
    let bestScore = 0;

    for (const candidate of this.routes) {
      const keywords = (candidate.keywords || []).map((kw) => kw.toLowerCase());
      const score = keywords.reduce((sum, kw) => sum + (inputTerms.has(kw) ? 1 : 0), 0);
      if (score > bestScore) {
        bestScore = score;
        bestKey = candidate.key;
      }
    }

    if (bestKey) return bestKey;
    if (this.defaultRoute) return this.defaultRoute;
    throw new RoutingError("no route matched the input and no defaultRoute was configured");
  }
}

module.exports = { LexicalIntentRouter };
