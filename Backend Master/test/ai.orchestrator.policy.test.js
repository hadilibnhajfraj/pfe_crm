"use strict";

// Mechanical guarantee, symmetric with test/ai.rag.policy.test.js and
// test/ai.langchain.policy.test.js: nothing under src/ai/orchestrator/ may
// reference a Sequelize model, `sequelize` itself, a CRM business service
// (modules/*/services or src/services/*), raw SQL, or an outbound HTTP
// call. The orchestrator composes MCP (Tools) + RAG (Retriever) + LangChain
// — every business-data-adjacent capability it can reach arrives already
// built, through an injected collaborator (a McpServer, an IRetriever, a
// list of already-adapted LangChain tools) — it never opens a new path of
// its own. Reads source as plain text (never `require()`s it), so it can't
// be defeated by code that merely avoids executing the forbidden reference
// at import time.

const fs = require("fs");
const path = require("path");

const ORCHESTRATOR_DIR = path.join(__dirname, "..", "src", "ai", "orchestrator");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    // *.service.js only (never a bare "services/" match) — same refinement
    // as ai.rag.policy.test.js / ai.langchain.policy.test.js: src/ai/services/
    // is this kernel's own port folder, not a business service.
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "sequelize.query(...)", pattern: /\bsequelize\s*\.\s*query\s*\(/i },
  { name: "a raw SQL SELECT literal", pattern: /\bSELECT\s+[\s\S]+?\sFROM\s+/i },
  { name: "an HTTP client call (axios/fetch)", pattern: /\baxios\s*\.\s*(get|post|put|delete)\s*\(|\bfetch\s*\(/ },
];

function listJsFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(listJsFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js")) {
      files.push({ file: path.relative(ORCHESTRATOR_DIR, fullPath), fullPath });
    }
  }
  return files;
}

describe("Orchestrator — architectural policy (never CRM business data directly)", () => {
  const files = listJsFilesRecursive(ORCHESTRATOR_DIR);

  test("at least one orchestrator source file exists to enforce the policy against", () => {
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

  test("pipeline.js never constructs a McpServer or an ILlmProvider itself — both are always received by injection", () => {
    const pipelineSource = fs.readFileSync(path.join(ORCHESTRATOR_DIR, "pipeline.js"), "utf8");
    expect(pipelineSource).not.toMatch(/new\s+McpServer\s*\(/);
    expect(pipelineSource).not.toMatch(/require\((["'])\.\.\/mcp\/server(?:(?!\1).)*\1\)/);
  });

  test("pipeline.js's only reference into mcp/ is the tool manifest (mcp/tools), never the server itself", () => {
    const pipelineSource = fs.readFileSync(path.join(ORCHESTRATOR_DIR, "pipeline.js"), "utf8");
    const mcpRequires = pipelineSource.match(/require\((["'])\.\.\/mcp\/[^"']*\1\)/g) || [];
    for (const statement of mcpRequires) {
      expect(statement).toMatch(/\.\.\/mcp\/tools/);
    }
  });
});
