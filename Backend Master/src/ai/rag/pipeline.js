"use strict";

const { loadRagConfig } = require("./config");
const { SourceGuard } = require("./sourceGuard");
const { createDefaultLoaderRegistry, DirectoryScanner } = require("./ingestion");
const { RecursiveTextChunker } = require("./chunking");
const { HashingEmbeddingProvider } = require("./embeddings");
const { InMemoryVectorStore } = require("../vector");
const { LexicalOverlapReranker } = require("./reranking");
const { CitationBuilder } = require("./citations");
const { DocumentRegistry } = require("./documentRegistry");
const { RagIngestionService, DEFAULT_COLLECTION } = require("./ingestionService");
const { RagRetrievalService } = require("./retrievalService");
const { UserDocumentService, USER_DOCUMENT_COLLECTION } = require("./userDocumentService");

/**
 * Composition root for the RAG subsystem (mirrors manager/index.js and
 * mcp/server/start.js): wires the default, offline, dependency-free
 * adapters into a working ingestion + retrieval pair. Constructing this
 * does NOT read any file or perform any I/O — ingestion only happens when
 * the caller explicitly calls ingestionService.ingestDirectories(...)/
 * ingestFile(...), same "inert until asked" discipline as the rest of the
 * kernel (createDefaultAiManager, ToolLoader).
 *
 * `allowedRoots` has no default here on purpose — SourceGuard itself
 * refuses to be built without at least one explicit root (see
 * sourceGuard.js). Callers decide what counts as "documentation" for their
 * process; see reindex.js for the roots this repository actually uses.
 */
function createRagPipeline({ allowedRoots, collection = DEFAULT_COLLECTION, displayRoot, env = process.env } = {}) {
  const config = loadRagConfig(env);

  const sourceGuard = new SourceGuard({ allowedRoots });
  const loaderRegistry = createDefaultLoaderRegistry();
  const scanner = new DirectoryScanner({ sourceGuard });
  const chunker = new RecursiveTextChunker({ chunkSize: config.chunkSize, chunkOverlap: config.chunkOverlap });
  const embeddingProvider = new HashingEmbeddingProvider({ dimensions: config.embeddingDimensions });
  const vectorStore = new InMemoryVectorStore();
  const reranker = new LexicalOverlapReranker();
  const citationBuilder = new CitationBuilder();
  const documentRegistry = new DocumentRegistry();

  const ingestionService = new RagIngestionService({
    sourceGuard,
    loaderRegistry,
    scanner,
    chunker,
    embeddingProvider,
    vectorStore,
    documentRegistry,
    collection,
    displayRoot,
  });

  const retrievalService = new RagRetrievalService({
    embeddingProvider,
    vectorStore,
    reranker,
    citationBuilder,
    collection,
    topK: config.topK,
    candidateK: config.candidateK,
    minScore: config.minScore,
  });

  // Phase 2 — documents téléversés dans le Copilot : MÊMES composants (chunker,
  // embeddings, vector store, reranker, citations), collection dédiée. Voir
  // userDocumentService.js pour le cloisonnement par propriétaire.
  const userDocumentRetrievalService = new RagRetrievalService({
    embeddingProvider,
    vectorStore,
    reranker,
    citationBuilder,
    collection: USER_DOCUMENT_COLLECTION,
    topK: config.topK,
    candidateK: config.candidateK,
    minScore: config.minScore,
  });
  const userDocumentService = new UserDocumentService({
    ingestionService,
    retrievalService: userDocumentRetrievalService,
    vectorStore,
  });

  return {
    config,
    userDocumentService,
    sourceGuard,
    loaderRegistry,
    scanner,
    chunker,
    embeddingProvider,
    vectorStore,
    reranker,
    citationBuilder,
    documentRegistry,
    ingestionService,
    retrievalService,
  };
}

module.exports = { createRagPipeline };
