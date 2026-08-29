"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: durable, cross-session facts remembered about a user (e.g. "prefers
// concise answers", "usually asks about the Maintenance module") — as
// opposed to ShortTermMemory (one conversation's transcript, TTL-bound) or
// SessionMemory (one session's envelope, TTL-bound). No TTL by default (see
// memory/config.js::longTerm.ttlSeconds, defaults to `null` = never
// expires) — "long term" is the point.
class ILongTermMemory {
  async remember(_userId, _factKey, _value) {
    throw new NotImplementedError("ILongTermMemory", "remember");
  }

  async recall(_userId, _factKey) {
    throw new NotImplementedError("ILongTermMemory", "recall");
  }

  async recallAll(_userId) {
    throw new NotImplementedError("ILongTermMemory", "recallAll");
  }

  async forget(_userId, _factKey) {
    throw new NotImplementedError("ILongTermMemory", "forget");
  }
}

module.exports = { ILongTermMemory };
