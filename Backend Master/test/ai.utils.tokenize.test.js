"use strict";

const { tokenize } = require("../src/ai/utils/tokenize");

describe("utils/tokenize — shared lexical primitive (HashingEmbeddingProvider, LexicalIntentRouter, ToolRouter, LexicalOverlapReranker)", () => {
  test("lowercases, splits on non-alphanumeric, drops single-character tokens", () => {
    expect(tokenize("Hello, World! A test-123.")).toEqual(["hello", "world", "test", "123"]);
  });

  test("handles accented Latin characters", () => {
    expect(tokenize("Réparation générale")).toEqual(["réparation", "générale"]);
  });

  test.each([undefined, null, ""])("returns [] for %p", (input) => {
    expect(tokenize(input)).toEqual([]);
  });
});
