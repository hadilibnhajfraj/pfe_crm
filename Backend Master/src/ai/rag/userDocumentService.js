"use strict";

const crypto = require("crypto");
const { extractDocumentText } = require("./ingestion/bufferLoaders");
const { DocumentError } = require("./errors");
const { createRagLogger } = require("./logger");

const logger = createRagLogger("user-documents");
const USER_DOCUMENT_COLLECTION = "user_documents";

/**
 * # UserDocumentService — documents téléversés dans le Copilot (Phase 2)
 *
 * Réutilise le RAG EXISTANT (même `RagIngestionService`, même chunker,
 * mêmes embeddings, même `InMemoryVectorStore`, même `RagRetrievalService`)
 * dans une COLLECTION DÉDIÉE (`user_documents`) : un seul système RAG, jamais
 * de mélange entre documentation partagée et documents personnels.
 *
 * ## Permissions — un document n'est visible QUE par son propriétaire
 * Chaque chunk porte `ownerId`/`documentId` dans ses métadonnées ; TOUTE
 * lecture (recherche, relecture, liste, suppression) filtre sur l'identité
 * AUTHENTIFIÉE (`ownerId` = JWT), jamais sur un identifiant fourni seul par
 * le client. Un document d'un autre utilisateur est indiscernable d'un
 * document inexistant (même réponse `null`/404, aucune fuite d'existence).
 * Aucun rôle (même admin) ne lit les documents d'autrui : ce sont des
 * fichiers personnels de travail, pas des données CRM partagées.
 *
 * ## Limites
 * - En mémoire du process (comme le reste du RAG et du Copilot) : un
 *   redémarrage efface les documents — assumé et documenté.
 * - Durée de vie (24 h par défaut), nombre de documents par utilisateur,
 *   nombre de chunks par document : bornés.
 * - Le fichier original n'est JAMAIS conservé : seul le texte découpé l'est.
 */
class UserDocumentService {
  constructor({
    ingestionService,
    retrievalService,
    vectorStore,
    collection = USER_DOCUMENT_COLLECTION,
    ttlMs = 24 * 60 * 60 * 1000,
    maxDocumentsPerUser = 10,
    maxChunksPerDocument = 1500,
    clock = () => Date.now(),
  }) {
    this.ingestionService = ingestionService;
    this.retrievalService = retrievalService;
    this.vectorStore = vectorStore;
    this.collection = collection;
    this.ttlMs = ttlMs;
    this.maxDocumentsPerUser = maxDocumentsPerUser;
    this.maxChunksPerDocument = maxChunksPerDocument;
    this.clock = clock;
    this._documents = new Map(); // documentId -> record (avec chunkIds, ownerId)
  }

  _public(record) {
    return {
      documentId: record.id,
      filename: record.filename,
      sourceType: record.sourceType,
      size: record.size,
      pageCount: record.pageCount,
      chunkCount: record.chunkIds.length,
      uploadedAt: new Date(record.uploadedAt).toISOString(),
      expiresAt: new Date(record.uploadedAt + this.ttlMs).toISOString(),
    };
  }

  async _purgeExpired() {
    const now = this.clock();
    for (const record of [...this._documents.values()]) {
      if (now - record.uploadedAt > this.ttlMs) await this._drop(record);
    }
  }

  async _drop(record) {
    this._documents.delete(record.id);
    if (record.chunkIds.length) await this.vectorStore.delete(this.collection, record.chunkIds);
  }

  _owned(ownerId, documentId) {
    const record = this._documents.get(documentId);
    if (!record || !ownerId || record.ownerId !== ownerId) return null;
    if (this.clock() - record.uploadedAt > this.ttlMs) return null;
    return record;
  }

