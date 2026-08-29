"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

const { SourceGuard } = require("../src/ai/rag/sourceGuard");
const { createDefaultLoaderRegistry, DirectoryScanner } = require("../src/ai/rag/ingestion");
const { RecursiveTextChunker } = require("../src/ai/rag/chunking");
const { HashingEmbeddingProvider } = require("../src/ai/rag/embeddings");
const { InMemoryVectorStore } = require("../src/ai/vector");
const { DocumentRegistry } = require("../src/ai/rag/documentRegistry");
const { RagIngestionService, DEFAULT_COLLECTION } = require("../src/ai/rag/ingestionService");
const { SourceNotAllowedError, UnsupportedSourceTypeError } = require("../src/ai/rag/errors");

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-ingest-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function buildService(extra = {}) {
  const sourceGuard = new SourceGuard({ allowedRoots: [tmpDir] });
  const loaderRegistry = createDefaultLoaderRegistry();
  const scanner = new DirectoryScanner({ sourceGuard });
  const chunker = new RecursiveTextChunker({ chunkSize: 200, chunkOverlap: 20 });
  const embeddingProvider = new HashingEmbeddingProvider({ dimensions: 64 });
  const vectorStore = new InMemoryVectorStore();
  const documentRegistry = new DocumentRegistry();

  const service = new RagIngestionService({
    sourceGuard,
    loaderRegistry,
    scanner,
    chunker,
    embeddingProvider,
    vectorStore,
    documentRegistry,
    displayRoot: tmpDir,
    ...extra,
  });

  return { service, vectorStore, documentRegistry, sourceGuard };
}

