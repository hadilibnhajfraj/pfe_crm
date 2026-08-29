"use strict";

const { HashingEmbeddingProvider, tokenize } = require("../src/ai/rag/embeddings");

describe("tokenize", () => {
  test("lowercases and extracts word-like tokens, dropping single characters", () => {
    expect(tokenize("Hello, World! A test-123.")).toEqual(["hello", "world", "test", "123"]);
  });

  test("returns an empty array for empty/undefined/non-string input", () => {
    expect(tokenize("")).toEqual([]);
    expect(tokenize(undefined)).toEqual([]);
    expect(tokenize(null)).toEqual([]);
  });
});

describe("HashingEmbeddingProvider", () => {
  test("dimensions getter reflects the configured value (default 256)", () => {
    expect(new HashingEmbeddingProvider().dimensions).toBe(256);
    expect(new HashingEmbeddingProvider({ dimensions: 64 }).dimensions).toBe(64);
  });

  test("embed() returns a vector of exactly `dimensions` length", async () => {
    const provider = new HashingEmbeddingProvider({ dimensions: 64 });
    const vector = await provider.embed("hello world");
    expect(vector).toHaveLength(64);
  });

  test("embed() is deterministic — same text always yields the same vector", async () => {
    const provider = new HashingEmbeddingProvider({ dimensions: 128 });
    const v1 = await provider.embed("The quick brown fox");
    const v2 = await provider.embed("The quick brown fox");
    expect(v1).toEqual(v2);
  });

  test("embed() is L2-normalized (unit length) for non-empty text", async () => {
    const provider = new HashingEmbeddingProvider({ dimensions: 128 });
    const vector = await provider.embed("some reasonably long sentence with several distinct words");
    const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
    expect(norm).toBeCloseTo(1, 5);
  });

  test("embed() of empty/whitespace text returns an all-zero vector, not NaN", async () => {
    const provider = new HashingEmbeddingProvider({ dimensions: 32 });
    const vector = await provider.embed("   ");
    expect(vector.every((v) => v === 0)).toBe(true);
  });

  test("different texts usually yield different vectors", async () => {
    const provider = new HashingEmbeddingProvider({ dimensions: 128 });
    const v1 = await provider.embed("password reset instructions for the login screen");
    const v2 = await provider.embed("POR PROMESH report validation locks the record");
    expect(v1).not.toEqual(v2);
  });

  test("embedBatch() returns the same vectors as calling embed() individually, in order", async () => {
    const provider = new HashingEmbeddingProvider({ dimensions: 64 });
    const texts = ["first text", "second text", "third text"];
    const batch = await provider.embedBatch(texts);
    const individual = await Promise.all(texts.map((t) => provider.embed(t)));
    expect(batch).toEqual(individual);
  });
});
