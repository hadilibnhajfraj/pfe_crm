"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: durable per-user preferences for the Copilot itself (preferred
// language, response verbosity, favorite module, ...) — as opposed to
// ILongTermMemory (arbitrary remembered facts). Kept as its own port
// (ISP) rather than folded into ILongTermMemory: preferences and facts are
// read/written by different concerns (a settings screen vs. an inference
// the Copilot draws), even though both happen to be durable, hash-backed
// storage underneath (see memory/hashMemoryBase.js).
class IPreferenceMemory {
  async getPreference(_userId, _key) {
    throw new NotImplementedError("IPreferenceMemory", "getPreference");
  }

  async getAllPreferences(_userId) {
    throw new NotImplementedError("IPreferenceMemory", "getAllPreferences");
  }

  async setPreference(_userId, _key, _value) {
    throw new NotImplementedError("IPreferenceMemory", "setPreference");
  }

  async deletePreference(_userId, _key) {
    throw new NotImplementedError("IPreferenceMemory", "deletePreference");
  }
}

module.exports = { IPreferenceMemory };
