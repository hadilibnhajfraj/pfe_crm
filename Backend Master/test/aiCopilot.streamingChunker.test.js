"use strict";

const { chunkAnswerForStreaming } = require("../src/modules/ai-copilot/services/streamingChunker");

describe("chunkAnswerForStreaming", () => {
  test("returns [] for empty/null/undefined input", () => {
    expect(chunkAnswerForStreaming("")).toEqual([]);
    expect(chunkAnswerForStreaming(null)).toEqual([]);
    expect(chunkAnswerForStreaming(undefined)).toEqual([]);
  });

  test("re-joining every chunk reproduces the original text exactly (never loses/duplicates whitespace)", () => {
    const text = "Trois projets sont actuellement en retard sur le site de Sfax et Tunis Nord.";
    const chunks = chunkAnswerForStreaming(text);
    expect(chunks.join("")).toBe(text);
  });

  test("groups words by the default chunk size (3 words)", () => {
    const chunks = chunkAnswerForStreaming("un deux trois quatre cinq six sept");
    expect(chunks).toEqual(["un deux trois", " quatre cinq six", " sept"]);
  });

  test("a custom wordsPerChunk is respected", () => {
    const chunks = chunkAnswerForStreaming("un deux trois quatre", { wordsPerChunk: 1 });
    expect(chunks).toEqual(["un", " deux", " trois", " quatre"]);
  });

  test("a single short word still produces exactly one chunk", () => {
    expect(chunkAnswerForStreaming("Bonjour")).toEqual(["Bonjour"]);
  });

  test("multiple consecutive spaces are preserved", () => {
    const text = "un  deux   trois";
    expect(chunkAnswerForStreaming(text).join("")).toBe(text);
  });
});
