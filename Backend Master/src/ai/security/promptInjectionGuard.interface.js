"use strict";

const { NotImplementedError } = require("../utils/errors");

// Port: "protection contre les injections de prompts" — scans a piece of
// text (a raw user message, or — the more dangerous case — a RAG-retrieved
// document excerpt: see langchain/context/ragContextBuilder.js) for known
// injection patterns. Deliberately synchronous: pattern matching is pure,
// offline, deterministic work (same "no ML weight to load" philosophy as
// HashingEmbeddingProvider/LexicalIntentRouter) — no I/O justifies making
// every call site `await` it.
class IPromptInjectionGuard {
  scan(_text) {
    throw new NotImplementedError("IPromptInjectionGuard", "scan");
  }
}

module.exports = { IPromptInjectionGuard };
