"use strict";

const { IRetriever } = require("./retriever.interface");
const { EmptyQueryError } = require("./errors");
const { CitationBuilder } = require("./citations");
const { createRagLogger } = require("./logger");
const { DEFAULT_COLLECTION } = require("./ingestionService");

const logger = createRagLogger("retrieval");

/**
 * Concrete IRetriever: embed query → vector store search → optional
 * rerank → citations. This is the only RAG component a consumer outside
 * `rag/` should ever need to know about — everything else (ingestion,
 * chunking, embeddings, the vector store, reranking) is an implementation
 * detail behind this facade. It never touches a CRM service or model: its
 * only dependencies are the embedding provider and the vector store it was
 * constructed with.
 */
class RagRetrievalService extends IRetriever {
  constructor({
    embeddingProvider,
    vectorStore,
    reranker = null,
    citationBuilder = new CitationBuilder(),
    collection = DEFAULT_COLLECTION,
    topK = 5,
    candidateK = 20,
    minScore = 0,
  }) {
    super();
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.reranker = reranker;
    this.citationBuilder = citationBuilder;
    this.collection = collection;
    this.topK = topK;
    this.candidateK = candidateK;
    this.minScore = minScore;
  }

  async retrieve(query, options = {}) {
    if (!query || !query.trim()) throw new EmptyQueryError();

    const queryVector = await this.embeddingProvider.embed(query);
    let candidates = await this.vectorStore.query(this.collection, queryVector, {
      topK: options.candidateK || this.candidateK,
      minScore: options.minScore ?? this.minScore,
      // Phase 2 — restriction par métadonnées (propriétaire/document), voir
      // InMemoryVectorStore.query. Absent : comportement inchangé.
      filter: options.filter || null,
    });

    if (this.reranker && candidates.length > 0) {
      candidates = await this.reranker.rerank(query, candidates);
    }

    const topK = options.topK || this.topK;
    const top = candidates.slice(0, topK);
    // `logQuery: false` (documents utilisateur) : la question peut révéler le
    // contenu d'un document personnel — seuls les compteurs sont journalisés.
    const shownQuery = options.logQuery === false ? "[masquée]" : query;
    logger.info(`retrieve("${shownQuery}"): ${candidates.length} candidate(s), returning ${top.length}`);

    return {
      query,
      results: top.map((c) => ({
        chunkId: c.id,
        score: c.score,
        text: c.metadata.text,
        sourceId: c.metadata.sourceId,
        title: c.metadata.title,
        // Métadonnées des documents utilisateur (Phase 2) — ajoutées
        // UNIQUEMENT pour ces chunks : le corpus de documentation renvoie
        // exactement le même objet qu'avant.
        ...(c.metadata.documentId
          ? { documentId: c.metadata.documentId, filename: c.metadata.filename, page: c.metadata.page ?? null, chunkIndex: c.metadata.chunkIndex ?? null }
          : {}),
      })),
      citations: this.citationBuilder.build(top),
    };
  }
}

module.exports = { RagRetrievalService };
