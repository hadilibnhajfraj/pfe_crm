"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const PDFDocument = require("pdfkit");

const { MarkdownLoader, extractMarkdownTitle } = require("../src/ai/rag/ingestion/markdownLoader");
const { TextLoader } = require("../src/ai/rag/ingestion/textLoader");
const { PlantUmlLoader } = require("../src/ai/rag/ingestion/plantUmlLoader");
const { PdfLoader } = require("../src/ai/rag/ingestion/pdfLoader");
const { LoaderRegistry } = require("../src/ai/rag/ingestion/loaderRegistry");
const { createDefaultLoaderRegistry } = require("../src/ai/rag/ingestion");
const { ConfigurationError } = require("../src/ai/utils/errors");

let tmpDir;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "rag-loaders-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function writeFixture(name, content) {
  const filePath = path.join(tmpDir, name);
  fs.writeFileSync(filePath, content, "utf8");
  return filePath;
}

function writePdfFixture(name, lines) {
  return new Promise((resolve, reject) => {
    const filePath = path.join(tmpDir, name);
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    lines.forEach((line, i) => {
      if (i === 0) doc.fontSize(18).text(line);
      else doc.fontSize(12).text(line);
    });
    doc.end();
    stream.on("finish", () => resolve(filePath));
    stream.on("error", reject);
  });
}

describe("extractMarkdownTitle", () => {
  test("extracts the first level-1 heading", () => {
    expect(extractMarkdownTitle("# My Title\n\nBody")).toBe("My Title");
  });

  test("returns null when there is no level-1 heading", () => {
    expect(extractMarkdownTitle("## Only a subheading\n\nBody")).toBeNull();
  });
});

describe("MarkdownLoader", () => {
  test("loads text verbatim and derives the title from the first # heading", async () => {
    const filePath = writeFixture("guide.md", "# Password Guide\n\nHow to reset a password.");
    const loader = new MarkdownLoader();
    const result = await loader.load(filePath);
    expect(loader.sourceType).toBe("markdown");
    expect(result.title).toBe("Password Guide");
    expect(result.text).toContain("How to reset a password.");
    expect(result.pages).toBeUndefined();
  });

  test("falls back to the filename when there is no # heading", async () => {
    const filePath = writeFixture("no-heading.md", "Just body text.");
    const result = await new MarkdownLoader().load(filePath);
    expect(result.title).toBe("no-heading.md");
  });
});

describe("TextLoader", () => {
  test("loads raw text with the filename as title", async () => {
    const filePath = writeFixture("faq.txt", "Q: Why?\nA: Because.");
    const loader = new TextLoader();
    const result = await loader.load(filePath);
    expect(loader.sourceType).toBe("text");
    expect(result.title).toBe("faq.txt");
    expect(result.text).toBe("Q: Why?\nA: Because.");
  });
});

describe("PlantUmlLoader", () => {
  test("loads the raw UML source text with sourceType 'uml'", async () => {
    const filePath = writeFixture("sequence.puml", "@startuml\nAlice -> Bob: hello\n@enduml");
    const loader = new PlantUmlLoader();
    const result = await loader.load(filePath);
    expect(loader.sourceType).toBe("uml");
    expect(result.text).toContain("Alice -> Bob: hello");
  });
});

describe("PdfLoader", () => {
  test("extracts readable text and a per-page split from a real PDF", async () => {
    const filePath = await writePdfFixture("guide.pdf", ["Guide Title", "This explains the setup process in detail."]);
    const loader = new PdfLoader();
    const result = await loader.load(filePath);
    expect(loader.sourceType).toBe("pdf");
    expect(result.title).toBe("guide");
    expect(Array.isArray(result.pages)).toBe(true);
    expect(result.pages).toHaveLength(1);
    expect(result.text).toContain("Guide Title");
    expect(result.text).toContain("This explains the setup process in detail.");
  });

  test("does not letter-space text split across multiple text runs on the same line", async () => {
    // A regression fixture for the join logic: pdfkit alone won't reproduce
    // pdf2json's per-glyph run splitting, but this still proves normal
    // multi-word text never gets an extra separator injected between
    // words that were already one run.
    const filePath = await writePdfFixture("words.pdf", ["Configuration options available to admins"]);
    const result = await new PdfLoader().load(filePath);
    expect(result.text).not.toMatch(/C\s+o\s+n\s+f\s+i\s+g/);
    expect(result.text).toContain("Configuration options available to admins");
  });

  test("rejects a non-PDF file with a clean error rather than crashing the process", async () => {
    const filePath = writeFixture("not-a-real.pdf", "this is not a pdf");
    await expect(new PdfLoader().load(filePath)).rejects.toThrow();
  });
});

describe("LoaderRegistry", () => {
  test("resolves the correct loader by extension, case-insensitively", () => {
    const registry = new LoaderRegistry().register([".md"], new MarkdownLoader());
    expect(registry.resolve("/x/y/FILE.MD")).toBeInstanceOf(MarkdownLoader);
  });

  test("returns null for an unregistered extension", () => {
    const registry = new LoaderRegistry().register([".md"], new MarkdownLoader());
    expect(registry.resolve("/x/y/file.txt")).toBeNull();
  });

  test("register() throws ConfigurationError on a duplicate extension", () => {
    const registry = new LoaderRegistry().register([".md"], new MarkdownLoader());
    expect(() => registry.register([".md"], new MarkdownLoader())).toThrow(ConfigurationError);
  });

  test("createDefaultLoaderRegistry() covers every extension SourceGuard allows", () => {
    const registry = createDefaultLoaderRegistry();
    for (const ext of [".md", ".markdown", ".txt", ".pdf", ".puml", ".plantuml", ".uml"]) {
      expect(registry.resolve(`/x${ext}`)).not.toBeNull();
    }
  });
});
