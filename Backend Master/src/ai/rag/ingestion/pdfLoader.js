"use strict";

const path = require("path");
const PDFParser = require("pdf2json");
const { ISourceLoader } = require("./sourceLoader.interface");

// pdf2json chosen deliberately over pdf-parse: zero transitive dependencies
// (pdf-parse@1.x pulls in debug/node-ensure and has a well-known "reads its
// own test fixture if required with no module.parent" footgun; pdf-parse@2.x
// pulls in a native canvas binding we don't need just to extract text).
class PdfLoader extends ISourceLoader {
  get sourceType() {
    return "pdf";
  }

  async load(absolutePath) {
    const pdfData = await this._parse(absolutePath);
    const pages = pdfData.Pages || [];
    const pageTexts = pages.map((page) => this._extractPageText(page));
    const title = path.basename(absolutePath, path.extname(absolutePath));
    return { text: pageTexts.join("\n\n"), title, pages: pageTexts };
  }

  _parse(absolutePath) {
    return new Promise((resolve, reject) => {
      const parser = new PDFParser();
      parser.on("pdfParser_dataError", (err) => {
        reject(new Error((err && err.parserError && err.parserError.message) || "PDF parse error"));
      });
      parser.on("pdfParser_dataReady", (pdfData) => resolve(pdfData));
      parser.loadPDF(absolutePath);
    });
  }

  // pdf2json gives text runs positioned by (x, y) rather than in reading
  // order, and — for this repo's architecture PDF, whose diagrams are
  // rendered to per-glyph SVG runs — sometimes splits a single word into
  // several runs with no space character at the split point at all. Two
  // rules, calibrated against that actual file (see
  // test/ai.rag.pdfLoader.test.js):
  //   - runs sharing the same line (y within Y_TOLERANCE) are concatenated
  //     with NO separator — trusting the source's own embedded spaces,
  //     since inserting one here turns a mid-word glyph split like
  //     "av" + "ec MF" + "A" into letter-spaced garbage instead of "avec MFA".
  //   - a NEW line always gets exactly one separating space — omitting
  //     this instead merges unrelated lines ("séquence" + "Dix...").
  _extractPageText(page) {
    const runs = (page.Texts || [])
      .map((item) => ({
        x: item.x,
        y: item.y,
        text: (item.R || []).map((r) => this._safeDecode(r.T)).join(""),
      }))
      .sort((a, b) => a.y - b.y || a.x - b.x);

    const Y_TOLERANCE = 0.3;
    const lines = [];
    let currentLine = [];
    let currentY = null;

    for (const run of runs) {
      if (currentY !== null && Math.abs(run.y - currentY) > Y_TOLERANCE) {
        lines.push(currentLine.join(""));
        currentLine = [];
      }
      currentLine.push(run.text);
      currentY = run.y;
    }
    if (currentLine.length) lines.push(currentLine.join(""));

    return lines.join(" ");
  }

  _safeDecode(value) {
    try {
      return decodeURIComponent(value);
    } catch (_err) {
      return value;
    }
  }
}

module.exports = { PdfLoader };
