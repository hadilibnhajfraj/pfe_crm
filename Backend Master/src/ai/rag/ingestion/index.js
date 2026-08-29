"use strict";

const { ISourceLoader } = require("./sourceLoader.interface");
const { MarkdownLoader } = require("./markdownLoader");
const { TextLoader } = require("./textLoader");
const { PlantUmlLoader } = require("./plantUmlLoader");
const { PdfLoader } = require("./pdfLoader");
const { LoaderRegistry } = require("./loaderRegistry");
const { DirectoryScanner } = require("./directoryScanner");

// Default registry covering every source type this RAG accepts:
// documentation, UML (text), API references, guides, FAQ, PDF — see
// sourceGuard.js for the matching extension allowlist.
function createDefaultLoaderRegistry() {
  return new LoaderRegistry()
    .register([".md", ".markdown"], new MarkdownLoader())
    .register([".txt"], new TextLoader())
    .register([".puml", ".plantuml", ".uml"], new PlantUmlLoader())
    .register([".pdf"], new PdfLoader());
}

module.exports = {
  ISourceLoader,
  MarkdownLoader,
  TextLoader,
  PlantUmlLoader,
  PdfLoader,
  LoaderRegistry,
  DirectoryScanner,
  createDefaultLoaderRegistry,
};
