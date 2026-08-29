"use strict";

// Mechanical guarantee, symmetric with test/ai.rag.policy.test.js: nothing
// under src/ai/langchain/ may reference a Sequelize model, `sequelize`
// itself, a CRM business service (modules/*/services or src/services/*),
// raw SQL, or an outbound HTTP call. Every business-data access this
// module can perform goes through an injected collaborator (an IRetriever
// for rag/, an McpServer for tools/) — never a new direct path of its own.
// Reads source as plain text (never `require()`s it), so it can't be
// defeated by code that merely avoids executing the forbidden reference at
// import time.

const fs = require("fs");
const path = require("path");

const LANGCHAIN_DIR = path.join(__dirname, "..", "src", "ai", "langchain");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    // Targets real business services (always named *.service.js by
    // convention — see e.g. user.service.js, hrRequest.service.js). This
    // is deliberately NOT a bare "services/" match: src/ai/services/ is
    // this kernel's own port folder (llmProvider.interface.js,
    // contextBuilder.interface.js, ...), and RagContextBuilder legitimately
    // implements one of those ports — that is not a business-data leak.
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
      files.push({ file: path.relative(LANGCHAIN_DIR, fullPath), fullPath });
    }
  }
  return files;
}

describe("LangChain integration — architectural policy (never CRM business data directly)", () => {
  const files = listJsFilesRecursive(LANGCHAIN_DIR);

  test("at least one LangChain source file exists to enforce the policy against", () => {
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

  test("every business-data-adjacent capability is received by injection, never constructed internally", () => {
    // mcpToolAdapter.js is the one file allowed to talk about "business
    // data" at all (via the MCP server), and even it only ever *calls* an
    // mcpServer instance passed in — it never imports one.
    const adapterSource = fs.readFileSync(path.join(LANGCHAIN_DIR, "tools", "mcpToolAdapter.js"), "utf8");
    expect(adapterSource).not.toMatch(/require\((["'])\.\.\/\.\.\/mcp\/server(?:(?!\1).)*\1\)/);
  });
});
