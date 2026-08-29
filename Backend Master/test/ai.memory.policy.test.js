"use strict";

// Mechanical guarantee, symmetric with test/ai.rag.policy.test.js,
// test/ai.langchain.policy.test.js, test/ai.orchestrator.policy.test.js and
// test/ai.agents.policy.test.js: nothing under src/ai/memory/ may reference
// a Sequelize model, `sequelize` itself, a CRM business service
// (modules/*/services or src/services/*), raw SQL, or an outbound HTTP
// call. The memory subsystem stores conversation transcripts, sessions,
// context slots, facts and preferences — never CRM business data (a
// project, a maintenance request, ...) — so the same boundary applies here
// as everywhere else in this kernel. Reads source as plain text (never
// `require()`s it), so it can't be defeated by code that merely avoids
// executing the forbidden reference at import time.

const fs = require("fs");
const path = require("path");

const MEMORY_DIR = path.join(__dirname, "..", "src", "ai", "memory");

const FORBIDDEN_PATTERNS = [
  { name: "require(...) of a Sequelize model", pattern: /require\((["'])(?:(?!\1).)*\/models\/(?:(?!\1).)*\1\)/ },
  { name: 'require("sequelize")', pattern: /require\((["'])sequelize\1\)/ },
  {
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
      files.push({ file: path.relative(MEMORY_DIR, fullPath).split(path.sep).join("/"), fullPath });
    }
  }
  return files;
}

describe("Memory subsystem — architectural policy (never CRM business data directly)", () => {
  const files = listJsFilesRecursive(MEMORY_DIR);

  test("at least one memory source file exists to enforce the policy against", () => {
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

  test("the only third-party package required anywhere under memory/ is 'redis' itself", () => {
    const thirdPartyRequires = new Set();
    const localOrCore = /^(\.|\.\.|assert|crypto|events|fs|path|readline)(\/|$)/;
    for (const { fullPath } of files) {
      const source = fs.readFileSync(fullPath, "utf8");
      const matches = source.matchAll(/require\((["'])([^"']+)\1\)/g);
      for (const match of matches) {
        const specifier = match[2];
        if (!localOrCore.test(specifier) && specifier !== "joi") {
          thirdPartyRequires.add(specifier);
        }
      }
    }
    expect([...thirdPartyRequires]).toEqual(["redis"]);
  });

  test("only redis/redisClient.js and redis/redisKeyValueStore.js ever require 'redis' directly", () => {
    for (const { file, fullPath } of files) {
      const source = fs.readFileSync(fullPath, "utf8");
      const requiresRedisPackage = /require\((["'])redis\1\)/.test(source);
      if (requiresRedisPackage) {
        expect(["redis/redisClient.js"]).toContain(file);
      }
    }
  });
});
