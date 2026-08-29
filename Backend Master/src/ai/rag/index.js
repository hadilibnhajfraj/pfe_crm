"use strict";

// A full RAG implementation now lives behind the IRetriever port defined
// here — see pipeline.js for the composition root and src/ai/README.md for
// the component-by-component writeup. Constraint enforced by sourceGuard.js
// and mechanically checked by test/ai.rag.policy.test.js: this subsystem
// never reads CRM business data (models/modules/routes/services), only
// documentation/UML/API/guides/FAQ/PDF sources.
const { IRetriever } = require("./retriever.interface");
const { RagError, SourceNotAllowedError, UnsupportedSourceTypeError, EmptyQueryError } = require("./errors");
const { createRagLogger } = require("./logger");
const { loadRagConfig } = require("./config");
const { SourceGuard, DEFAULT_ALLOWED_EXTENSIONS } = require("./sourceGuard");
const { DocumentRegistry } = require("./documentRegistry");
const { RagIngestionService, DEFAULT_COLLECTION } = require("./ingestionService");
const { RagRetrievalService } = require("./retrievalService");
const { createRagPipeline } = require("./pipeline");

module.exports = {
  IRetriever,
  RagError,
  SourceNotAllowedError,
  UnsupportedSourceTypeError,
  EmptyQueryError,
  createRagLogger,
  loadRagConfig,
  SourceGuard,
  DEFAULT_ALLOWED_EXTENSIONS,
  DocumentRegistry,
  RagIngestionService,
  DEFAULT_COLLECTION,
  RagRetrievalService,
  createRagPipeline,
};
