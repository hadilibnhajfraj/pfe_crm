"use strict";

const { Sequelize } = require("sequelize");
const { NotConfiguredError } = require("../../../ai/utils/errors");
const { OrchestratorPermissionError } = require("../../../ai/orchestrator/errors");
const { PermissionDeniedError, ToolExecutionError, ToolNotFoundError, ToolValidationError } = require("../../../ai/mcp/errors");

/**
 * # errorClassifier — un code d'erreur STABLE par famille de panne réelle
 *
 * ## Pourquoi ce fichier existe
 * Avant ce fichier, `aiCopilot.controller.js::handle()` ne distinguait que
 * deux cas : `NotConfiguredError` (503) et "tout le reste" (500,
 * "Internal server error", générique). Une vraie panne PostgreSQL
 * (`SequelizeDatabaseError`, ex. une colonne manquante — voir
 * AI-Business-Copilot/07_INCIDENT_COPILOT_DATEEXPIRATION.md) tombait donc
 * dans le même seau générique que n'importe quel bug — et côté Flutter,
 * `CopilotNotConfiguredException`/`CopilotForbiddenException` ne
 * réagissant qu'aux codes HTTP 503/403, une panne 500 quelconque affichait
 * un message générique ("Impossible de charger le tableau de bord."),
 * jamais le message trompeur "non configuré" (ce fichier ne corrige donc
 * pas un bug de mapping HTTP — il ajoute la GRANULARITÉ demandée : savoir
 * QUELLE famille de panne s'est produite, pas seulement "configuré ou
 * pas").
 *
 * ## Ce qui est réellement atteignable aujourd'hui vs. défensif
 * `AI_PROVIDER_NOT_CONFIGURED`/`AI_DATABASE_ERROR`/`AI_INTERNAL_ERROR` sont
 * les 3 familles RÉELLEMENT atteignables par ce contrôleur aujourd'hui
 * (`dashboard()`/`chat()` etc. — voir leurs commentaires respectifs).
 * `AI_PERMISSION_DENIED`/`AI_TOOL_ERROR` correspondent à des classes RÉELLES
 * de ce noyau (`OrchestratorPermissionError`/`PermissionDeniedError`/
 * `ToolExecutionError`...) mais que `AIManager.handleMessage()` absorbe
 * aujourd'hui DANS l'enveloppe de réponse (mode: "error", HTTP 200) avant
 * qu'elles n'atteignent ce contrôleur — sauf via `confirmProactiveWorkflow`,
 * qui aplatit lui-même toute erreur MCP en `Error` générique (voir
 * aiCopilotBridge.service.js). Ces deux branches restent donc une
 * classification DÉFENSIVE, correcte si la propagation change un jour,
 * jamais un cas aujourd'hui prouvé par un test d'intégration — documenté
 * ici plutôt que présenté comme actif. `AI_TIMEOUT` couvre les erreurs
 * Sequelize de timeout réelles (pool épuisé, connexion DB lente).
 */
const AI_COPILOT_ERROR = Object.freeze({
  PROVIDER_NOT_CONFIGURED: "AI_PROVIDER_NOT_CONFIGURED",
  DATABASE_ERROR: "AI_DATABASE_ERROR",
  PERMISSION_DENIED: "AI_PERMISSION_DENIED",
  TOOL_ERROR: "AI_TOOL_ERROR",
  TIMEOUT: "AI_TIMEOUT",
  INTERNAL_ERROR: "AI_INTERNAL_ERROR",
});

function isTimeoutError(err) {
  if (err instanceof Sequelize.TimeoutError || err instanceof Sequelize.ConnectionTimedOutError) return true;
  return Boolean(err) && (err.code === "ETIMEDOUT" || err.code === "ECONNABORTED");
}

/**
 * Retourne `{ code, status, message }` — jamais `err.message`/`err.stack`
 * dans le `message` renvoyé (même discipline que le 500 générique déjà en
 * place) : ce classifieur choisit une FAMILLE, jamais un détail interne à
 * exposer.
 */
function classifyAiCopilotError(err) {
  if (err instanceof NotConfiguredError) {
    return { code: AI_COPILOT_ERROR.PROVIDER_NOT_CONFIGURED, status: 503, message: "Le Copilot IA n'est pas configuré côté serveur." };
  }
  if (isTimeoutError(err)) {
    return { code: AI_COPILOT_ERROR.TIMEOUT, status: 503, message: "Le service met trop de temps à répondre. Réessayez dans quelques instants." };
  }
  if (err instanceof OrchestratorPermissionError || err instanceof PermissionDeniedError || (err && err.constructor && err.constructor.name === "AgentPermissionError")) {
    return { code: AI_COPILOT_ERROR.PERMISSION_DENIED, status: 403, message: "Vous n'avez pas la permission d'effectuer cette action." };
  }
  if (err instanceof ToolExecutionError || err instanceof ToolNotFoundError || err instanceof ToolValidationError) {
    return { code: AI_COPILOT_ERROR.TOOL_ERROR, status: 500, message: "Une action du Copilot a échoué. Réessayez." };
  }
  if (err instanceof Sequelize.BaseError) {
    return { code: AI_COPILOT_ERROR.DATABASE_ERROR, status: 500, message: "Une erreur de base de données est survenue côté serveur. L'équipe technique a été informée." };
  }
  return { code: AI_COPILOT_ERROR.INTERNAL_ERROR, status: 500, message: "Internal server error" };
}

module.exports = { AI_COPILOT_ERROR, classifyAiCopilotError };
