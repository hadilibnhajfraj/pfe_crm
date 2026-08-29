"use strict";

// Enforces, mechanically rather than by code-review convention only, the
// rule stated in AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md and repeated
// for this MCP server: every Tool must call an existing service — never a
// Sequelize model, `sequelize` itself, or raw SQL. This test reads tool
// source as plain text (it never `require()`s them), so it can't be
// defeated by a tool that merely avoids executing the forbidden call at
// import time. Tools live one subfolder per business module
// (mcp/tools/<module>/*.js) — this test walks all of them recursively, so
// adding a new module folder is automatically covered without editing this
// file.

const fs = require("fs");
const path = require("path");

const TOOLS_DIR = path.join(__dirname, "..", "src", "ai", "mcp", "tools");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  { name: "sequelize.query(...)", pattern: /\bsequelize\s*\.\s*query\s*\(/i },
  { name: "a raw SQL SELECT literal", pattern: /\bSELECT\s+[\s\S]+?\sFROM\s+/i },
];

// Depth-agnostic on purpose: tools live at mcp/tools/<module>/<file>.js, so
// requires are "../../../../modules/.../services/..." or
// "../../../../services/..." — but the exact number of "../" is an
// implementation detail of how deep a module folder is nested, not part of
// the rule being enforced.
const SERVICE_REQUIRE_PATTERN = /require\((["'])(?:\.\.\/)+(?:modules\/[^"'/]+\/services|services)\/[^"']+\1\)/;

function listToolFilesRecursive(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  let files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files = files.concat(listToolFilesRecursive(fullPath));
    } else if (entry.isFile() && entry.name.endsWith(".js") && entry.name !== "index.js") {
      files.push({ file: path.relative(TOOLS_DIR, fullPath), fullPath });
    }
  }
  return files;
}

describe("MCP tools — architectural policy (services only, never PostgreSQL directly)", () => {
  const tools = listToolFilesRecursive(TOOLS_DIR);

  test("at least one concrete tool file exists to enforce the policy against", () => {
    expect(tools.length).toBeGreaterThan(0);
  });

  test("covers every business module folder listed in the AI tools roadmap", () => {
    const modules = new Set(tools.map(({ file }) => file.split(path.sep)[0]));
    expect([...modules].sort()).toEqual(
      [
        "commercialContacts",
        "dashboard",
        "googleCalendar",
        "hr",
        "industrial",
        "maintenance",
        "notifications",
        "pipeline",
        "porPromesh",
        "projectActions",
        "projects",
        "users",
      ].sort()
    );
  });

  describe.each(tools.map(({ file, fullPath }) => [file, fullPath]))("%s", (_file, fullPath) => {
    const source = fs.readFileSync(fullPath, "utf8");

    test("does not reference Sequelize models, sequelize itself, or raw SQL", () => {
      for (const { name, pattern } of FORBIDDEN_PATTERNS) {
        expect({ file: _file, violates: name, matched: pattern.test(source) }).toEqual({
          file: _file,
          violates: name,
          matched: false,
        });
      }
    });

    test("requires at least one existing service (modules/*/services or src/services)", () => {
      expect(SERVICE_REQUIRE_PATTERN.test(source)).toBe(true);
    });
  });
});
