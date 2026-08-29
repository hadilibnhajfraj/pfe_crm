"use strict";

const { isAuthorized } = require("../utils/authorization");
const { SUGGESTION_CATALOG, DIMENSION_SUGGESTION_TRIGGERS } = require("./suggestionCatalog");

/**
 * # SuggestionEngine — le Copilot PROPOSE des actions, il ne les exécute jamais
 *
 * ## Rôle
 * Traduit les `factors` déjà calculés par `ProjectAttentionAnalyzer`
 * (`reasoning/projectAttentionAnalyzer.js`) en une liste d'actions
 * candidates (`SUGGESTION_CATALOG`, `suggestionCatalog.js`), filtrée aux
 * SEULES actions que l'utilisateur courant est effectivement autorisé à
 * réaliser. Entièrement hors-ligne et déterministe — même philosophie que
 * `ProjectAttentionAnalyzer`/`ConversationContextResolver`.
 *
 * ## Ne fait QUE proposer — jamais exécuter
 * Cette classe ne détient et n'appelle AUCUN Tool exécutable : elle renvoie
 * des objets purement descriptifs (`{id, label, reason}`), jamais une
 * fonction, un callback ou une référence à un Tool invocable. Il est donc
 * structurellement impossible qu'un appel à `suggestForFactors()` déclenche
 * une action côté CRM — voir `test/ai.orchestrator.suggestionEngine.test.js`,
 * "ne renvoie jamais rien d'exécutable".
 *
 * ## Permissions — jamais montré, jamais juste désactivé
 * Une suggestion que l'utilisateur ne pourrait pas réaliser n'est PAS
 * incluse dans le résultat (pas de champ `disabled: true`, pas de suggestion
 * "grisée") — même principe que `ToolRouter`/`AgentRouter` : un utilisateur
 * ne voit jamais l'existence d'une capacité qui lui est refusée. Pour une
 * entrée du catalogue adossée à un vrai Tool MCP (`toolName` renseigné), la
 * règle de permission est résolue depuis CE Tool réel (`toolPermissionIndex`,
 * construit une seule fois dans `orchestrator/pipeline.js` à partir du même
 * manifeste `mcp/tools/index.js` que `ToolRouter`/`McpServer` — jamais une
 * seconde copie de `requiredRoles` qui pourrait diverger). Pour une entrée
 * sans Tool MCP existant, la règle déclarée directement dans
 * `SUGGESTION_CATALOG` fait foi (voir sa propre doc).
 *
 * ## Entrée
 * `suggestForFactors(factors: {dimension, reason}[], actingUser)` — `factors`
 * au format renvoyé par `analyzeProjectAttention()` (un ou plusieurs
 * projets, déjà fusionnés/dédupliqués par l'appelant si nécessaire).
 *
 * ## Sortie
 * `{id, label, reason}[]` — dédupliqué (une action déclenchée par plusieurs
 * dimensions n'apparaît qu'une fois, avec la raison de la première
 * dimension qui l'a déclenchée), dans l'ordre de première apparition.
 */
class SuggestionEngine {
  constructor({ catalog = SUGGESTION_CATALOG, triggers = DIMENSION_SUGGESTION_TRIGGERS, toolPermissionIndex = new Map() } = {}) {
    this.catalog = catalog;
    this.triggers = triggers;
    this.toolPermissionIndex = toolPermissionIndex;
  }

  suggestForFactors(factors = [], actingUser) {
    const reasonById = new Map();

    for (const factor of factors) {
      const candidateIds = this.triggers[factor.dimension] || [];
      for (const id of candidateIds) {
        if (!reasonById.has(id)) reasonById.set(id, factor.reason);
      }
    }

    const suggestions = [];
    for (const [id, reason] of reasonById) {
      const entry = this.catalog[id];
      if (!entry) continue; // catalogue et déclencheurs peuvent diverger sans jamais planter

      if (!isAuthorized(this._permissionsFor(entry), actingUser)) continue;

      suggestions.push({ id: entry.id, label: entry.label, reason });
    }

    return suggestions;
  }

  _permissionsFor(entry) {
    if (!entry.toolName) {
      return { requiredRoles: entry.requiredRoles || [], allowedEmails: entry.allowedEmails || [] };
    }
    return this.toolPermissionIndex.get(entry.toolName) || { requiredRoles: [], allowedEmails: [] };
  }
}

module.exports = { SuggestionEngine };
