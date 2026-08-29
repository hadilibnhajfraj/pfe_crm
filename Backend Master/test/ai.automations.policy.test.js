"use strict";

// Mechanical guarantee behind the constraint stated in this task: "Toutes
// les automatisations doivent utiliser les AI Tools existants." Mirrors
// test/ai.rag.policy.test.js, test/ai.langchain.policy.test.js,
// test/ai.orchestrator.policy.test.js, test/ai.agents.policy.test.js and
// test/ai.memory.policy.test.js: nothing under src/ai/automations/ may
// reference a Sequelize model, `sequelize` itself, a CRM business service
// (modules/*/services or src/services/*), raw SQL, or an outbound HTTP
// call. Every business-data-adjacent capability an automation can reach
// arrives already built, through an injected `tools` array of
// already-adapted LangChain Tools (see langchain/tools/mcpToolAdapter.js) —
// it never opens a new path of its own. Reads source as plain text (never
// `require()`s it), so it can't be defeated by code that merely avoids
// executing the forbidden reference at import time.

const fs = require("fs");
const path = require("path");

const AUTOMATIONS_DIR = path.join(__dirname, "..", "src", "ai", "automations");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "require(...) of the MCP tool manifest (an automation must only call Tools it was handed, never look them up itself)", pattern: /require\((["'])(?:\.\.\/)*mcp\/tools[^"']*\1\)/ },
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
      files.push({ file: path.relative(AUTOMATIONS_DIR, fullPath).split(path.sep).join("/"), fullPath });
    }
  }
  return files;
}

describe("Automations — architectural policy (never CRM business data directly, only existing AI Tools)", () => {
  const files = listJsFilesRecursive(AUTOMATIONS_DIR);

  test("at least one automation source file exists to enforce the policy against", () => {
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

  test("every one of the 8 requested automations only ever calls Tools via BaseAutomation._callTool (never tool.invoke directly)", () => {
    const automationFiles = [
      "autoCreationAutomation.js",
      "reminderAutomation.js",
      "emailAutomation.js",
      "notificationHousekeepingAutomation.js",
      "googleCalendarAutomation.js",
      "analysisAutomation.js",
      "recommendationAutomation.js",
      "dataQualityAutomation.js",
    ];
    for (const file of automationFiles) {
      const source = fs.readFileSync(path.join(AUTOMATIONS_DIR, file), "utf8");
      expect(source).not.toMatch(/\.invoke\s*\(/);
      expect(source).toMatch(/this\._callTool\s*\(/);
    }
  });

  test("pipeline.js only reaches into mcp/ or langchain/ via the existing Tool-adapter factory, never a business service", () => {
    const pipelineSource = fs.readFileSync(path.join(AUTOMATIONS_DIR, "pipeline.js"), "utf8");
    expect(pipelineSource).toMatch(/createMcpToolAdapters/);
    expect(pipelineSource).not.toMatch(/require\((["'])\.\.\/mcp\/server(?:(?!\1).)*\1\)/);
  });
});
