"use strict";

const { RecursiveTextChunker } = require("../src/ai/rag/chunking");

describe("RecursiveTextChunker", () => {
  test("returns no chunks for empty or whitespace-only text", () => {
    const chunker = new RecursiveTextChunker();
    expect(chunker.chunk("", {})).toEqual([]);
    expect(chunker.chunk("   \n\n  \n", {})).toEqual([]);
  });

  test("a short text fits in a single chunk carrying the given metadata", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 500, chunkOverlap: 50 });
    const chunks = chunker.chunk("One short paragraph.", { sourceId: "doc1", title: "Guide" });
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ sourceId: "doc1", title: "Guide", chunkIndex: 0, text: "One short paragraph." });
  });

  test("no chunk ever exceeds chunkSize, even for one oversized unbroken paragraph", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 60, chunkOverlap: 15 });
    const chunks = chunker.chunk("x".repeat(200), {});
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.text.length).toBeLessThanOrEqual(60);
  });

  test("hard-split of an oversized paragraph advances by (chunkSize - chunkOverlap) and covers the whole text", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 60, chunkOverlap: 15 });
    const chunks = chunker.chunk("x".repeat(200), {});
    expect(chunks.map((c) => c.text.length)).toEqual([60, 60, 60, 60, 20]);
    expect(chunks[chunks.length - 1].endOffset).toBe(200);
  });

  test("splits multiple paragraphs into several chunks once chunkSize is exceeded", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 40, chunkOverlap: 5 });
    const text = ["First paragraph is here.", "Second paragraph follows after.", "Third one too."].join("\n\n");
    const chunks = chunker.chunk(text, {});
    expect(chunks.length).toBeGreaterThan(1);
    // chunkIndex is sequential starting at 0
    expect(chunks.map((c) => c.chunkIndex)).toEqual(chunks.map((_, i) => i));
  });

  test("consecutive chunks share overlapping content when a paragraph boundary forces a split", () => {
    // Sized deliberately: A+B fits in chunkSize, A+B+C does not, and B alone
    // already reaches chunkOverlap — so the overlap tail carried into the
    // next chunk is exactly paragraph B, giving an exact, non-fuzzy
    // assertion instead of a substring guess.
    const paraA = "Alpha paragraph one.";
    const paraB = "Beta paragraph two.";
    const paraC = "Gamma paragraph three.";
    const chunker = new RecursiveTextChunker({ chunkSize: 50, chunkOverlap: 15 });
    const chunks = chunker.chunk([paraA, paraB, paraC].join("\n\n"), {});

    expect(chunks).toHaveLength(2);
    expect(chunks[0].text).toBe(`${paraA}\n\n${paraB}`);
    expect(chunks[1].text).toBe(`${paraB}\n\n${paraC}`);
  });

  test("attributes each chunk to the nearest preceding markdown heading", () => {
    // chunkSize small enough (relative to each paragraph) that title, intro,
    // section heading and section body each land in their own chunk — a
    // larger size would collapse everything into one chunk with one heading,
    // which wouldn't exercise per-chunk heading attribution at all.
    const chunker = new RecursiveTextChunker({ chunkSize: 30, chunkOverlap: 0 });
    const text = ["# Title", "", "Intro text under the title.", "", "## Section A", "", "Body of section A."].join("\n");
    const chunks = chunker.chunk(text, {});
    expect(chunks.length).toBeGreaterThan(1);
    const introChunk = chunks.find((c) => c.text.includes("Intro text"));
    const sectionChunk = chunks.find((c) => c.text.includes("Body of section A"));
    expect(introChunk.heading).toBe("Title");
    expect(sectionChunk.heading).toBe("Section A");
  });

  test("a chunk whose own first line IS a heading reports that heading, not the previous one", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 20, chunkOverlap: 2 });
    const text = ["# First", "", "short", "", "## Second", "", "also short"].join("\n");
    const chunks = chunker.chunk(text, {});
    const secondHeadingChunk = chunks.find((c) => c.text.startsWith("## Second"));
    expect(secondHeadingChunk).toBeDefined();
    expect(secondHeadingChunk.heading).toBe("Second");
  });

  test("plain text with no markdown headings gets heading=null throughout", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 500 });
    const chunks = chunker.chunk("Just a plain sentence with no markdown structure at all.", {});
    expect(chunks.every((c) => c.heading === null)).toBe(true);
  });

  test("an explicit metadata.heading (including null) overrides auto-detection", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 500 });
    const chunks = chunker.chunk("# Heading\n\nBody text.", { heading: "Forced" });
    expect(chunks[0].heading).toBe("Forced");
  });

  test("chunkOverlap larger than chunkSize is clamped to at most half of chunkSize", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 40, chunkOverlap: 1000 });
    expect(chunker.chunkOverlap).toBeLessThanOrEqual(20);
  });

  test("startOffset/endOffset are correct positions within the original text", () => {
    const chunker = new RecursiveTextChunker({ chunkSize: 500 });
    const text = "Hello world, this is a single chunk of text.";
    const chunks = chunker.chunk(text, {});
    expect(text.slice(chunks[0].startOffset, chunks[0].endOffset)).toBe(chunks[0].text);
  });
});
