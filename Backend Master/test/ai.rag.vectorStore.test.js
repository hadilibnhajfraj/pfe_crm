"use strict";

const { InMemoryVectorStore, cosineSimilarity } = require("../src/ai/vector");

describe("cosineSimilarity", () => {
  test("identical vectors score 1", () => {
    expect(cosineSimilarity([1, 0, 0], [1, 0, 0])).toBeCloseTo(1);
  });

  test("orthogonal vectors score 0", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  test("opposite vectors score -1", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1);
  });

  test("a zero vector never divides by zero (returns 0, not NaN)", () => {
    expect(cosineSimilarity([0, 0, 0], [1, 2, 3])).toBe(0);
  });
});

describe("InMemoryVectorStore", () => {
  test("query() against an unknown collection returns an empty array, never throws", async () => {
    const store = new InMemoryVectorStore();
    await expect(store.query("nope", [1, 0, 0])).resolves.toEqual([]);
  });

  test("upsert() then query() returns matches ordered by descending cosine similarity", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert("docs", [
      { id: "close", vector: [1, 0, 0], metadata: { text: "close" } },
      { id: "far", vector: [0, 1, 0], metadata: { text: "far" } },
      { id: "medium", vector: [0.7, 0.7, 0], metadata: { text: "medium" } },
    ]);
    const results = await store.query("docs", [1, 0, 0], { topK: 10 });
    expect(results.map((r) => r.id)).toEqual(["close", "medium", "far"]);
  });

  test("topK limits the number of returned matches", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert("docs", [
      { id: "a", vector: [1, 0], metadata: {} },
      { id: "b", vector: [0.9, 0.1], metadata: {} },
      { id: "c", vector: [0.1, 0.9], metadata: {} },
    ]);
    const results = await store.query("docs", [1, 0], { topK: 1 });
    expect(results).toHaveLength(1);
    expect(results[0].id).toBe("a");
  });

  test("minScore filters out low-similarity matches", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert("docs", [
      { id: "aligned", vector: [1, 0], metadata: {} },
      { id: "orthogonal", vector: [0, 1], metadata: {} },
    ]);
    const results = await store.query("docs", [1, 0], { topK: 10, minScore: 0.5 });
    expect(results.map((r) => r.id)).toEqual(["aligned"]);
  });

  test("upsert() with an existing id overwrites rather than duplicates", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert("docs", [{ id: "a", vector: [1, 0], metadata: { v: 1 } }]);
    await store.upsert("docs", [{ id: "a", vector: [0, 1], metadata: { v: 2 } }]);
    expect(store.size("docs")).toBe(1);
    const results = await store.query("docs", [0, 1], { topK: 10 });
    expect(results[0].metadata).toEqual({ v: 2 });
  });

  test("delete() removes only the given ids and reports the count actually deleted", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert("docs", [
      { id: "a", vector: [1, 0], metadata: {} },
      { id: "b", vector: [0, 1], metadata: {} },
    ]);
    const outcome = await store.delete("docs", ["a", "missing-id"]);
    expect(outcome).toEqual({ deleted: 1 });
    expect(store.size("docs")).toBe(1);
    expect((await store.query("docs", [1, 0], { topK: 10 })).map((r) => r.id)).toEqual(["b"]);
  });

  test("delete() on an unknown collection is a safe no-op", async () => {
    const store = new InMemoryVectorStore();
    await expect(store.delete("nope", ["a"])).resolves.toEqual({ deleted: 0 });
  });

  test("collections are isolated from each other", async () => {
    const store = new InMemoryVectorStore();
    await store.upsert("collectionA", [{ id: "x", vector: [1, 0], metadata: {} }]);
    expect(store.size("collectionB")).toBe(0);
    await expect(store.query("collectionB", [1, 0])).resolves.toEqual([]);
  });
});
