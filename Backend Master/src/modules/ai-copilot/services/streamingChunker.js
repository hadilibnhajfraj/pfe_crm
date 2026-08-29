"use strict";

// Splits an ALREADY-COMPLETE answer into word-group chunks for an
// artificial "typing reveal" effect over the WebSocket
// (ai-copilot:chunk events, see socket/aiCopilotSocket.js) — this is NOT
// real LLM token streaming: no ILlmProvider in this kernel implements
// `stream()` (see llmProviderChatModel.js's own contract comment, and
// services/providers/openAiProvider.js/anthropicProvider.js, which only
// call `complete()`). Documented honestly in
// docs/admin-guide/copilot-administration.md so nobody mistakes this for
// genuine incremental generation — the full answer already exists in
// memory before the first chunk is ever emitted.
const DEFAULT_WORDS_PER_CHUNK = 3;

// Whitespace is kept as its OWN array element (capturing group in the
// split regex) so re-joining every chunk reproduces the original text
// byte-for-byte — never a chunk boundary that swallows or duplicates a
// space.
function chunkAnswerForStreaming(text, { wordsPerChunk = DEFAULT_WORDS_PER_CHUNK } = {}) {
  if (!text) return [];
  const tokens = text.split(/(\s+)/).filter((token) => token.length > 0);

  const chunks = [];
  let current = "";
  let wordsInCurrent = 0;
  for (const token of tokens) {
    current += token;
    if (token.trim().length > 0) wordsInCurrent += 1;
    if (wordsInCurrent >= wordsPerChunk) {
      chunks.push(current);
      current = "";
      wordsInCurrent = 0;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

module.exports = { chunkAnswerForStreaming };
