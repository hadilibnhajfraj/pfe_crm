"use strict";

const fs = require("fs");
const path = require("path");
const { ConfigurationError } = require("../utils/errors");
const { SourceNotAllowedError } = require("./errors");

// The single most important file in this subsystem: it is what makes
// "never read CRM business data" an enforced guarantee rather than a
// convention. Every path that reaches a loader — whether from a directory
// scan or a direct ingestFile() call — passes through here first.
//
// Three independent checks, all of which must pass:
//   1. Extension allowlist (documentation formats only).
//   2. Blocklist of business-data path fragments — checked even for paths
//      inside an allowed root, as defence in depth against a future
//      misconfiguration (e.g. someone widening allowedRoots to a package
//      root that also contains src/modules).
//   3. Root allowlist — the path must sit under one of the *explicitly*
//      configured roots. There is no default: the constructor throws
//      without at least one root, so a caller can never accidentally end
//      up scanning the whole repository "because nothing was configured".
const DEFAULT_ALLOWED_EXTENSIONS = Object.freeze([
  ".md",
  ".markdown",
  ".txt",
  ".pdf",
  ".puml",
  ".plantuml",
  ".uml",
]);

const BLOCKED_PATH_FRAGMENTS = Object.freeze([
  `${path.sep}src${path.sep}models${path.sep}`,
  `${path.sep}src${path.sep}modules${path.sep}`,
  `${path.sep}src${path.sep}routes${path.sep}`,
  `${path.sep}src${path.sep}services${path.sep}`,
  `${path.sep}src${path.sep}migrations${path.sep}`,
  `${path.sep}src${path.sep}seeders${path.sep}`,
  `${path.sep}src${path.sep}config${path.sep}`,
  `${path.sep}src${path.sep}middleware${path.sep}`,
  `${path.sep}src${path.sep}scripts${path.sep}`,
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}uploads${path.sep}`,
  ".env",
]);

class SourceGuard {
  constructor({ allowedRoots, allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS, blockedPathFragments = BLOCKED_PATH_FRAGMENTS } = {}) {
    if (!Array.isArray(allowedRoots) || allowedRoots.length === 0) {
      throw new ConfigurationError(
        "SourceGuard requires at least one explicit allowedRoots entry — there is no default corpus location."
      );
    }
    this.allowedRoots = allowedRoots.map((root) => path.resolve(root));
    this.allowedExtensions = allowedExtensions.map((ext) => ext.toLowerCase());
    this.blockedPathFragments = blockedPathFragments;
  }

  // Never throws — returns { allowed, reason }. Use assertAllowed() at
  // ingestion call sites where a rejection should stop the operation.
  check(absolutePath) {
    const resolved = path.resolve(absolutePath);
    const lexical = this._checkLexical(resolved);
    if (!lexical.allowed) return lexical;

    // A symlink (the file itself, or an ancestor directory) can make a
    // lexically-allowed path resolve, at the OS level, to a real file
    // OUTSIDE every check above — fs.readFileSync()/fs.statSync() follow
    // symlinks transparently, so the three checks above alone are not
    // enough to guarantee "never reads business data". Re-run the same
    // checks against the REALPATH (the symlink's actual target) so a
    // symlink planted inside an allowed root can never smuggle a file from
    // outside it (e.g. `.env`, `src/models/...`) past this guard.
    let real;
    try {
      real = fs.realpathSync(resolved);
    } catch (_err) {
      return { allowed: true, reason: null }; // doesn't exist yet — nothing to smuggle, the caller's own read will fail
    }
    if (real === resolved) return { allowed: true, reason: null };

    const realCheck = this._checkLexical(real);
    if (!realCheck.allowed) {
      return { allowed: false, reason: `path is a symlink whose target is rejected (${realCheck.reason})` };
    }
    return { allowed: true, reason: null };
  }

  _checkLexical(resolved) {
    const lower = resolved.toLowerCase();

    const ext = path.extname(resolved).toLowerCase();
    if (!this.allowedExtensions.includes(ext)) {
      return { allowed: false, reason: `extension "${ext || "(none)"}" is not in the documentation allowlist` };
    }

    for (const fragment of this.blockedPathFragments) {
      if (lower.includes(fragment.toLowerCase())) {
        return { allowed: false, reason: `path matches a blocked business-data fragment ("${fragment}")` };
      }
    }

    const withinAllowedRoot = this.allowedRoots.some(
      (root) => resolved === root || resolved.startsWith(root + path.sep)
    );
    if (!withinAllowedRoot) {
      return { allowed: false, reason: "path is outside every configured allowedRoots entry" };
    }

    return { allowed: true, reason: null };
  }

  assertAllowed(absolutePath) {
    const result = this.check(absolutePath);
    if (!result.allowed) {
      throw new SourceNotAllowedError(absolutePath, result.reason);
    }
    return result;
  }
}

module.exports = { SourceGuard, DEFAULT_ALLOWED_EXTENSIONS, BLOCKED_PATH_FRAGMENTS };
