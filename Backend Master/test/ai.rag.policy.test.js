"use strict";

// Enforces, mechanically, the constraint at the heart of this task: "Ne
// jamais utiliser le RAG pour lire directement les données métier du
// CRM." This is the mirror image of test/ai.mcp.tools.policy.test.js —
// there, every Tool MUST call an existing business service; here, no file
// under src/ai/rag/ may reference a business service, a Sequelize model,
// `sequelize` itself, or raw SQL, ever. Reads source as plain text (never
// `require()`s it), so it can't be defeated by code that merely avoids
// executing the forbidden reference at import time.

const fs = require("fs");
const path = require("path");

const RAG_DIR = path.join(__dirname, "..", "src", "ai", "rag");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    // *.service.js only (never a bare "services/" match): src/ai/services/
    // is this kernel's own port folder (llmProvider.interface.js, ...) —
    // requiring one of those ports is not a business-data leak. Real
    // business services are always named *.service.js by convention.
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "sequelize.query(...)", pattern: /\bsequelize\s*\.\s*query\s*\(/i },
  { name: "a raw SQL SELECT literal", pattern: /\bSELECT\s+[\s\S]+?\sFROM\s+/i },
  { name: "an HTTP client call (axios/fetch) — RAG never calls out to CRM APIs either", pattern: /\baxios\s*\.\s*(get|post|put|delete)\s*\(|\bfetch\s*\(/ },
];

function listJsFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(listJsFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push({ file: path.relative(RAG_DIR, fullPath), fullPath });
    }
  }
  return files;
}

describe("RAG subsystem — architectural policy (documentation only, never CRM business data)", () => {
  const files = listJsFilesRecursive(RAG_DIR);

  test("at least one RAG source file exists to enforce the policy against", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files.map(({ file, fullPath }) => [file, fullPath]))("%s", (_file, fullPath) => {
    const source = fs.readFileSync(fullPath, "utf8");

    test("never references a Sequelize model, sequelize, a CRM service, raw SQL, or an outbound HTTP call", () => {
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect({ file: _file, violates: name, matched: pattern.test(source) }).toEqual({
          file: _file,
          violates: name,
          matched: false,
        });
      }
    });
  });

  test("SourceGuard's default extension allowlist matches exactly the declared documentation formats (no silent widening)", () => {
    const { DEFAULT_ALLOWED_EXTENSIONS } = require("../src/ai/rag/sourceGuard");
    expect([...DEFAULT_ALLOWED_EXTENSIONS].sort()).toEqual(
      [".md", ".markdown", ".txt", ".pdf", ".puml", ".plantuml", ".uml"].sort()
    );
  });

  test("SourceGuard's blocklist covers every CRM business-data directory this backend actually has", () => {
    const { BLOCKED_PATH_FRAGMENTS } = require("../src/ai/rag/sourceGuard");
    const joined = BLOCKED_PATH_FRAGMENTS.join("|").toLowerCase();
    for (const dir of ["models", "modules", "routes", "services", "migrations", "seeders", "config", "middleware"]) {
      expect(joined).toContain(dir);
    }
  });
});
