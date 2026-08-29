"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: turns one file on disk into plain text (+ optional per-page split
// for paginated sources like PDF). Concrete loaders never reach outside the
// file they were given — no DB, no HTTP, no CRM service.
class ISourceLoader {
  get sourceType() {
    throw new NotImplementedError("ISourceLoader", "sourceType");
  }

  // Returns { text: string, title?: string, pages?: string[] }.
  // `pages`, when present, lets the ingestion service chunk per page and
  // attach an accurate page number to each chunk's citation.
  async load(_absolutePath) {
    throw new NotImplementedError("ISourceLoader", "load");
  }
}

module.exports = { ISourceLoader };
