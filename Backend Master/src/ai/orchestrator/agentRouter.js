"use strict";

/**
 * # AgentRouter — sélectionner le bon Agent pour une intention
 *
 * ## Rôle
 * Fine couche au-dessus d'`AgentRegistry` (agents/agentRegistry.js, déjà
 * construit lors de la passe d'infrastructure initiale) : donne à
 * `AIManager` un point d'entrée stable (`select`) sans lui faire connaître
 * `AgentRegistry` directement (DIP). `AgentRegistry.findHandler(intent)`
 * parcourt les agents enregistrés et retourne le premier dont
 * `canHandle(intent)` est vrai — voir agents/agent.interface.js.
 *
 * Aucun agent concret n'existe à ce jour (registre vide par construction —
 * "Ne développer aucun Agent", voir Backend Master/src/ai/README.md) :
 * `select()` retourne donc toujours `null` tant qu'aucun agent n'a été
 * enregistré, et `AIManager` retombe alors sur `WorkflowManager` (Tools/RAG
 * via LangChain) — c'est un mécanisme de sélection prêt à l'emploi, pas une
 * exigence qu'un agent existe.
 *
 * ## Entrée
 * `select(intent: Intent)`
 *
 * ## Sortie
 * `IAgent | null`
 */
class AgentRouter {
  constructor({ agentRegistry = null } = {}) {
    this.agentRegistry = agentRegistry;
  }

  select(intent) {
    if (!this.agentRegistry) return null;
    return this.agentRegistry.findHandler(intent) || null;
  }
}

module.exports = { AgentRouter };
