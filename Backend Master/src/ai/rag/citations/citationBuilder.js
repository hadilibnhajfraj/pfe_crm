"use strict";

const DEFAULT_EXCERPT_LENGTH = 240;

function truncate(text, maxLength) {
  if (!text || text.length <= maxLength) return text || "";
  return `${text.slice(0, maxLength).trim()}…`;
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/**
 * Turns retrieval results (vector-store hits, already reranked) into a
 * stable, minimal citation shape — so any future answer-generation step
 * (once an ILlmProvider adapter exists, see plan §13.2) can say "according
 * to <title>, section <heading>" and a caller can render a source list
 * without reaching back into the vector store.
 */
class CitationBuilder {
  constructor({ excerptLength = DEFAULT_EXCERPT_LENGTH } = {}) {
    this.excerptLength = excerptLength;
  }

  build(results) {
    return results.map((result, index) => {
      const metadata = result.metadata || {};
      return {
        index: index + 1,
        chunkId: result.id,
        sourceId: metadata.sourceId || null,
        title: metadata.title || null,
        sourceType: metadata.sourceType || null,
        path: metadata.path || null,
        heading: metadata.heading || null,
        page: metadata.page || null,
        chunkIndex: metadata.chunkIndex ?? null,
        excerpt: truncate(metadata.text, this.excerptLength),
        score: round(result.score, 4),
      };
    });
  }
}

module.exports = { CitationBuilder, truncate, round };
