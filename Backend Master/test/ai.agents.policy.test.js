"use strict";

// Mechanical guarantee, symmetric with test/ai.rag.policy.test.js,
// test/ai.langchain.policy.test.js and test/ai.orchestrator.policy.test.js:
// nothing under src/ai/agents/ may reference a Sequelize model, `sequelize`
// itself, a CRM business service (modules/*/services or src/services/*),
// raw SQL, or an outbound HTTP call. Every Tool an Agent can call arrives
// already adapted (a LangChain DynamicStructuredTool built from a real MCP
// Tool — see langchain/tools/mcpToolAdapter.js) through constructor
// injection; no Agent ever requires mcp/tools, a business service, or a
// Sequelize model to reach the CRM's data of its own accord. Reads source
// as plain text (never `require()`s it), so it can't be defeated by code
// that merely avoids executing the forbidden reference at import time.

const fs = require("fs");
const path = require("path");

const AGENTS_DIR = path.join(__dirname, "..", "src", "ai", "agents");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "require(...) of the MCP tool manifest (an Agent must only call Tools it was handed, never look them up itself)", pattern: /require\((["'])(?:\.\.\/)*mcp\/tools[^"']*\1\)/ },
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
      files.push({ file: path.relative(AGENTS_DIR, fullPath), fullPath });
    }
  }
  return files;
}

describe("Agents — architectural policy (never CRM business data directly)", () => {
  const files = listJsFilesRecursive(AGENTS_DIR);

  test("at least one agent source file exists to enforce the policy against", () => {
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

  test("every specialized Agent factory receives its Tools by injection (a 'tools' parameter), never constructs or looks them up itself", () => {
    const specializedAgentFiles = [
      "assistantAgent.js",
      "searchAgent.js",
      "crmAssistantAgent.js",
      "projectAgent.js",
      "commercialAgent.js",
      "pipelineAgent.js",
      "kpiAgent.js",
      "reportingAgent.js",
      "maintenanceAgent.js",
      "industrialAgent.js",
      "notificationAgent.js",
      "automationAgent.js",
      "businessAnalystAgent.js",
      "recommendationAgent.js",
      "dataQualityAgent.js",
      "advancedSearchAgent.js",
    ];
    for (const file of specializedAgentFiles) {
      const source = fs.readFileSync(path.join(AGENTS_DIR, file), "utf8");
      expect(source).toMatch(/tools\s*=\s*\[\]/);
    }
  });
});
