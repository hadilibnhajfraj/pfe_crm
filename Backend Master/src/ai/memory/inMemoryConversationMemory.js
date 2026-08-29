"use strict";

const { IConversationMemory } = require("./conversationMemory.interface");

// Reference adapter for local development/tests only: volatile (lost on
// restart) and not permission-scoped. Must be replaced by a persistent,
// owner-scoped adapter (see plan §4.4 "portée par propriétaire") before any
// real conversation data flows through it.
class InMemoryConversationMemory extends IConversationMemory {
  constructor() {
    super();
    this._store = new Map();
  }

  async append(conversationId, message) {
    const history = this._store.get(conversationId) || [];
    history.push({ ...message, at: new Date().toISOString() });
    this._store.set(conversationId, history);
  }

  async getHistory(conversationId, options = {}) {
    const history = this._store.get(conversationId) || [];
    const limit = options.limit || history.length;
    return history.slice(-limit);
  }

  async clear(conversationId) {
    this._store.delete(conversationId);
  }
}

module.exports = { InMemoryConversationMemory };
