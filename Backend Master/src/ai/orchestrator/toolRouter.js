"use strict";

const { tokenize } = require("../utils/tokenize");

/**
 * # ToolRouter — sélectionner automatiquement les bons Tools pour une intention
 *
 * ## Rôle
 * Réduit la liste complète des Tools LangChain disponibles (un par Tool MCP
 * enregistré — voir langchain/tools/mcpToolAdapter.js) à un petit
 * sous-ensemble pertinent, en deux passes : (1) filtrage par module(s)
 * métier via `toolModuleIndex` — `intent.moduleKey` (le module principal)
 * ET, optionnellement, `intent.relatedModules` (voir
 * `orchestrator/intentCatalog.js`) — jamais TOUS les modules, une frontière
 * dure limitée à ce que l'intention déclare explicitement pertinent ; (2)
 * classement par recouvrement lexical entre le message de l'utilisateur et
 * le nom/description de chaque Tool candidat (même technique que
 * `LexicalIntentRouter`/`LexicalOverlapReranker` — réutilise le même
 * `tokenize` plutôt que d'en réécrire un troisième), pour ne présenter au
 * modèle que les `maxTools` Tools les plus vraisemblablement utiles plutôt
 * que tout le module (un module comme "maintenance" en compte 15).
 *
 * ## Plusieurs Tools dans une même réponse
 * `select()` renvoie systématiquement un TABLEAU (jusqu'à `maxTools`
 * candidats), jamais un Tool unique — c'est `ToolCallingChain`
 * (langchain/chains/toolCallingChain.js) qui décide, tour par tour, d'en
 * appeler un, plusieurs, ou aucun avant de répondre. Exemple typique
 * (« Quels projets sont en retard ? », intention `projects` avec
 * `relatedModules: ["dashboard"]`) : le pool de candidats contient à la
 * fois `list_projects` (module `projects`) et `get_dashboard_kpis` (module
 * `dashboard`) — le modèle peut appeler les deux avant de fusionner leurs
 * résultats dans une seule réponse (voir `TOOL_ROUTER.md` pour l'exemple
 * complet, et `WorkflowManager`/`ResponseBuilder` pour la fusion elle-même,
 * qui n'est pas de la responsabilité de cette classe).
 *
 * ## Entrée
 * `select(intent: Intent, message: string)`
 *
 * ## Sortie
 * `DynamicStructuredTool[]` (voir langchain/tools/mcpToolAdapter.js) — `[]`
 * si `intent.requiresTools` est faux, ou si aucun Tool n'existe pour les
 * modules de `intent`.
 *
 * ## Erreurs
 * Aucune levée volontairement : un module inconnu ou vide produit
 * simplement une liste de candidats vide, jamais une exception — un Tool
 * manquant ne doit jamais faire échouer la détection d'intention ou le tour
 * de conversation entier.
 */
class ToolRouter {
  constructor({ tools = [], toolModuleIndex = new Map(), maxTools = 5 }) {
    this.tools = tools;
    this.toolModuleIndex = toolModuleIndex;
    this.maxTools = maxTools;
  }

  select(intent, message) {
    if (!intent.requiresTools) return [];

    const relatedModules = intent.relatedModules || [];
    let candidates;
    if (intent.moduleKey === null && relatedModules.length === 0) {
      // Aucune restriction déclarée du tout (ex. "automation") — recherche
      // à travers tous les modules, comportement inchangé.
      candidates = this.tools;
    } else {
      const relevantModules = new Set([intent.moduleKey, ...relatedModules].filter(Boolean));
      candidates = this.tools.filter((tool) => relevantModules.has(this.toolModuleIndex.get(tool.name)));
    }
    if (candidates.length === 0) return [];

    const messageTerms = new Set(tokenize(message));
    const scored = candidates.map((tool) => ({
      tool,
      score: tokenize(`${tool.name} ${tool.description}`).reduce((sum, term) => sum + (messageTerms.has(term) ? 1 : 0), 0),
    }));
    // Array#sort is a stable sort (guaranteed since ES2019): ties keep the
    // candidates' original module order rather than being shuffled.
    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, this.maxTools).map((entry) => entry.tool);
  }
}

module.exports = { ToolRouter };
