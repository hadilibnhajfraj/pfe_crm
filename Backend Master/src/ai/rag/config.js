"use strict";

// Loads and validates the RAG_* environment surface — same pattern as
// src/ai/config/ai.config.js (Joi, frozen object, sane defaults). None of
// these values are secrets; they only tune chunking/retrieval behaviour.
const Joi = require("joi");
const { ConfigurationError } = require("./errors");

const schema = Joi.object({
  RAG_CHUNK_SIZE: Joi.number().integer().min(100).max(8000).default(800),
  RAG_CHUNK_OVERLAP: Joi.number().integer().min(0).max(2000).default(120),
  RAG_TOP_K: Joi.number().integer().min(1).max(50).default(5),
  RAG_CANDIDATE_K: Joi.number().integer().min(1).max(200).default(20),
  RAG_MIN_SCORE: Joi.number().min(0).max(1).default(0),
  RAG_EMBEDDING_DIMENSIONS: Joi.number().integer().min(32).max(4096).default(256),
})
  .unknown(true)
  .prefs({ convert: true });

function loadRagConfig(env = process.env) {
  const { value, error } = schema.validate(env, { abortEarly: false });
  if (error) {
    throw new ConfigurationError(`Invalid RAG configuration: ${error.message}`);
  }

  return Object.freeze({
    chunkSize: value.RAG_CHUNK_SIZE,
    chunkOverlap: value.RAG_CHUNK_OVERLAP,
    topK: value.RAG_TOP_K,
    candidateK: value.RAG_CANDIDATE_K,
    minScore: value.RAG_MIN_SCORE,
    embeddingDimensions: value.RAG_EMBEDDING_DIMENSIONS,
  });
}

module.exports = { loadRagConfig };
