"use strict";

const bridge = require("../services/aiDashboardBridge.service");
const { DashboardPermissionError } = require("../../../ai/dashboard/errors");
const { withNamespace } = require("../../../ai/utils/logger");

const logger = withNamespace("dashboard:http");

// Maps the kebab-case URL segment to DashboardService's own camelCase
// summary key (see src/ai/dashboard/domainAnalyzer.js::CATEGORIES) — the 6
// requested display categories, one route each.
const CATEGORY_PARAM_TO_KEY = {
  alerts: "alerts",
  recommendations: "recommendations",
  anomalies: "anomalies",
  forecasts: "forecasts",
  risks: "risks",
  "data-quality": "dataQuality",
};

function handle(res, err) {
  if (err instanceof DashboardPermissionError) {
    return res.status(403).json({ success: false, message: err.message });
  }
  logger.error("unhandled error", err);
  return res.status(500).json({ success: false, message: "Internal server error" });
}

// GET /ai-dashboard — full snapshot: every domain + the 6-category summary.
async function getSnapshot(req, res) {
  try {
    const data = await bridge.getSnapshot(req.user);
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

// GET /ai-dashboard/:domain — one of the 7 requested domains.
async function getDomain(req, res) {
  const { domain } = req.params;
  if (!bridge.DOMAIN_NAMES.includes(domain)) {
    return res.status(400).json({ success: false, message: `Unknown domain "${domain}". Valid domains: ${bridge.DOMAIN_NAMES.join(", ")}.` });
  }
  try {
    const data = await bridge.getDomainSnapshot(req.user, domain);
    res.json({ success: true, data });
  } catch (err) {
    handle(res, err);
  }
}

// GET /ai-dashboard/insights/:category — one of the 6 requested categories,
// aggregated across every domain the caller can access.
async function getInsightsByCategory(req, res) {
  const { category } = req.params;
  const key = CATEGORY_PARAM_TO_KEY[category];
  if (!key) {
    return res.status(400).json({ success: false, message: `Unknown insight category "${category}". Valid categories: ${Object.keys(CATEGORY_PARAM_TO_KEY).join(", ")}.` });
  }
  try {
    const snapshot = await bridge.getSnapshot(req.user);
    res.json({ success: true, data: snapshot.summary[key] });
  } catch (err) {
    handle(res, err);
  }
}

module.exports = { getSnapshot, getDomain, getInsightsByCategory, CATEGORY_PARAM_TO_KEY };