  /**
   * @param {{ ownerId: string, filename: string, kind: string, buffer: Buffer }} input
   *   `filename` déjà assaini et `kind` déjà validé (extension + signature) en amont.
   */
  async addDocument({ ownerId, filename, kind, buffer }) {
    if (!ownerId) throw new DocumentError("DOCUMENT_FORBIDDEN", "Utilisateur non identifié.", 403);
    await this._purgeExpired();
    const owned = [...this._documents.values()].filter((d) => d.ownerId === ownerId);
    if (owned.length >= this.maxDocumentsPerUser) {
      throw new DocumentError(
        "DOCUMENT_LIMIT",
        `Vous avez déjà ${owned.length} documents actifs (maximum ${this.maxDocumentsPerUser}). Supprimez-en un avant d'en ajouter un autre.`,
        429
      );
    }

    const startedAt = this.clock();
    const extracted = await extractDocumentText(buffer, kind);
    const documentId = crypto.randomUUID();
    const uploadedAt = this.clock();
    const baseMetadata = {
      documentId,
      ownerId,
      filename,
      sourceId: documentId,
      title: filename,
      sourceType: extracted.sourceType,
      path: filename,
      source: "user_upload",
      uploadedAt: new Date(uploadedAt).toISOString(),
    };
    const chunkIds = await this.ingestionService.ingestLoaded(extracted, baseMetadata, { idPrefix: documentId, collection: this.collection });
    if (chunkIds.length > this.maxChunksPerDocument) {
      await this.vectorStore.delete(this.collection, chunkIds);
      throw new DocumentError("DOCUMENT_TOO_LARGE", "Le document est trop volumineux pour être analysé par le Copilot.", 413);
    }

    const record = {
      id: documentId,
      ownerId,
      filename,
      sourceType: extracted.sourceType,
      size: buffer.length,
      pageCount: extracted.pages ? extracted.pages.length : null,
      uploadedAt,
      chunkIds,
    };
    this._documents.set(documentId, record);
    // Jamais le nom de fichier ni le contenu dans les logs : identifiants et tailles seulement.
    logger.info(`document ${documentId} indexé : type=${extracted.sourceType} taille=${buffer.length}o chunks=${chunkIds.length} durée=${this.clock() - startedAt}ms`);
    return this._public(record);
  }

  async listDocuments(ownerId) {
    await this._purgeExpired();
    return [...this._documents.values()].filter((d) => d.ownerId === ownerId).map((d) => this._public(d));
  }

  getDocument(ownerId, documentId) {
    const record = this._owned(ownerId, documentId);
    return record ? this._public(record) : null;
  }

  /** Ne garde QUE les documents appartenant à `ownerId` (ordre conservé, doublons retirés). */
  filterOwned(ownerId, documentIds) {
    const seen = new Set();
    const result = [];
    for (const id of Array.isArray(documentIds) ? documentIds : []) {
      if (typeof id !== "string" || seen.has(id)) continue;
      seen.add(id);
      const record = this._owned(ownerId, id);
      if (record) result.push(this._public(record));
    }
    return result;
  }

  async removeDocument(ownerId, documentId) {
    const record = this._owned(ownerId, documentId);
    if (!record) return false;
    await this._drop(record);
    logger.info(`document ${documentId} supprimé par son propriétaire`);
    return true;
  }

  /**
   * Recherche sémantique restreinte aux documents POSSÉDÉS listés — filtre
   * appliqué dans le vector store (jamais évalué pour un autre propriétaire),
   * puis revérifié sur chaque résultat (défense en profondeur).
   */
  async search(ownerId, documentIds, query, { topK = 6 } = {}) {
    const allowed = new Set(this.filterOwned(ownerId, documentIds).map((d) => d.documentId));
    if (!allowed.size) return { results: [], citations: [] };
    const filter = (m) => m.ownerId === ownerId && allowed.has(m.documentId);
    const { results } = await this.retrievalService.retrieve(query, { topK, candidateK: Math.max(topK * 4, 20), filter, logQuery: false });
    const safe = results.filter((r) => allowed.has(r.documentId));
    return { results: safe };
  }

  /**
   * Extraits répartis sur tout le document (début, milieu, fin) — pour un
   * résumé fondé sur un ÉCHANTILLON borné, jamais sur le document entier.
   */
  async representativeChunks(ownerId, documentId, max = 8) {
    const record = this._owned(ownerId, documentId);
    if (!record || !record.chunkIds.length) return { chunks: [], total: 0 };
    const ids = record.chunkIds;
    const step = ids.length <= max ? 1 : ids.length / max;
    const picked = [];
    for (let i = 0; i < Math.min(max, ids.length); i++) picked.push(ids[Math.floor(i * step)]);
    const rows = await this.vectorStore.getMany(this.collection, picked);
    return {
      chunks: rows
        .filter((r) => r.metadata.ownerId === ownerId)
        .map((r) => ({ chunkId: r.id, text: r.metadata.text, page: r.metadata.page ?? null, pageLabel: r.metadata.pageLabel || null, filename: r.metadata.filename, documentId })),
      total: ids.length,
    };
  }
}

module.exports = { UserDocumentService, USER_DOCUMENT_COLLECTION };
