"use strict";

// Small, dependency-free statistical helpers shared across domain analyzers
// (currently industrialAnalyzer.js and kpiAnalyzer.js) — a real (if simple)
// anomaly-detection technique (z-score over a numeric field) rather than
// another ad hoc per-domain rule, following the same "offline, deterministic,
// no ML weight to load" philosophy as rag/embeddings/hashingEmbeddingProvider.js.

/** Arithmetic mean of `values`. `NaN` on an empty array (by design: callers here always guard on length first). */
function mean(values) {
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/** Population standard deviation of `values` around the already-computed mean `avg`. */
function stdDev(values, avg) {
  const variance = values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

/**
 * Flags items whose numeric `field` is more than `zScoreThreshold` standard
 * deviations from the mean of the set. Returns `[]` (never throws) when
 * fewer than 3 numeric values are available — a z-score is meaningless on
 * too small a sample, and "no anomaly detected" is the honest answer, not
 * an error.
 */
function detectNumericOutliers(items, field, { zScoreThreshold = 2 } = {}) {
  const numeric = items.map((item) => ({ item, value: item[field] })).filter(({ value }) => typeof value === "number" && Number.isFinite(value));

  if (numeric.length < 3) return [];

  const values = numeric.map(({ value }) => value);
  const avg = mean(values);
  const deviation = stdDev(values, avg);
  if (deviation === 0) return [];

  return numeric
    .map(({ item, value }) => ({ item, value, zScore: (value - avg) / deviation }))
    .filter(({ zScore }) => Math.abs(zScore) > zScoreThreshold);
}

module.exports = { detectNumericOutliers, mean, stdDev };
