"use strict";

const { IReranker } = require("./reranker.interface");
const { tokenize } = require("../../utils/tokenize");

function jaccard(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const term of setA) {
    if (setB.has(term)) intersection++;
  }
  return intersection / (setA.size + setB.size - intersection);
}

// AI-Business-Copilot/22_RAG_USER_GUIDE_PRIORITY.md — reproduced live
// against the real corpus: for "comment créer un nouveau projet",
// `docs/ai/INTENT_ROUTING.md` (an internal routing-architecture doc that
// repeats "Comment créer un projet ?" many times as a WORKED EXAMPLE of
// intent classification) scored a lexical (Jaccard) overlap of ~0.50
// against the query — a 6x higher lexical score than the REAL procedural
// guide, `docs/user-guide/01-creer-un-projet.md` (~0.08), because the
// procedural guide discusses steps/fields/buttons rather than reciting the
// literal question. Pure text-overlap scoring cannot tell "a document that
// USES this question as an example" apart from "a document that ANSWERS
// this question" — no amount of vector/lexical tuning fixes that
// distinction, because neither signal knows what KIND of document it's
// looking at.
//
// `path` is already present on every chunk's metadata (RagIngestionService
// sets it at ingestion — see ingestionService.js), and already encodes
// document category through its directory structure (`docs/user-guide/`
// vs `docs/ai/` vs `AI-Business-Copilot/` vs `docs/audit/`...) — no new
// metadata field, no re-ingestion, no new classification system: this
// reuses a field that already exists on every candidate this reranker
// already receives.
//
// Deliberately a DISCOUNT, never a removal (`categoryFactor` multiplies
// the existing blended score — a technical document that is overwhelmingly
// more relevant for some OTHER query can still win, it just needs a much
// higher base score to overcome the discount). `crm_assistant_agent` is
// the only real consumer of this reranker's output today (see
// crmAssistantAgent.js: "aide à UTILISER le CRM", never a question about
// the Copilot's own internals) — discounting the Copilot's own
// documentation/incident-reports/audit-reports for THIS retriever is
// correct for that agent's entire intent scope, not merely for this one
// question.
// Leading "/" guarantees a bare relative path (e.g. "docs/user-guide/x.md",
// no leading separator) still matches the same "/docs/user-guide/" substring
// check as an absolute path — without it, only deeper/absolute paths would
// ever match, silently missing the exact display-path shape ingestionService.js
// produces for files under `displayRoot` (see _toDisplayPath()).
function normalizePath(rawPath) {
  return "/" + String(rawPath || "").replace(/\\/g, "/").toLowerCase();
}

function categorizePath(rawPath) {
  const p = normalizePath(rawPath);
  if (p.includes("/docs/user-guide/")) return "user_guide";
  if (p.includes("/docs/admin-guide/")) return "admin_guide";
  if (p.includes("/docs/ai/")) return "ai_internal";
  if (p.includes("/ai-business-copilot/")) return "ai_internal";
  if (/\/src\/ai\/readme\.md$/.test(p)) return "ai_internal";
  if (p.includes("/docs/audit/") || p.includes("/docs/security/") || p.includes("/docs/performance/")) return "audit_report";
  if (p.includes("architecture_complète") || p.includes("architecture_complete")) return "architecture";
  return "functional"; // any other functional/product doc (docs/*.md not otherwise classified, GOOGLE_CALENDAR_SETUP.md, ...) — neutral, unpenalized
}

// >1 = boost, <1 = discount, 1 = neutral. `functional` (any other doc/*.md
// not otherwise classified) stays neutral — this is a discount for KNOWN
// internal/audit/architecture categories, not a boost-everything-else rule.
const DEFAULT_CATEGORY_FACTORS = Object.freeze({
  user_guide: 1.3,
  admin_guide: 1.1,
  functional: 1.0,
  architecture: 0.4,
  ai_internal: 0.3,
  audit_report: 0.3,
});

/**
 * Hybrid reranker: blends the vector store's cosine score with a lexical
 * (Jaccard term-overlap) score against the raw query, then applies a
 * document-CATEGORY factor derived from the existing `path` metadata (see
 * `categorizePath()` above) — never removes a document, only reorders by
 * how likely its category is to be what a CRM end-user actually needs.
 * This is a well established, fully offline technique for improving
 * hashing/sparse embeddings — it catches exact-term matches (product
 * codes, error messages, config keys) that a hashed bag-of-words vector
 * can dilute across many dimensions. Swappable behind IReranker for a
 * cross-encoder or reranking-API adapter later; nothing else in the
 * pipeline changes.
 */
class LexicalOverlapReranker extends IReranker {
  constructor({ vectorWeight = 0.7, lexicalWeight = 0.3, categoryFactors = DEFAULT_CATEGORY_FACTORS } = {}) {
    super();
    this.vectorWeight = vectorWeight;
    this.lexicalWeight = lexicalWeight;
    this.categoryFactors = categoryFactors;
  }

  async rerank(query, candidates) {
    const queryTerms = new Set(tokenize(query));
    return candidates
      .map((candidate) => {
        const candidateText = (candidate.metadata && candidate.metadata.text) || "";
        const lexicalScore = jaccard(queryTerms, new Set(tokenize(candidateText)));
        const vectorScore = candidate.score;
        const category = categorizePath(candidate.metadata && candidate.metadata.path);
        const categoryFactor = this.categoryFactors[category] != null ? this.categoryFactors[category] : 1.0;
        const blended = this.vectorWeight * vectorScore + this.lexicalWeight * lexicalScore;
        return {
          ...candidate,
          vectorScore,
          lexicalScore,
          category,
          categoryFactor,
          score: categoryFactor * blended,
        };
      })
      .sort((a, b) => b.score - a.score);
  }
}

module.exports = { LexicalOverlapReranker, categorizePath, DEFAULT_CATEGORY_FACTORS };
