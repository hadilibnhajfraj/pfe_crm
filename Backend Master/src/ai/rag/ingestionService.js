"use strict";

const crypto = require("crypto");
const path = require("path");
const { UnsupportedSourceTypeError } = require("./errors");
const { createRagLogger } = require("./logger");

const logger = createRagLogger("ingestion");
const DEFAULT_COLLECTION = "documentation";

function hashText(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// Stable id derived from the normalized absolute path — re-ingesting the
// same file always maps to the same document id, which is what makes
// DocumentRegistry's change-detection meaningful across process restarts
// (once the registry itself is backed by something persistent — today it
// is in-memory, so this only matters within one process's lifetime).
function makeSourceId(absolutePath) {
  return crypto.createHash("sha1").update(path.resolve(absolutePath)).digest("hex").slice(0, 16);
}

/**
 * Orchestrates ingestion → SourceGuard → loader → chunker → embedder →
 * vector store, tracked through DocumentRegistry for idempotent
 * re-ingestion. Every file this service touches has already passed
 * SourceGuard by construction: ingestFile() asserts it, and
 * ingestDirectories() only ever receives paths the scanner already
 * filtered through the same guard.
 */
class RagIngestionService {
  constructor({ sourceGuard, loaderRegistry, scanner, chunker, embeddingProvider, vectorStore, documentRegistry, collection = DEFAULT_COLLECTION, displayRoot }) {
    this.sourceGuard = sourceGuard;
    this.loaderRegistry = loaderRegistry;
    this.scanner = scanner;
    this.chunker = chunker;
    this.embeddingProvider = embeddingProvider;
    this.vectorStore = vectorStore;
    this.documentRegistry = documentRegistry;
    this.collection = collection;
    this.displayRoot = displayRoot ? path.resolve(displayRoot) : null;
  }

  async ingestFile(absolutePath) {
    this.sourceGuard.assertAllowed(absolutePath);

    const loader = this.loaderRegistry.resolve(absolutePath);
    if (!loader) throw new UnsupportedSourceTypeError(absolutePath);

    const loaded = await loader.load(absolutePath);
    const sourceId = makeSourceId(absolutePath);
    const title = loaded.title || path.basename(absolutePath);
    const sourceType = loader.sourceType;
    const displayPath = this._toDisplayPath(absolutePath);
    const contentHash = hashText(loaded.text || "");

    const registration = this.documentRegistry.register({ id: sourceId, path: displayPath, title, sourceType, contentHash });
    if (registration.unchanged) {
      logger.info(`unchanged, skipped: "${displayPath}"`);
      return { sourceId, path: displayPath, chunkCount: registration.chunkIds.length, skipped: true };
    }

    if (registration.previousChunkIds.length) {
      await this.vectorStore.delete(this.collection, registration.previousChunkIds);
    }

    const baseMetadata = { sourceId, title, sourceType, path: displayPath };
    const rawChunks = this._chunkLoaded(loaded, baseMetadata);

    if (rawChunks.length === 0) {
      this.documentRegistry.recordChunkIds(sourceId, []);
      logger.warn(`"${displayPath}" produced no chunks (empty or whitespace-only content)`);
      return { sourceId, path: displayPath, chunkCount: 0, skipped: false };
    }

    const vectors = await this.embeddingProvider.embedBatch(rawChunks.map((chunk) => chunk.text));
    const records = rawChunks.map((chunk, i) => ({
      id: `${sourceId}#${chunk.chunkIndex}`,
      vector: vectors[i],
      metadata: chunk,
    }));

    await this.vectorStore.upsert(this.collection, records);
    this.documentRegistry.recordChunkIds(sourceId, records.map((r) => r.id));
    logger.info(`ingested "${displayPath}": ${records.length} chunk(s)`);

    return { sourceId, path: displayPath, chunkCount: records.length, skipped: false };
  }

  async ingestPaths(absolutePaths) {
    const results = [];
    for (const absolutePath of absolutePaths) {
      try {
        results.push(await this.ingestFile(absolutePath));
      } catch (err) {
        logger.warn(`failed to ingest "${absolutePath}": ${err.message}`);
        results.push({ path: absolutePath, error: err.message });
      }
    }
    return results;
  }

  async ingestDirectories(roots) {
    const files = this.scanner.scan(roots);
    return this.ingestPaths(files);
  }

  // Paginated sources (PDF) are chunked page by page so each chunk keeps an
  // accurate page number; everything else is chunked as one document.
  _chunkLoaded(loaded, baseMetadata) {
    if (Array.isArray(loaded.pages)) {
      const perPage = [];
      loaded.pages.forEach((pageText, pageIndex) => {
        perPage.push(...this.chunker.chunk(pageText, { ...baseMetadata, page: pageIndex + 1, heading: null }));
      });
      return perPage.map((chunk, i) => ({ ...chunk, chunkIndex: i }));
    }
    return this.chunker.chunk(loaded.text, { ...baseMetadata, page: null });
  }

  _toDisplayPath(absolutePath) {
    const resolved = path.resolve(absolutePath);
    if (this.displayRoot && resolved.startsWith(this.displayRoot + path.sep)) {
      return path.relative(this.displayRoot, resolved).split(path.sep).join("/");
    }
    return resolved;
  }
}

module.exports = { RagIngestionService, makeSourceId, hashText, DEFAULT_COLLECTION };
