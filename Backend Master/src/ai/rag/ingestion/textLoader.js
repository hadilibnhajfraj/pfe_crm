"use strict";

const fs = require("fs");
const path = require("path");
const { ISourceLoader } = require("./sourceLoader.interface");

// Plain-text guides/FAQ — no title heuristic beyond the filename (unlike
// markdown, plain text has no reliable heading convention to sniff).
class TextLoader extends ISourceLoader {
  get sourceType() {
    return "text";
  }

  async load(absolutePath) {
    const text = fs.readFileSync(absolutePath, "utf8");
    return { text, title: path.basename(absolutePath) };
  }
}

module.exports = { TextLoader };
