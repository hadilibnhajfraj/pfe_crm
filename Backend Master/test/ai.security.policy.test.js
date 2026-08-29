"use strict";

// Mechanical guarantee, symmetric with every other subsystem's policy test
// (test/ai.rag.policy.test.js, test/ai.langchain.policy.test.js,
// test/ai.orchestrator.policy.test.js, test/ai.agents.policy.test.js,
// test/ai.memory.policy.test.js, test/ai.automations.policy.test.js,
// test/ai.dashboard.policy.test.js): nothing under src/ai/security/ may
// reference a Sequelize model, `sequelize` itself, a CRM business service
// (modules/*/services or src/services/*), raw SQL, or an outbound HTTP
// call. The security subsystem only ever touches the SAME IKeyValueStore
// port used by memory/ — it never opens a new path to business data of its
// own. Reads source as plain text (never `require()`s it).

const fs = require("fs");
const path = require("path");

const SECURITY_DIR = path.join(__dirname, "..", "src", "ai", "security");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
    name: "require(...) of a CRM business service (modules/*/services/*.service or src/services/*.service)",
    pattern: /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services\/|services\/)[^"']*\.service(?:\.js)?\1\)/,
  },
  { name: "require(...) of the MCP tool manifest", pattern: /require\((["'])(?:\.\.\/)*mcp\/tools[^"']*\1\)/ },
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
      files.push({ file: path.relative(SECURITY_DIR, fullPath).split(path.sep).join("/"), fullPath });
    }
  }
  return files;
}

describe("Security subsystem — architectural policy (never CRM business data directly)", () => {
  const files = listJsFilesRecursive(SECURITY_DIR);

  test("at least one security source file exists to enforce the policy against", () => {
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

  test("RateLimiter and AuditLog only ever depend on the IKeyValueStore port, never a client (Redis/DB) directly", () => {
    for (const file of ["rateLimiter.js", "auditLog.js"]) {
      const source = fs.readFileSync(path.join(SECURITY_DIR, file), "utf8");
      expect(source).not.toMatch(/require\((["'])redis\1\)/);
      expect(source).not.toMatch(/\bnew\s+RedisKeyValueStore\b/);
    }
  });

  test("pipeline.js's only production-store escape hatch is dependency injection (a 'store' parameter), never a hardcoded Redis client", () => {
    const pipelineSource = fs.readFileSync(path.join(SECURITY_DIR, "pipeline.js"), "utf8");
    expect(pipelineSource).not.toMatch(/require\((["'])redis\1\)/);
  });
});
