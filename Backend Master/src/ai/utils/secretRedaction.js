"use strict";

// Lowest-layer utility (no dependency on any other src/ai/ subfolder, same
// rule as utils/errors.js and utils/logger.js) so utils/logger.js can wire
// it into EVERY namespaced logger in the kernel (mcp:, rag:, langchain:,
// orchestrator:, agents:, memory:, automations:, dashboard:, security:) with
// one change, rather than trusting each of the ~2000 individual log call
// sites across this kernel to remember never to log a secret. Re-exported
// from security/secretRedactor.js for discoverability under the "protection
// des secrets" pillar — this file is the actual implementation.
//
// Best-effort, like every other heuristic in this kernel (LexicalIntentRouter,
// HashingEmbeddingProvider, PromptInjectionGuard, ...): pattern-matches
// COMMON secret shapes (bearer tokens, JWTs, connection-string passwords,
// long high-entropy-looking key/token assignments) and known secret-shaped
// field NAMES (api_key, password, ...). It cannot catch every possible
// secret — treat it as a safety net, not a guarantee, and never rely on it
// as the only reason a real secret is safe to log.

const SECRET_KEY_NAME_PATTERN = /(secret|api[_-]?key|apikey|token|password|passwd|pwd|authorization|credential|private[_-]?key)/i;

// Order matters: the generic "key = value"/"key": "value" pattern runs
// FIRST and, being the most general, would otherwise re-match text that a
// later, more specific pattern (JWT, Bearer) had already replaced — e.g.
// "token=eyJ...jwt" redacted by the JWT pattern into "token=[REDACTED_JWT]"
// would then get matched AGAIN by the generic pattern (which sees
// "token=[REDACTED_JWT]" as just another key=value pair) and collapse into
// "token=[REDACTED]". Running the generic pattern first avoids that
// compounding entirely — it simply wins outright whenever a key name is
// present, which is still a correct (if less specific) redaction.
const SECRET_VALUE_PATTERNS = [
  // A quoted OR bare assignment to an obviously secret-shaped key:
  // "apiKey": "...", apiKey=..., API_KEY: '...' — an optional quote is
  // allowed directly after the key name too (JSON always quotes keys:
  // "apiKey": "value").
  { pattern: /((?:api[_-]?key|apikey|secret|token|password|passwd|pwd)["']?\s*[:=]\s*)(["']?)([^"'\s,}]{4,})\2/gi, replacement: "$1$2[REDACTED]$2" },
  // "Authorization: Bearer <token>" or a bare "Bearer <token>" fragment.
  { pattern: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/gi, replacement: "Bearer [REDACTED]" },
  // JSON Web Tokens (three base64url segments separated by dots) appearing
  // on their own, without a preceding secret-shaped key — e.g. a raw token
  // embedded mid-sentence in a log message.
  { pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, replacement: "[REDACTED_JWT]" },
  // Connection-string passwords: scheme://user:PASSWORD@host — keeps the
  // scheme/user/host visible (useful for debugging), hides only the secret.
  { pattern: /(redis|rediss|postgres|postgresql|mysql|mongodb(?:\+srv)?):\/\/([^:/@\s]*):([^@\s]+)@/gi, replacement: "$1://$2:[REDACTED]@" },
];

function redactString(text) {
  if (typeof text !== "string") return text;
  let result = text;
  for (const { pattern, replacement } of SECRET_VALUE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

function redact(value, seen = new WeakSet()) {
  if (typeof value === "string") return redactString(value);
  if (value instanceof Error) {
    // AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md — `new Error(...)`
    // seul générait une PILE D'APPELS FACTICE, pointant vers CETTE ligne de
    // redaction plutôt que vers l'endroit réel où l'erreur d'origine a été
    // levée (ex. au fond d'un appel fournisseur LLM) — la stack technique
    // demandée pour le diagnostic serveur (étape 1) était donc invisible
    // même dans les logs, alors que `classifyAgentError()` (agentErrorClassification.js)
    // dépaquette déjà correctement `.cause` pour la CLASSIFICATION, ce
    // dépaquetage n'était jamais reflété dans ce qui est LOGGÉ. Corrigé :
    // on garde la VRAIE stack (juste passée par `redactString`, une stack
    // ne contient normalement aucun secret mais reste protégée par
    // cohérence) et la cause d'origine (récursivement passée par `redact`,
    // jamais un secret exposé — voir `WorkflowError`/`ToolExecutionError`).
    const redactedError = new Error(redactString(value.message));
    redactedError.name = value.name;
    if (value.stack) redactedError.stack = redactString(value.stack);
    if (value.cause !== undefined) redactedError.cause = redact(value.cause, seen);
    return redactedError;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, seen));
  if (value && typeof value === "object") {
    if (seen.has(value)) return "[CIRCULAR]";
    seen.add(value);
    const result = {};
    for (const [key, val] of Object.entries(value)) {
      result[key] = SECRET_KEY_NAME_PATTERN.test(key) ? "[REDACTED]" : redact(val, seen);
    }
    return result;
  }
  return value;
}

module.exports = { redact, redactString, SECRET_KEY_NAME_PATTERN };
