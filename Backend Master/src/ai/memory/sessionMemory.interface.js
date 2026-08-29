"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: the session envelope around a user's active use of the Copilot
// (who, since when, last active when, which conversation) — distinct from
// IConversationMemory (the message transcript itself) and from
// IContextMemory (structured "current focus" slots) below.
class ISessionMemory {
  async startSession(_sessionId, _data) {
    throw new NotImplementedError("ISessionMemory", "startSession");
  }

  async getSession(_sessionId) {
    throw new NotImplementedError("ISessionMemory", "getSession");
  }

  async touchSession(_sessionId) {
    throw new NotImplementedError("ISessionMemory", "touchSession");
  }

  async updateSession(_sessionId, _patch) {
    throw new NotImplementedError("ISessionMemory", "updateSession");
  }

  async endSession(_sessionId) {
    throw new NotImplementedError("ISessionMemory", "endSession");
  }
}

module.exports = { ISessionMemory };
