"use strict";

// Mechanical guarantee, mirrors test/ai.automations.policy.test.js/
// test/ai.dashboard.policy.test.js/test/ai.agents.policy.test.js: nothing
// under src/ai/proactive/ may reference a Sequelize model, `sequelize`
// itself, a CRM business service (modules/*/services or src/services/*),
// raw SQL, or an outbound HTTP call. Every business-data-adjacent
// capability this subsystem can reach arrives already built — through an
// injected Tool (`listProjectsTool`/`notifyTool`, LangChain-adapted, see
// langchain/tools/mcpToolAdapter.js) or a reused pipeline
// (`createDashboardPipeline`) — never a new path of its own. Reads source
// as plain text (never `require()`s it), so it can't be defeated by code
// that merely avoids executing the forbidden reference at import time.
//
// Unlike automations/ (which routes every Tool call through
// BaseAutomation._callTool, a name-whitelist wrapper), ProactiveMonitor/
// AlertDispatcher receive ONLY the exact Tool references they need
// (`listProjectsTool`, `notifyTool`) as constructor parameters — never an
// unrestricted `tools` array to search through. This is a STRICTER
// guarantee than a whitelist: no other Tool is even reachable in memory,
// not just disallowed by convention — see PROACTIVE_AI.md.

const fs = require("fs");
const path = require("path");

const PROACTIVE_DIR = path.join(__dirname, "..", "src", "ai", "proactive");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "require(...) of the MCP tool manifest (this subsystem must only call Tools it was handed, never look them up itself)", pattern: /require\((["'])(?:\.\.\/)*mcp\/tools[^"']*\1\)/ },
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
      files.push({ file: path.relative(PROACTIVE_DIR, fullPath).split(path.sep).join("/"), fullPath });
    }
  }
  return files;
}

describe("Proactive AI — architectural policy (never CRM business data directly, only existing AI Tools/pipelines)", () => {
  const files = listJsFilesRecursive(PROACTIVE_DIR);

  test("at least one source file exists to enforce the policy against", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe.each(files.map(({ file, fullPath }) => [file, fullPath]))("%s", (_file, fullPath) => {
    const source = fs.readFileSync(fullPath, "utf8");

    test("never references a Sequelize model, sequelize, a CRM service, the MCP tool manifest, raw SQL, or an outbound HTTP call", () => {
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect({ file: _file, violates: name, matched: pattern.test(source) }).toEqual({ file: _file, violates: name, matched: false });
      }
    });
  });

  test("pipeline.js only reaches into mcp/langchain via the existing Tool-adapter factory and the existing Dashboard IA pipeline, never a new construction of its own", () => {
    const pipelineSource = fs.readFileSync(path.join(PROACTIVE_DIR, "pipeline.js"), "utf8");
    expect(pipelineSource).toMatch(/createMcpToolAdapters/);
    expect(pipelineSource).toMatch(/createDashboardPipeline/);
    expect(pipelineSource).not.toMatch(/require\((["'])\.\.\/mcp\/server(?:(?!\1).)*\1\)/);
  });

  test("proactiveMonitor.js/alertDispatcher.js never reference the automations/agents/orchestrator subsystems — a self-contained new subsystem, like dashboard/ and automations/", () => {
    for (const file of ["proactiveMonitor.js", "alertDispatcher.js"]) {
      const source = fs.readFileSync(path.join(PROACTIVE_DIR, file), "utf8");
      expect(source).not.toMatch(/require\((["'])(?:\.\.\/)*(automations|agents)\//);
    }
  });
});
