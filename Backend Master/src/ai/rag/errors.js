"use strict";

const { AiError, ConfigurationError } = require("../utils/errors");

// Typed errors for the RAG subsystem. SourceNotAllowedError is the most
// important one: it is the enforcement mechanism behind "never read CRM
// business data" — see sourceGuard.js.
class RagError extends AiError {}

class SourceNotAllowedError extends RagError {
  constructor(absolutePath, reason) {
    super(`Source "${absolutePath}" is not an allowed documentation source: ${reason}`);
    this.path = absolutePath;
    this.reason = reason;
  }
}

class UnsupportedSourceTypeError extends RagError {
  constructor(absolutePath) {
    super(`No loader registered for "${absolutePath}".`);
    this.path = absolutePath;
  }
}

class EmptyQueryError extends RagError {
  constructor() {
    super("Query text must not be empty.");
  }
}

// Phase 2 — documents téléversés dans le Copilot. `code` est stable et
// traduit en statut HTTP par le contrôleur (jamais le message interne).
class DocumentError extends RagError {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

module.exports = {
  RagError,
  SourceNotAllowedError,
  UnsupportedSourceTypeError,
  EmptyQueryError,
  DocumentError,
  ConfigurationError,
};
