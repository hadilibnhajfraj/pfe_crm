"use strict";

// Demonstration/smoke-test script — NOT a long-lived indexer. The default
// vectorStore (InMemoryVectorStore) is volatile: everything it ingests is
// lost the moment this process exits. Run it to prove the pipeline works
// end to end against this repository's real documentation, or as the
// starting point for wiring ingestion into a long-running process (e.g.
// once at server boot, before any query is served) — not as a "run once,
// index built" tool. See src/ai/README.md.
//
// Usage: node src/ai/rag/reindex.js

const path = require("path");
const { createRagPipeline } = require("./pipeline");

const BACKEND_ROOT = path.resolve(__dirname, "../../..");
const REPO_ROOT = path.resolve(__dirname, "../../../..");

// Every root here is documentation/UML/API/guide/FAQ/PDF content that
// already exists in this repository — never a src/modules, src/models, or
// src/routes path. SourceGuard would refuse those anyway (see
// sourceGuard.js), but the roots below are also chosen to be honest about
// what this RAG is for.
const DEFAULT_CORPUS_ROOTS = [
  path.join(BACKEND_ROOT, "docs"),
  path.join(BACKEND_ROOT, "GOOGLE_CALENDAR_SETUP.md"),
  path.join(BACKEND_ROOT, "src", "ai", "README.md"),
  path.join(REPO_ROOT, "AI-Business-Copilot"),
  path.join(REPO_ROOT, "CRM_Architecture_Complète.pdf"),
];

async function reindex(roots = DEFAULT_CORPUS_ROOTS) {
  const pipeline = createRagPipeline({ allowedRoots: roots, displayRoot: REPO_ROOT });
  const results = await pipeline.ingestionService.ingestDirectories(roots);

  const summary = {
    documents: results.length,
    chunks: results.reduce((sum, r) => sum + (r.chunkCount || 0), 0),
    skipped: results.filter((r) => r.skipped).length,
    errors: results.filter((r) => r.error).length,
  };

  return { pipeline, results, summary };
}

if (require.main === module) {
  reindex()
    .then(({ results, summary }) => {
      console.log(`RAG reindex: ${summary.documents} document(s), ${summary.chunks} chunk(s), ${summary.skipped} unchanged, ${summary.errors} error(s).`);
      for (const r of results) {
        if (r.error) console.log(`  ✗ ${r.path}: ${r.error}`);
        else console.log(`  ✓ ${r.path} (${r.chunkCount} chunk${r.chunkCount === 1 ? "" : "s"}${r.skipped ? ", unchanged" : ""})`);
      }
    })
    .catch((err) => {
      console.error("RAG reindex failed:", err.message);
      process.exitCode = 1;
    });
}

module.exports = { reindex, DEFAULT_CORPUS_ROOTS };
