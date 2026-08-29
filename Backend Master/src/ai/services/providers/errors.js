"use strict";

const { AiError } = require("../../utils/errors");

// Thrown by every concrete ILlmProvider adapter on a failed HTTP call. Every
// message here is ALWAYS a fixed, provider-named string — never the raw
// axios error (which can carry request headers, i.e. the API key) and never
// the response body. `AIManager.handleMessage()`'s catch-all
// (orchestrator/responseBuilder.js::buildErrorResponse) surfaces
// `AiError.message` verbatim to the end user, so every message here must
// stay safe by construction, not by hoping every call site remembers to
// redact.
//
// Four distinct families (see AI-Business-Copilot/08_LLM_PROVIDER_OPENAI.md)
// — a bad API key and a transient network blip need different user-facing
// messages and different retry behavior (see retry.js), so a single generic
// "request failed" was no longer enough once that distinction was asked for.

// Genuinely unexpected failure — a non-2xx/network shape this classifier
// doesn't recognise, or the provider returning something structurally
// unusable. Kept as the base/fallback class for backward compatibility with
// existing call sites.
class LlmProviderRequestError extends AiError {
  constructor(providerName) {
    super(`${providerName} request failed — see server logs for details.`);
  }
}

// The API key was rejected (401/403) — retrying the SAME request will never
// succeed, so this is NEVER retried (see retry.js::isRetryableProviderError).
class LlmProviderAuthError extends LlmProviderRequestError {
  constructor(providerName) {
    super(providerName);
    this.message = `${providerName} rejected the configured API key — check AI_LLM_API_KEY.`;
  }
}

// The provider itself is down/overloaded (5xx) or unreachable (network-level
// failure, no HTTP response at all) — worth a bounded retry.
class LlmProviderUnavailableError extends LlmProviderRequestError {
  constructor(providerName) {
    super(providerName);
    this.message = `${providerName} is temporarily unavailable. Please try again shortly.`;
  }
}

// The request took too long (axios `timeout`, ECONNABORTED/ETIMEDOUT) —
// distinct from "unavailable" because a slow single call is not the same
// signal as a downed service, even though both are worth one bounded retry.
class LlmProviderTimeoutError extends LlmProviderRequestError {
  constructor(providerName) {
    super(providerName);
    this.message = `${providerName} did not respond in time. Please try again.`;
  }
}

// Inspects a raw axios error (NEVER re-thrown as-is — see the class
// comments above) and returns the right typed AiError. Shared by every
// concrete provider (openAiProvider.js, anthropicProvider.js, and any
// future one — gemini/mistral/ollama, see providers/index.js) so this
// classification is written and tested exactly once.
function classifyProviderHttpError(err, providerName) {
  const status = err && err.response && err.response.status;
  if (status === 401 || status === 403) return new LlmProviderAuthError(providerName);
  if (err && (err.code === "ECONNABORTED" || err.code === "ETIMEDOUT")) return new LlmProviderTimeoutError(providerName);
  // 429 (rate limit), 5xx, or no response at all (DNS/connection-refused/
  // network-level failure — axios errors for these have no `.response`) —
  // all mean the provider itself is the problem, never our request; a rate
  // limit is worth the SAME bounded retry as a 5xx (confirmed hitting this
  // live while testing kpi_agent, see
  // AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md — 429 previously fell
  // through to the generic, non-retried LlmProviderRequestError).
  if (!status || status === 429 || status >= 500) return new LlmProviderUnavailableError(providerName);
  return new LlmProviderRequestError(providerName);
}

// AI-Business-Copilot/13_LLM_QUOTA_ROOT_CAUSE.md — jusqu'ici, chaque
// adapter (openAiProvider.js/anthropicProvider.js) ne loggait que
// `err.message` (le message générique d'axios, ex. "Request failed with
// status code 429") avant de lancer l'erreur classifiée et volontairement
// générique (voir plus haut) — le VRAI corps de réponse du fournisseur
// (`err.response.data`, ex. `{"error":{"type":"insufficient_quota","code":
// "credit_balance_exhausted", ...}}`) n'était JAMAIS journalisé, alors
// qu'il ne contient jamais de secret (jamais la clé API — celle-ci ne
// voyage que dans l'en-tête de la REQUÊTE, jamais échoée dans une réponse
// d'erreur) et qu'il distingue "quota épuisé" d'un simple ralentissement
// passager. Diagnostiquer la cause exacte a nécessité un appel HTTP direct
// hors de ce classifieur — désormais inutile pour la prochaine fois : ce
// corps de réponse est journalisé (jamais renvoyé à l'utilisateur, comme
// tout le reste de ce fichier).
function describeProviderHttpError(err) {
  const status = err && err.response && err.response.status;
  const detail = err && err.response && err.response.data ? JSON.stringify(err.response.data) : (err && err.message) || String(err);
  return `status=${status || "n/a"}: ${detail}`;
}

module.exports = {
  LlmProviderRequestError,
  LlmProviderAuthError,
  LlmProviderUnavailableError,
  LlmProviderTimeoutError,
  classifyProviderHttpError,
  describeProviderHttpError,
};
