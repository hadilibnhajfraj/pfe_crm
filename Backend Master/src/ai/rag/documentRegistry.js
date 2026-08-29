"use strict";

// Tracks one entry per ingested source document (not per chunk): path,
// title, content hash, and the ids of the chunks currently in the vector
// store for it. This is what makes re-ingestion idempotent — register()
// tells the caller whether the content actually changed, and hands back
// the previous chunk ids so the ingestion service can delete stale ones
// before writing new ones (see ingestionService.js).
class DocumentRegistry {
  constructor() {
    this._documents = new Map();
  }

  register({ id, path, title, sourceType, contentHash }) {
    const existing = this._documents.get(id);
    if (existing && existing.contentHash === contentHash) {
      return { ...existing, unchanged: true, previousChunkIds: existing.chunkIds };
    }

    const previousChunkIds = existing ? existing.chunkIds : [];
    const document = { id, path, title, sourceType, contentHash, chunkIds: [] };
    this._documents.set(id, document);
    return { ...document, unchanged: false, previousChunkIds };
  }

  recordChunkIds(id, chunkIds) {
    const document = this._documents.get(id);
    if (document) document.chunkIds = chunkIds;
  }

  get(id) {
    return this._documents.get(id) || null;
  }

  list() {
    return Array.from(this._documents.values());
  }

  clear() {
    this._documents.clear();
  }
}

module.exports = { DocumentRegistry };
