"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { SourceGuard } = require("../src/ai/rag/sourceGuard");
const { ConfigurationError } = require("../src/ai/utils/errors");
const { SourceNotAllowedError } = require("../src/ai/rag/errors");

const ROOT = path.resolve(__dirname, "fixtures", "rag-corpus");

describe("SourceGuard — the enforcement point for 'never read CRM business data'", () => {
  test("constructor throws without at least one explicit allowedRoots entry", () => {
    expect(() => new SourceGuard({})).toThrow(ConfigurationError);
    expect(() => new SourceGuard({ allowedRoots: [] })).toThrow(ConfigurationError);
  });

  test("accepts a documentation file inside an allowed root", () => {
    const guard = new SourceGuard({ allowedRoots: [ROOT] });
    const result = guard.check(path.join(ROOT, "guide.md"));
    expect(result).toEqual({ allowed: true, reason: null });
  });

  test.each([".md", ".markdown", ".txt", ".pdf", ".puml", ".plantuml", ".uml"])(
    "accepts the %s extension",
    (ext) => {
      const guard = new SourceGuard({ allowedRoots: [ROOT] });
      expect(guard.check(path.join(ROOT, `file${ext}`)).allowed).toBe(true);
    }
  );

  test.each([".js", ".json", ".sql", ".env", ".ts", ""])("rejects the %s extension", (ext) => {
    const guard = new SourceGuard({ allowedRoots: [ROOT] });
    const result = guard.check(path.join(ROOT, `file${ext}`));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/extension/);
  });

  test("rejects a path outside every configured root even with an allowed extension", () => {
    const guard = new SourceGuard({ allowedRoots: [ROOT] });
    const result = guard.check(path.join(path.dirname(ROOT), "elsewhere", "guide.md"));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/outside/);
  });

  test.each([
    ["src/models/User.js".replace(/\//g, path.sep), ".js blocked by extension already, but fragment also matches"],
    ["src/modules/hr-requests/services/hrRequest.service.md".replace(/\//g, path.sep), "modules fragment"],
    ["src/routes/admin.md".replace(/\//g, path.sep), "routes fragment"],
    ["src/services/notification.md".replace(/\//g, path.sep), "services fragment"],
    ["src/migrations/001-init.md".replace(/\//g, path.sep), "migrations fragment"],
    ["node_modules/some-pkg/README.md".replace(/\//g, path.sep), "node_modules fragment"],
    ["uploads/hr-requests/scan.md".replace(/\//g, path.sep), "uploads fragment"],
    [".env.md", "env fragment"],
  ])("rejects a blocked business-data path even under an allowed root: %s", (relPath) => {
    const guard = new SourceGuard({ allowedRoots: [ROOT] });
    const result = guard.check(path.join(ROOT, relPath));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/blocked business-data fragment|extension/);
  });

  test("blocklist applies even to a root that IS a business-data directory (defence in depth)", () => {
    const businessRoot = path.join(ROOT, "src", "modules");
    const guard = new SourceGuard({ allowedRoots: [businessRoot] });
    const result = guard.check(path.join(businessRoot, "commercial-contacts", "notes.md"));
    expect(result.allowed).toBe(false);
    expect(result.reason).toMatch(/blocked business-data fragment/);
  });

  test("assertAllowed() throws SourceNotAllowedError with the path and reason, and returns the check result otherwise", () => {
    const guard = new SourceGuard({ allowedRoots: [ROOT] });
    expect(() => guard.assertAllowed(path.join(ROOT, "x.js"))).toThrow(SourceNotAllowedError);
    expect(guard.assertAllowed(path.join(ROOT, "guide.md"))).toEqual({ allowed: true, reason: null });
  });

  test("a root that is itself a single file is honoured (resolved === root case)", () => {
    const filePath = path.join(ROOT, "single-file-root.pdf");
    const guard = new SourceGuard({ allowedRoots: [filePath] });
    expect(guard.check(filePath).allowed).toBe(true);
    expect(guard.check(path.join(ROOT, "other.pdf")).allowed).toBe(false);
  });

  test("extension matching is case-insensitive", () => {
    const guard = new SourceGuard({ allowedRoots: [ROOT] });
    expect(guard.check(path.join(ROOT, "GUIDE.MD")).allowed).toBe(true);
  });

  test("a custom allowedExtensions list overrides the default allowlist", () => {
    const guard = new SourceGuard({ allowedRoots: [ROOT], allowedExtensions: [".rst"] });
    expect(guard.check(path.join(ROOT, "guide.md")).allowed).toBe(false);
    expect(guard.check(path.join(ROOT, "guide.rst")).allowed).toBe(true);
  });

  describe("symlink defence in depth — a lexically-allowed path must not smuggle a file from outside the allowlist", () => {
    let tmpDir;

    beforeEach(() => {
      tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sourceguard-symlink-"));
    });

    afterEach(() => {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    });

    test("rejects a symlink (allowed extension, inside allowedRoots) whose target is OUTSIDE every allowedRoots entry", () => {
      const outsideTarget = path.join(tmpDir, "secret.env.md"); // .md so ONLY the root-escape check can catch it
      fs.writeFileSync(outsideTarget, "SECRET=leaked");
      const allowedDir = path.join(tmpDir, "allowed-root");
      fs.mkdirSync(allowedDir);
      const link = path.join(allowedDir, "notes.md");
      fs.symlinkSync(outsideTarget, link, "file");

      const guard = new SourceGuard({ allowedRoots: [allowedDir] });
      const result = guard.check(link);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/symlink whose target is rejected/);
    });

    test("rejects a symlink whose target matches a blocked business-data fragment, even though the link itself doesn't", () => {
      const businessDir = path.join(tmpDir, "src", "modules");
      fs.mkdirSync(businessDir, { recursive: true });
      const outsideTarget = path.join(businessDir, "leaked.md");
      fs.writeFileSync(outsideTarget, "business data");
      const allowedDir = path.join(tmpDir, "docs");
      fs.mkdirSync(allowedDir);
      const link = path.join(allowedDir, "notes.md");
      fs.symlinkSync(outsideTarget, link, "file");

      const guard = new SourceGuard({ allowedRoots: [allowedDir] });
      const result = guard.check(link);
      expect(result.allowed).toBe(false);
      expect(result.reason).toMatch(/symlink whose target is rejected/);
    });

    test("accepts a symlink whose target is ALSO inside an allowedRoots entry (legitimate case, not a bypass)", () => {
      const allowedDir = path.join(tmpDir, "docs");
      fs.mkdirSync(allowedDir);
      const realFile = path.join(allowedDir, "real-guide.md");
      fs.writeFileSync(realFile, "# Guide");
      const link = path.join(allowedDir, "alias.md");
      fs.symlinkSync(realFile, link, "file");

      const guard = new SourceGuard({ allowedRoots: [allowedDir] });
      expect(guard.check(link)).toEqual({ allowed: true, reason: null });
    });

    test("a symlink pointing at a non-existent target is never treated as allowed (realpath lookup fails safely)", () => {
      const allowedDir = path.join(tmpDir, "docs");
      fs.mkdirSync(allowedDir);
      const link = path.join(allowedDir, "dangling.md");
      fs.symlinkSync(path.join(tmpDir, "does-not-exist.md"), link, "file");

      const guard = new SourceGuard({ allowedRoots: [allowedDir] });
      // realpathSync throws for a dangling symlink -> falls back to "allowed"
      // (the eventual fs.readFileSync() will simply fail with ENOENT; there
      // is nothing to smuggle from a target that doesn't exist).
      expect(guard.check(link).allowed).toBe(true);
    });
  });
});
