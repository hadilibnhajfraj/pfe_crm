"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { createRagPipeline } = require("../src/ai/rag/pipeline");
const { RagRetrievalService } = require("../src/ai/rag/retrievalService");
const { RagIngestionService } = require("../src/ai/rag/ingestionService");
const { createDefaultAiManager } = require("../src/ai");

describe("createRagPipeline", () => {
  test("throws without allowedRoots — no implicit 'scan everything' default", () => {
    expect(() => createRagPipeline({})).toThrow();
  });

  test("wires a working ingestionService + retrievalService without performing any I/O", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-pipeline-"));
    const pipeline = createRagPipeline({ allowedRoots: [tmpDir] });
    expect(pipeline.ingestionService).toBeInstanceOf(RagIngestionService);
    expect(pipeline.retrievalService).toBeInstanceOf(RagRetrievalService);
    expect(pipeline.vectorStore.size("documentation")).toBe(0);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("respects RAG_* environment overrides via the env option", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-pipeline2-"));
    const pipeline = createRagPipeline({ allowedRoots: [tmpDir], env: { RAG_TOP_K: "2", RAG_CHUNK_SIZE: "500" } });
    expect(pipeline.config.topK).toBe(2);
    expect(pipeline.config.chunkSize).toBe(500);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test("end to end: ingest a temp corpus, then retrieve with citations", async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-pipeline3-"));
    fs.writeFileSync(
      path.join(tmpDir, "faq.md"),
      "# FAQ\n\nQ: How do I reset my password?\nA: Use the forgot-password link on the login screen."
    );

    const pipeline = createRagPipeline({ allowedRoots: [tmpDir], displayRoot: tmpDir });
    const ingestResults = await pipeline.ingestionService.ingestDirectories([tmpDir]);
    expect(ingestResults[0].chunkCount).toBeGreaterThan(0);

    const answer = await pipeline.retrievalService.retrieve("How can I reset a forgotten password?");
    expect(answer.results.length).toBeGreaterThan(0);
    expect(answer.citations[0].path).toBe("faq.md");

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

describe("AiManager integration", () => {
  test("createDefaultAiManager() wires a real, working IRetriever by default", () => {
    const manager = createDefaultAiManager({});
    expect(manager.getStatus().adapters.retriever).toBe(true);
    expect(manager.getStatus().adapters.vectorStore).toBe(true);
    expect(typeof manager.retriever.retrieve).toBe("function");
  });

  test("the default retriever starts with an empty index — constructing the manager performs no ingestion", async () => {
    const manager = createDefaultAiManager({});
    const answer = await manager.retriever.retrieve("anything");
    expect(answer.results).toEqual([]);
  });
});
