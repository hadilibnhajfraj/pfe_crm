"use strict";

const { IVectorStore } = require("./vectorStore.interface");

function cosineSimilarity(a, b) {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * First concrete IVectorStore adapter (the port has existed since the
 * infrastructure-only pass — see AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md
 * §8 Phase 4/§13.3). Brute-force cosine similarity over an in-process Map,
 * grouped by `collection` so the RAG pipeline and any future consumer never
 * share an index by accident. Deliberately volatile — same disclosure as
 * InMemoryConversationMemory/InMemoryPromptRepository in the kernel: this
 * is the default, generic, offline adapter; a persistent store (pgvector,
 * a managed vector DB, ...) is a future adapter behind this same port, not
 * a rewrite of anything that depends on it.
 */
class InMemoryVectorStore extends IVectorStore {
  constructor() {
    super();
    this._collections = new Map();
  }

  async upsert(collection, records) {
    const store = this._collections.get(collection) || new Map();
    for (const record of records) {
      store.set(record.id, { vector: record.vector, metadata: record.metadata });
    }
    this._collections.set(collection, store);
    return { upserted: records.length };
  }

  async query(collection, vector, { topK = 10, minScore = 0 } = {}) {
    const store = this._collections.get(collection);
    if (!store) return [];

    const scored = [];
    for (const [id, record] of store.entries()) {
      const score = cosineSimilarity(vector, record.vector);
      if (score >= minScore) scored.push({ id, score, metadata: record.metadata });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, topK);
  }

  async delete(collection, ids) {
    const store = this._collections.get(collection);
    if (!store) return { deleted: 0 };
    let deleted = 0;
    for (const id of ids) {
      if (store.delete(id)) deleted++;
    }
    return { deleted };
  }

  size(collection) {
    const store = this._collections.get(collection);
    return store ? store.size : 0;
  }
}

module.exports = { InMemoryVectorStore, cosineSimilarity };
