"use strict";

const fs = require("fs");
const path = require("path");
const { createRagLogger } = require("../logger");

const logger = createRagLogger("scanner");

// Walks a list of roots (files or directories) and returns every file path
// SourceGuard accepts. This is read-only filesystem traversal — it never
// opens a DB connection or imports a CRM model/service, so even a
// misconfigured root can only ever yield files, never business data.
class DirectoryScanner {
  constructor({ sourceGuard }) {
    this.sourceGuard = sourceGuard;
  }

  scan(roots) {
    const files = [];
    for (const root of roots) {
      this._visit(path.resolve(root), files);
    }
    return files;
  }

  _visit(absolutePath, files) {
    let lstat;
    try {
      lstat = fs.lstatSync(absolutePath);
    } catch (_err) {
      logger.warn(`skipping unreadable path "${absolutePath}"`);
      return;
    }

    // Never follow a symlink during traversal — SourceGuard.check() also
    // rejects a symlink whose target escapes the allowlist (defence in
    // depth for a direct ingestFile() call), but refusing to even descend
    // into one here additionally avoids an infinite loop on a symlink
    // cycle and avoids stat-ing/enumerating anything outside allowedRoots
    // in the first place.
    if (lstat.isSymbolicLink()) {
      logger.warn(`skipping "${absolutePath}": symlinks are never followed`);
      return;
    }

    const stat = lstat;
    if (stat.isDirectory()) {
      let entries;
      try {
        entries = fs.readdirSync(absolutePath, { withFileTypes: true });
      } catch (_err) {
        logger.warn(`skipping unreadable directory "${absolutePath}"`);
        return;
      }
      for (const entry of entries) {
        this._visit(path.join(absolutePath, entry.name), files);
      }
      return;
    }

    if (!stat.isFile()) return;

    const check = this.sourceGuard.check(absolutePath);
    if (check.allowed) {
      files.push(absolutePath);
    } else {
      logger.warn(`skipping "${absolutePath}": ${check.reason}`);
    }
  }
}

module.exports = { DirectoryScanner };
