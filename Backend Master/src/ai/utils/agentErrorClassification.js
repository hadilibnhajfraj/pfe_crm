"use strict";

const { Sequelize } = require("sequelize");
const { AgentError } = require("../agents/errors");
const { PermissionDeniedError, ToolExecutionError, ToolNotFoundError, ToolValidationError } = require("../mcp/errors");
const { LlmProviderAuthError, LlmProviderUnavailableError, LlmProviderTimeoutError, LlmProviderRequestError } = require("../services/providers/errors");
const { WorkflowError } = require("../langchain/errors");

/**
 * # utils/agentErrorClassification — un code stable pour CHAQUE panne d'Agent
 *
 * ## Pourquoi ce fichier existe
 * `BaseAgent.execute()` (voir `agents/baseAgent.js`) ne laisse JAMAIS une
 * erreur d'exécution atteindre l'utilisateur final — `_fallbackAnswer()`
 * renvoie toujours une réponse dégradée mais VALIDE (`mode: "agent"`, 200),
 * jamais une exception HTTP. C'est un choix assumé (voir le commentaire de
 * `execute()`), pas un bug. Le vrai problème que ce fichier corrige : AVANT
 * lui, la cause réelle de la dégradation n'était visible NULLE PART — ni
 * dans les logs (`logger.warn(err.message)`, une seule ligne, jamais la
 * stack), ni dans la réponse (le message générique "n'a pas pu traiter
 * cette demande" est IDENTIQUE quelle que soit la cause réelle). Voir
 * AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md — c'est exactement ce qui a
 * rendu "kpi_agent n'a pas pu traiter cette demande" indiagnostiquable sans
 * ce fichier + le log enrichi de `baseAgent.js::execute()`.
 *
 * ## Pourquoi sous `utils/`, pas `agents/`
 * `test/ai.agents.policy.test.js` interdit mécaniquement tout
 * `require("sequelize")` sous `src/ai/agents/` (aucun Agent ne doit
 * toucher la DB directement — toujours via un Tool injecté). Ce fichier a
 * besoin de `Sequelize.BaseError` UNIQUEMENT pour reconnaître le PROTOTYPE
 * d'une erreur déjà levée ailleurs (jamais une requête, jamais un accès
 * DB) — mais la règle mécanique du policy test ne distingue pas cette
 * nuance, donc ce fichier vit hors de `agents/`, consommé par lui via un
 * import ordinaire (aucune exception à créer dans le policy test).
 *
 * ## Ce que ce fichier NE fait PAS
 * Il ne change JAMAIS la réponse renvoyée à l'utilisateur (toujours le
 * même fallback en langage naturel, volontairement générique — jamais un
 * détail technique exposé à un utilisateur final) — seulement CE QUI EST
 * LOGGÉ côté serveur. Si un jour la décision est prise d'exposer le code
 * au frontend (ex. dans `explainability`), ce fichier est le SEUL endroit
 * à toucher — jamais une deuxième logique de classification créée ailleurs
 * (voir aussi `modules/ai-copilot/services/errorClassifier.js`, le
 * classifieur ÉQUIVALENT côté livraison HTTP, pour les erreurs qui
 * remontent jusqu'au contrôleur — un souci différent, une couche
 * différente, jamais fusionnés ici : ce fichier-ci vit dans le noyau, sans
 * dépendance à Express).
 */
const AGENT_ERROR = Object.freeze({
  AGENT_ERROR: "AI_AGENT_ERROR",
  TOOL_ERROR: "AI_TOOL_ERROR",
  DATABASE_ERROR: "AI_DATABASE_ERROR",
  PERMISSION_ERROR: "AI_PERMISSION_ERROR",
  VALIDATION_ERROR: "AI_VALIDATION_ERROR",
  LLM_ERROR: "AI_LLM_ERROR",
  // AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md, étape 14 — un
  // timeout LLM (`LlmProviderTimeoutError`, déjà réel et testé, voir
  // services/providers/errors.js) était auparavant confondu avec toute
  // autre panne fournisseur (auth/quota/indisponibilité) sous le même
  // AI_LLM_ERROR — distingué ici car opérationnellement différent (retenter
  // immédiatement n'a pas le même sens qu'après un timeout que pour un
  // quota épuisé). PAS de code "AI_RAG_ERROR" ajouté à côté : aucun chemin
  // RÉEL du pipeline RAG hors-ligne actuel (ingestion faite une fois au
  // démarrage, jamais par requête) ne lève `RagError` pendant un tour de
  // conversation — un code spéculatif pour un cas non atteignable aurait
  // été fabriqué, pas diagnostiqué (voir `unwrap`/`classifyAgentError`
  // ci-dessous : une `RagError` éventuelle reste classée AI_AGENT_ERROR,
  // honnêtement, plutôt que de créer un code jamais exercé).
  TIMEOUT_ERROR: "AI_TIMEOUT_ERROR",
});

