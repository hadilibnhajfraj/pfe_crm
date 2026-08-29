"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: conversation history storage keyed by conversationId. The
// persistent, permission-aware adapter (ai_conversations/ai_messages
// tables, see plan §6) is out of scope for this infrastructure pass.
class IConversationMemory {
  async append(_conversationId, _message) {
    throw new NotImplementedError("IConversationMemory", "append");
  }

  async getHistory(_conversationId, _options) {
    throw new NotImplementedError("IConversationMemory", "getHistory");
  }

  async clear(_conversationId) {
    throw new NotImplementedError("IConversationMemory", "clear");
  }
}

module.exports = { IConversationMemory };
