"use strict";

// Mechanical guarantee, symmetric with test/ai.automations.policy.test.js,
// test/ai.agents.policy.test.js, test/ai.orchestrator.policy.test.js,
// test/ai.langchain.policy.test.js and test/ai.rag.policy.test.js: nothing
// under src/ai/dashboard/ may reference a Sequelize model, `sequelize`
// itself, a CRM business service (modules/*/services or src/services/*),
// raw SQL, or an outbound HTTP call. Every business-data-adjacent
// capability the Dashboard IA can reach arrives already built, through an
// injected `tools` array of already-adapted LangChain Tools — it never
// opens a new path of its own, and it never mutates anything (read-only
// analysis). Reads source as plain text (never `require()`s it), so it
// can't be defeated by code that merely avoids executing the forbidden
// reference at import time.

const fs = require("fs");
const path = require("path");

const DASHBOARD_DIR = path.join(__dirname, "..", "src", "ai", "dashboard");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "require(...) of the MCP tool manifest (a domain analyzer must only call Tools it was handed, never look them up itself)", pattern: /require\((["'])(?:\.\.\/)*mcp\/tools[^"']*\1\)/ },
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
      files.push({ file: path.relative(DASHBOARD_DIR, fullPath).split(path.sep).join("/"), fullPath });
    }
  }
  return files;
}

describe("Dashboard IA — architectural policy (never CRM business data directly, read-only)", () => {
  const files = listJsFilesRecursive(DASHBOARD_DIR);

  test("at least one dashboard source file exists to enforce the policy against", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files.map(({ file, fullPath }) => [file, fullPath]))("%s", (_file, fullPath) => {
    const source = fs.readFileSync(fullPath, "utf8");

    test("never references a Sequelize model, sequelize, a CRM service, the MCP tool manifest, raw SQL, or an outbound HTTP call", () => {
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect({ file: _file, violates: name, matched: pattern.test(source) }).toEqual({
          file: _file,
          violates: name,
          matched: false,
        });
      }
    });
  });

  test("every one of the 7 domain analyzer files only ever calls Tools via DomainAnalyzer._callTool (never tool.invoke directly)", () => {
    const analyzerFiles = ["projectsAnalyzer.js", "pipelineAnalyzer.js", "salesAnalyzer.js", "maintenanceAnalyzer.js", "hrAnalyzer.js", "industrialAnalyzer.js", "kpiAnalyzer.js"];
    for (const file of analyzerFiles) {
      const source = fs.readFileSync(path.join(DASHBOARD_DIR, file), "utf8");
      expect(source).not.toMatch(/\.invoke\s*\(/);
    }
  });

  test("no write-oriented Tool name (create_/update_/delete_/set_/mark_/send_/assign_/move_/accept_/reject_/start_/complete_) appears in any DEFAULT_DATA_SOURCES — this subsystem only ever reads", () => {
    const analyzerFiles = ["projectsAnalyzer.js", "pipelineAnalyzer.js", "salesAnalyzer.js", "maintenanceAnalyzer.js", "hrAnalyzer.js", "industrialAnalyzer.js", "kpiAnalyzer.js"];
    const writePrefixPattern = /listToolName:\s*["'](create_|update_|delete_|set_|mark_|send_|assign_|move_|accept_|reject_|start_|complete_)/;
    for (const file of analyzerFiles) {
      const source = fs.readFileSync(path.join(DASHBOARD_DIR, file), "utf8");
      expect(source).not.toMatch(writePrefixPattern);
    }
  });

  test("pipeline.js only reaches into mcp/ or langchain/ via the existing Tool-adapter factory, never a business service", () => {
    const pipelineSource = fs.readFileSync(path.join(DASHBOARD_DIR, "pipeline.js"), "utf8");
    expect(pipelineSource).toMatch(/createMcpToolAdapters/);
    expect(pipelineSource).not.toMatch(/require\((["'])\.\.\/mcp\/server(?:(?!\1).)*\1\)/);
  });
});
