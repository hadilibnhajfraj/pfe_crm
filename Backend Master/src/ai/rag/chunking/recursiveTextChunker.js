"use strict";

const { IChunker } = require("./chunker.interface");

const HEADING_LINE = /^#{1,6}\s+.+$/gm;

// Splits text into paragraph blocks (runs of non-blank lines separated by
// one-or-more blank lines), each carrying its exact [start, end) offset in
// the original text — using regex.exec's own index rather than
// text.indexOf(paragraph) avoids the classic bug where a repeated
// paragraph resolves to the wrong occurrence.
function splitParagraphsWithOffsets(text) {
  const paragraphs = [];
  const regex = /[^\n]+(?:\n[^\n]+)*/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const trimmed = match[0].trim();
    if (trimmed) {
      paragraphs.push({ text: trimmed, start: match.index, end: match.index + match[0].length });
    }
  }
  return paragraphs;
}

// A single paragraph longer than chunkSize (rare — a giant unbroken block)
// is hard-split on fixed-size windows with the same overlap as everywhere
// else, so no chunk ever exceeds chunkSize regardless of source formatting.
function hardSplit(paragraph, chunkSize, chunkOverlap) {
  const pieces = [];
  const step = Math.max(1, chunkSize - chunkOverlap);
  let pos = 0;
  while (pos < paragraph.text.length) {
    const end = Math.min(paragraph.text.length, pos + chunkSize);
    pieces.push({
      text: paragraph.text.slice(pos, end),
      start: paragraph.start + pos,
      end: paragraph.start + end,
    });
    if (end >= paragraph.text.length) break;
    pos += step;
  }
  return pieces;
}

// Nearest markdown heading at or before `offset` — gives citations a
// section label ("From 'Configuration' in guide X") when the source is
// markdown; naturally returns null for plain text/UML/PDF pages. When the
// chunk's own first line IS a heading, that heading describes the chunk
// itself and takes priority over whatever heading precedes it in the
// document — otherwise a chunk beginning with "## Configuration" would be
// mislabelled with the *previous* section's title.
function findHeadingFor(text, offset, chunkText) {
  if (chunkText) {
    const firstLine = chunkText.split("\n")[0].trim();
    if (/^#{1,6}\s+.+$/.test(firstLine)) {
      return firstLine.replace(/^#{1,6}\s+/, "").trim();
    }
  }
  const before = text.slice(0, offset);
  const matches = before.match(HEADING_LINE);
  if (!matches || matches.length === 0) return null;
  return matches[matches.length - 1].replace(/^#{1,6}\s+/, "").trim();
}

class RecursiveTextChunker extends IChunker {
  constructor({ chunkSize = 800, chunkOverlap = 120 } = {}) {
    super();
    this.chunkSize = chunkSize;
    this.chunkOverlap = Math.min(chunkOverlap, Math.floor(chunkSize / 2));
  }

  chunk(text, metadata = {}) {
    if (!text || !text.trim()) return [];

    const paragraphs = splitParagraphsWithOffsets(text);
    const rawChunks = this._groupParagraphs(paragraphs);

    return rawChunks.map((raw, index) => ({
      ...metadata,
      chunkIndex: index,
      text: raw.text,
      startOffset: raw.start,
      endOffset: raw.end,
      heading: metadata.heading !== undefined ? metadata.heading : findHeadingFor(text, raw.start, raw.text),
    }));
  }

  _groupParagraphs(paragraphs) {
    const chunks = [];
    let current = [];
    let currentLen = 0;

    const flush = () => {
      if (current.length === 0) return;
      chunks.push({
        text: current.map((p) => p.text).join("\n\n"),
        start: current[0].start,
        end: current[current.length - 1].end,
      });
    };

    for (const para of paragraphs) {
      if (para.text.length > this.chunkSize) {
        flush();
        current = [];
        currentLen = 0;
        for (const piece of hardSplit(para, this.chunkSize, this.chunkOverlap)) {
          chunks.push({ text: piece.text, start: piece.start, end: piece.end });
        }
        continue;
      }

      const additionalLen = para.text.length + (current.length ? 2 : 0);
      if (current.length && currentLen + additionalLen > this.chunkSize) {
        flush();
        current = this._overlapTail(current);
        currentLen = current.reduce((sum, p, i) => sum + p.text.length + (i ? 2 : 0), 0);
      }

      current.push(para);
      currentLen += additionalLen;
    }
    flush();

    return chunks;
  }

  // Carries the tail paragraphs of the just-flushed chunk into the next one
  // so consecutive chunks share ~chunkOverlap characters of context.
  _overlapTail(paragraphs) {
    if (this.chunkOverlap <= 0) return [];
    const tail = [];
    let len = 0;
    for (let i = paragraphs.length - 1; i >= 0; i--) {
      tail.unshift(paragraphs[i]);
      len += paragraphs[i].text.length;
      if (len >= this.chunkOverlap) break;
    }
    return tail;
  }
}

module.exports = { RecursiveTextChunker, splitParagraphsWithOffsets, findHeadingFor };
