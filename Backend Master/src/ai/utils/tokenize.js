"use strict";

// Lowest-layer, dependency-free string tokenizer (lowercase words/numbers,
// accented Latin included, single-character tokens dropped as noise).
// Lives in utils/ — not rag/embeddings/ — because it is a generic text
// primitive with no embedding-specific meaning: HashingEmbeddingProvider
// uses it to build a bag of words, but so do LexicalIntentRouter
// (langchain/router/), ToolRouter (orchestrator/) and
// LexicalOverlapReranker (rag/reranking/), none of which have anything to
// do with embeddings. Importing it from rag/embeddings/hashingEmbeddingProvider.js
// (as those three used to) would mean swapping that adapter for a real
// embedding model could silently break lexical routing/reranking elsewhere
// in the kernel — exactly the DIP violation a shared utils/ primitive
// avoids.
const TOKEN_PATTERN = /[a-zà-ÿ0-9]+/g;

function tokenize(text) {
  const matches = String(text || "").toLowerCase().match(TOKEN_PATTERN);
  return matches ? matches.filter((t) => t.length > 1) : [];
}

module.exports = { tokenize };
