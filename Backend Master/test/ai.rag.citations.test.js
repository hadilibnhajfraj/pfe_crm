"use strict";

const { CitationBuilder, truncate, round } = require("../src/ai/rag/citations");

describe("truncate", () => {
  test("returns text unchanged when within the limit", () => {
    expect(truncate("short", 20)).toBe("short");
  });

  test("truncates and appends an ellipsis when over the limit", () => {
    expect(truncate("a".repeat(30), 10)).toBe(`${"a".repeat(10)}…`);
  });

  test("handles empty/undefined gracefully", () => {
    expect(truncate("", 10)).toBe("");
    expect(truncate(undefined, 10)).toBe("");
  });
});

describe("round", () => {
  test("rounds to the given number of decimals", () => {
    expect(round(0.123456, 4)).toBe(0.1235);
    expect(round(1, 2)).toBe(1);
  });
});

describe("CitationBuilder", () => {
  test("builds a numbered citation per result with excerpt truncation and score rounding", () => {
    const builder = new CitationBuilder({ excerptLength: 10 });
    const results = [
      {
        id: "doc1#0",
        score: 0.123456789,
        metadata: {
          sourceId: "doc1",
          title: "Guide",
          sourceType: "markdown",
          path: "docs/guide.md",
          heading: "Setup",
          page: null,
          chunkIndex: 0,
          text: "This is a fairly long excerpt of chunk text.",
        },
      },
    ];
    const [citation] = builder.build(results);
    expect(citation).toEqual({
      index: 1,
      chunkId: "doc1#0",
      sourceId: "doc1",
      title: "Guide",
      sourceType: "markdown",
      path: "docs/guide.md",
      heading: "Setup",
      page: null,
      chunkIndex: 0,
      excerpt: "This is a…",
      score: 0.1235,
    });
  });

  test("index is 1-based and follows input order", () => {
    const builder = new CitationBuilder();
    const results = [
      { id: "a", score: 0.9, metadata: { text: "a" } },
      { id: "b", score: 0.5, metadata: { text: "b" } },
    ];
    const citations = builder.build(results);
    expect(citations.map((c) => c.index)).toEqual([1, 2]);
    expect(citations.map((c) => c.chunkId)).toEqual(["a", "b"]);
  });

  test("missing metadata fields default to null rather than throwing", () => {
    const builder = new CitationBuilder();
    const [citation] = builder.build([{ id: "x", score: 0.1, metadata: {} }]);
    expect(citation).toMatchObject({ sourceId: null, title: null, sourceType: null, path: null, heading: null, page: null });
  });

  test("build([]) returns an empty array", () => {
    expect(new CitationBuilder().build([])).toEqual([]);
  });
});
