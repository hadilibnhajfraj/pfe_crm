"use strict";

const fs = require("fs");
const path = require("path");
const { ISourceLoader } = require("./sourceLoader.interface");

function extractMarkdownTitle(raw) {
  const match = raw.match(/^#\s+(.+)$/m);
  return match ? match[1].trim() : null;
}

class MarkdownLoader extends ISourceLoader {
  get sourceType() {
    return "markdown";
  }

  async load(absolutePath) {
    const raw = fs.readFileSync(absolutePath, "utf8");
    const title = extractMarkdownTitle(raw) || path.basename(absolutePath);
    return { text: raw, title };
  }
}

module.exports = { MarkdownLoader, extractMarkdownTitle };
