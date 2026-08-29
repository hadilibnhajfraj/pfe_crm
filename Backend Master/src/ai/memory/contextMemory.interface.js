"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: structured "current focus" slots for one conversation (e.g. the
// last module/entity discussed — {lastModule: "maintenance", lastEntityId:
// "MR-42"}), for pronoun/continuity resolution across turns ("and assign it
// to a technician" referring to the previous turn's request). Distinct
// from IConversationMemory (the raw message transcript): this is a small
// bag of named, overwritable slots, not an append-only log. Same lifetime
// class as ShortTermMemory (TTL-bound, dies with the conversation's active
// window — see memory/config.js::context.ttlSeconds).
class IContextMemory {
  async setContext(_conversationId, _key, _value) {
    throw new NotImplementedError("IContextMemory", "setContext");
  }

  async getContext(_conversationId, _key) {
    throw new NotImplementedError("IContextMemory", "getContext");
  }

  async getAllContext(_conversationId) {
    throw new NotImplementedError("IContextMemory", "getAllContext");
  }

  async clearContext(_conversationId) {
    throw new NotImplementedError("IContextMemory", "clearContext");
  }
}

module.exports = { IContextMemory };
