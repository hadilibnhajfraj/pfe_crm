"use strict";

const fs = require("fs");
const path = require("path");
const { ISourceLoader } = require("./sourceLoader.interface");

// UML sources here means text-based PlantUML (.puml/.plantuml/.uml) — this
// project has no image/OCR pipeline, so rendered diagram images are out of
// scope; only the textual diagram definition is indexed.
class PlantUmlLoader extends ISourceLoader {
  get sourceType() {
    return "uml";
  }

  async load(absolutePath) {
    const text = fs.readFileSync(absolutePath, "utf8");
    return { text, title: path.basename(absolutePath) };
  }
}

module.exports = { PlantUmlLoader };