// `LangChainWorkflowEngine` enveloppe TOUJOURS l'erreur d'une étape dans
// `WorkflowError` (voir langchain/errors.js), en gardant l'originale dans
// `.cause` (jamais un double enveloppement — vérifié dans
// langChainWorkflowEngine.js). Dépaquette SPÉCIFIQUEMENT `WorkflowError` —
// jamais "toute erreur avec un `.cause`" : `ToolExecutionError` (mcp/errors.js)
// porte AUSSI un `.cause` (sa cause interne, gardée pour les logs serveur,
// jamais le message client) — un dépaquetage générique perdrait alors
// `instanceof ToolExecutionError` avant même de l'avoir testé.
function unwrap(err) {
  return err instanceof WorkflowError && err.cause ? err.cause : err;
}

function classifyAgentError(rawErr) {
  const err = unwrap(rawErr);

  if (err instanceof PermissionDeniedError) return AGENT_ERROR.PERMISSION_ERROR;
  if (err instanceof ToolValidationError) return AGENT_ERROR.VALIDATION_ERROR;
  if (err instanceof ToolExecutionError || err instanceof ToolNotFoundError) return AGENT_ERROR.TOOL_ERROR;
  // Vérifié AVANT la branche LLM_ERROR générale ci-dessous :
  // `LlmProviderTimeoutError extends LlmProviderRequestError` (voir
  // services/providers/errors.js), donc l'ordre importe — un `instanceof
  // LlmProviderRequestError` seul aurait classé un timeout comme un
  // AI_LLM_ERROR générique avant même d'atteindre cette branche plus
  // spécifique.
  if (err instanceof LlmProviderTimeoutError) return AGENT_ERROR.TIMEOUT_ERROR;
  if (err instanceof LlmProviderAuthError || err instanceof LlmProviderUnavailableError || err instanceof LlmProviderRequestError) {
    return AGENT_ERROR.LLM_ERROR;
  }
  if (err instanceof Sequelize.BaseError) return AGENT_ERROR.DATABASE_ERROR;
  if (err instanceof AgentError) return AGENT_ERROR.AGENT_ERROR;
  // Un bug générique (ex. l'erreur de destructuration corrigée dans
  // AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md — un TypeError JS, jamais
  // une des familles ci-dessus) n'est ni un Tool, ni une permission, ni le
  // LLM — reste classée AI_AGENT_ERROR, la famille la plus large, jamais
  // laissée sans code.
  //
  // Note honnête : `mcpToolAdapter.js` aplatit déjà toute erreur MCP
  // (PermissionDeniedError/ToolExecutionError/...) en `Error` générique
  // AVANT qu'elle n'atteigne ce classifieur (voir son propre commentaire)
  // — les branches PERMISSION_ERROR/VALIDATION_ERROR/TOOL_ERROR restent
  // donc une classification correcte et prête, pas encore prouvée
  // atteignable par ce chemin précis aujourd'hui (même réserve déjà
  // documentée pour `modules/ai-copilot/services/errorClassifier.js`,
  // AI-Business-Copilot/07_INCIDENT_COPILOT_DATEEXPIRATION.md). LLM_ERROR,
  // en revanche, EST prouvée atteignable — reproduite en direct (429 réel)
  // pendant le diagnostic de cet incident.
  return AGENT_ERROR.AGENT_ERROR;
}

module.exports = { AGENT_ERROR, classifyAgentError };
