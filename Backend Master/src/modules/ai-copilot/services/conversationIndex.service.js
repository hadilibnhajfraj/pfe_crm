"use strict";

// Tracks, PER OWNER, which conversationId's exist and their last-updated
// metadata (preview/intent) — NOT the message content itself, which stays
// exactly where it already lives: the orchestrator's own
// ConversationManager/IConversationMemory (src/ai/orchestrator,
// src/ai/memory), completely untouched by this module.
//
// This is a pure HTTP-delivery-layer concern: "list my past conversations"
// is a UI need (Flutter "Conversation History", see
// AI-Business-Copilot), not something the conversational kernel itself
// needs to reason about a turn — IConversationMemory's own doc comment
// explicitly scopes a persistent, owner-aware adapter as "out of scope for
// this infrastructure pass", so this stays a small, separate, additive
// piece rather than a retrofit of the already-validated orchestrator core
// (500-scenario corpus, see COPILOT_VALIDATION.md).
//
// Volatile (in-memory, lost on restart) — the SAME documented limitation as
// InMemoryConversationMemory itself, not a new one. A future persistent
// adapter (SQL/Redis) can implement the same 3 methods without any caller
// (aiCopilotBridge.service.js) changing.
class ConversationIndexService {
  constructor() {
    this._byOwner = new Map(); // ownerId -> Map<conversationId, entry>
    // `updatedAt` (ISO string) is display metadata only — millisecond
    // clock resolution means two touch() calls in the same tick can carry
    // an EQUAL updatedAt, which would make a naive string comparator
    // inconsistent (a<b false AND b<a false — neither order is "correct").
    // `_seq` is a monotonic counter, always strictly increasing, so
    // "most recently touched" has one unambiguous answer regardless of
    // clock resolution.
    this._seq = 0;
  }

  touch(ownerId, conversationId, { preview = null, intent = null } = {}) {
    if (!ownerId || !conversationId) return;
    const owned = this._byOwner.get(ownerId) || new Map();
    this._seq += 1;
    owned.set(conversationId, { conversationId, updatedAt: new Date().toISOString(), preview, intent, _seq: this._seq });
    this._byOwner.set(ownerId, owned);
  }

  // Newest first — `limit` caps the page size (default 20, mirrors
  // ConversationManager's own default history window).
  list(ownerId, { limit = 20 } = {}) {
    const owned = this._byOwner.get(ownerId);
    if (!owned) return [];
    return Array.from(owned.values())
      .sort((a, b) => b._seq - a._seq)
      .slice(0, limit)
      .map(({ _seq, ...entry }) => entry);
  }

  // Used before returning a conversation's full history: never let one
  // owner read a conversationId they never actually touched, even though
  // InMemoryConversationMemory itself has no ownership concept — see its
  // own doc comment ("not permission-scoped").
  isOwner(ownerId, conversationId) {
    const owned = this._byOwner.get(ownerId);
    return Boolean(owned && owned.has(conversationId));
  }
}

module.exports = { ConversationIndexService };