describe("RagIngestionService.ingestFile", () => {
  test("ingests a markdown file into the vector store with rich chunk metadata", async () => {
    const filePath = path.join(tmpDir, "faq.md");
    fs.writeFileSync(filePath, "# FAQ\n\nQ: How to reset a password?\nA: Use the forgot-password link.");
    const { service, vectorStore } = buildService();

    const result = await service.ingestFile(filePath);
    expect(result.skipped).toBe(false);
    expect(result.chunkCount).toBeGreaterThan(0);
    expect(result.path).toBe("faq.md");

    expect(vectorStore.size(DEFAULT_COLLECTION)).toBe(result.chunkCount);
    const [record] = await vectorStore.query(DEFAULT_COLLECTION, [0], { topK: 1, minScore: -1 });
    expect(record.metadata).toMatchObject({ title: "FAQ", sourceType: "markdown", path: "faq.md" });
  });

  test("rejects a file outside the allowed corpus with SourceNotAllowedError — the core 'never business data' guarantee", async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-outside-"));
    const outsideFile = path.join(outsideDir, "models-like.md");
    fs.writeFileSync(outsideFile, "# Not allowed");
    const { service } = buildService();

    await expect(service.ingestFile(outsideFile)).rejects.toThrow(SourceNotAllowedError);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  test("rejects a file with an unsupported extension inside the allowed root", async () => {
    const filePath = path.join(tmpDir, "notes.rst");
    fs.writeFileSync(filePath, "content");
    const { service } = buildService();
    // .rst is outside the default extension allowlist -> SourceGuard rejects
    // before the loader lookup is ever reached.
    await expect(service.ingestFile(filePath)).rejects.toThrow(SourceNotAllowedError);
  });

  test("re-ingesting unchanged content is a no-op (skipped=true, same chunk ids)", async () => {
    const filePath = path.join(tmpDir, "faq.md");
    fs.writeFileSync(filePath, "# FAQ\n\nUnchanged content.");
    const { service, vectorStore } = buildService();

    const first = await service.ingestFile(filePath);
    const second = await service.ingestFile(filePath);

    expect(first.skipped).toBe(false);
    expect(second.skipped).toBe(true);
    expect(second.chunkCount).toBe(first.chunkCount);
    expect(vectorStore.size(DEFAULT_COLLECTION)).toBe(first.chunkCount);
  });

  test("re-ingesting changed content replaces the old chunks rather than appending", async () => {
    const filePath = path.join(tmpDir, "faq.md");
    fs.writeFileSync(filePath, "# FAQ\n\nOriginal content.");
    const { service, vectorStore } = buildService();

    await service.ingestFile(filePath);
    const before = vectorStore.size(DEFAULT_COLLECTION);

    fs.writeFileSync(filePath, "# FAQ\n\nCompletely different content after an edit.");
    const second = await service.ingestFile(filePath);

    expect(second.skipped).toBe(false);
    // old chunk ids must be gone, not accumulated alongside new ones
    expect(vectorStore.size(DEFAULT_COLLECTION)).toBe(second.chunkCount);
    expect(vectorStore.size(DEFAULT_COLLECTION)).toBeGreaterThanOrEqual(1);
    void before;
  });

  test("a PDF source is chunked per page, and each chunk carries the correct page number", async () => {
    const PDFDocument = require("pdfkit");
    const filePath = path.join(tmpDir, "guide.pdf");
    await new Promise((resolve, reject) => {
      const doc = new PDFDocument();
      const stream = fs.createWriteStream(filePath);
      doc.pipe(stream);
      doc.text("Page one content about setup.");
      doc.addPage().text("Page two content about troubleshooting.");
      doc.end();
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    const { service, vectorStore } = buildService();
    const result = await service.ingestFile(filePath);
    expect(result.skipped).toBe(false);

    const records = await vectorStore.query(DEFAULT_COLLECTION, [0], { topK: 100, minScore: -1 });
    const pages = records.map((r) => r.metadata.page).sort();
    expect(pages).toEqual([1, 2]);
  });

  test("throws UnsupportedSourceTypeError only if a file passes SourceGuard but has no registered loader", async () => {
    const sourceGuard = new SourceGuard({ allowedRoots: [tmpDir], allowedExtensions: [".md", ".xyz"] });
    const loaderRegistry = createDefaultLoaderRegistry(); // has no .xyz loader
    const filePath = path.join(tmpDir, "weird.xyz");
    fs.writeFileSync(filePath, "content");

    const { service } = buildService({ sourceGuard, loaderRegistry });
    await expect(service.ingestFile(filePath)).rejects.toThrow(UnsupportedSourceTypeError);
  });

  test("empty file content produces zero chunks without throwing", async () => {
    const filePath = path.join(tmpDir, "empty.md");
    fs.writeFileSync(filePath, "   \n\n  ");
    const { service } = buildService();
    const result = await service.ingestFile(filePath);
    expect(result.chunkCount).toBe(0);
    expect(result.skipped).toBe(false);
  });
});

describe("RagIngestionService.ingestDirectories / ingestPaths", () => {
  test("ingests every allowed file the scanner finds and skips disallowed ones silently", async () => {
    fs.writeFileSync(path.join(tmpDir, "guide.md"), "# Guide\n\nContent.");
    fs.writeFileSync(path.join(tmpDir, "ignored.js"), "module.exports = 1;");
    const { service } = buildService();

    const results = await service.ingestDirectories([tmpDir]);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("guide.md");
  });

  test("ingestPaths collects a per-file error instead of aborting the whole batch", async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-outside2-"));
    const outsideFile = path.join(outsideDir, "notes.md");
    fs.writeFileSync(outsideFile, "# Notes");
    fs.writeFileSync(path.join(tmpDir, "guide.md"), "# Guide\n\nOk content.");
    const { service } = buildService();

    const results = await service.ingestPaths([outsideFile, path.join(tmpDir, "guide.md")]);
    expect(results[0].error).toMatch(/not an allowed documentation source/);
    expect(results[1].chunkCount).toBeGreaterThan(0);
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });

  test("a directory scan never follows a symlink into ingestion — a symlink planted inside an allowed root is skipped, its target never read", async () => {
    const outsideDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-outside-symlink-"));
    const outsideFile = path.join(outsideDir, "secret.md");
    fs.writeFileSync(outsideFile, "SECRET=leaked-business-data");
    fs.symlinkSync(outsideFile, path.join(tmpDir, "alias.md"), "file");
    fs.writeFileSync(path.join(tmpDir, "guide.md"), "# Guide\n\nOk content.");
    const { service } = buildService();

    const results = await service.ingestDirectories([tmpDir]);
    expect(results).toHaveLength(1);
    expect(results[0].path).toBe("guide.md");
    fs.rmSync(outsideDir, { recursive: true, force: true });
  });
});
