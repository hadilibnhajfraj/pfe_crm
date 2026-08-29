"use strict";

const { IEmbeddingProvider } = require("./embeddingProvider.interface");
const { tokenize } = require("../../utils/tokenize");

// Two independent string hashes (djb2-style) per token: one picks the
// vector slot, the other picks the sign. Using a second, differently-seeded
// hash for the sign is the standard "signed feature hashing" trick — it
// keeps hash collisions from systematically inflating a slot's magnitude,
// which a same-hash-for-both-purposes version would do.
function hashToSlot(token, dimensions) {
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = ((hash << 5) + hash + token.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % dimensions;
}

function hashToSign(token) {
  let hash = 0;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 131 + token.charCodeAt(i)) | 0;
  }
  return (hash & 1) === 0 ? 1 : -1;
}

function l2Normalize(vector) {
  let sumSquares = 0;
  for (const v of vector) sumSquares += v * v;
  const norm = Math.sqrt(sumSquares) || 1;
  return vector.map((v) => v / norm);
}

/**
 * Deterministic, fully offline embedding adapter using the "hashing trick"
 * (feature hashing over a bag of words) — no external API call, no model
 * weights, no network. This is the kernel's default IEmbeddingProvider,
 * exactly like ILlmProvider has no default adapter until a Sprint 0
 * provider decision is made (see AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md
 * §13.2) — except embeddings genuinely need *something* working offline for
 * the RAG pipeline to be testable end-to-end without any external
 * dependency, so this adapter is intentionally shipped as the working
 * default. Swapping to a real embedding model/API later means writing one
 * more IEmbeddingProvider adapter — nothing else in the RAG pipeline
 * changes.
 */
class HashingEmbeddingProvider extends IEmbeddingProvider {
  constructor({ dimensions = 256 } = {}) {
    super();
    this._dimensions = dimensions;
  }

  get dimensions() {
    return this._dimensions;
  }

  async embed(text) {
    const vector = new Array(this._dimensions).fill(0);
    for (const token of tokenize(text)) {
      const slot = hashToSlot(token, this._dimensions);
      vector[slot] += hashToSign(token);
    }
    return l2Normalize(vector);
  }

  async embedBatch(texts) {
    return Promise.all(texts.map((text) => this.embed(text)));
  }
}

module.exports = { HashingEmbeddingProvider, tokenize };
