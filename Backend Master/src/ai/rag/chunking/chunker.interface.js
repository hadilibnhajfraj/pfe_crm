"use strict";

const { NotImplementedError } = require("../../utils/errors");

// Port: splits document text into overlapping chunks suitable for
// embedding. Pure/synchronous by contract — a chunker never does I/O.
class IChunker {
  // Returns Chunk[]: { ...metadata, chunkIndex, text, startOffset, endOffset }
  chunk(_text, _metadata) {
    throw new NotImplementedError("IChunker", "chunk");
  }
}

module.exports = { IChunker };
