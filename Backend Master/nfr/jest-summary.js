"use strict";
// Résume reports/jest/jest-results.json : totaux, taux de réussite, détail des
// suites d'audit, tests en échec par fichier, tests liés aux intégrations.
const fs = require("fs");
const path = require("path");
const r = JSON.parse(fs.readFileSync("reports/jest/jest-results.json", "utf8"));
const suites = r.testResults.map((s) => ({ file: path.win32.basename(s.name), status: s.status, tests: s.assertionResults, message: s.message }));
const count = (list) => { let t = 0, f = 0; for (const s of list) { t += s.tests.length; f += s.tests.filter((a) => a.status === "failed").length; } return { suites: list.length, tests: t, passed: t - f, failed: f, ratePct: t ? +((100 * (t - f)) / t).toFixed(2) : null }; };
const pick = (re) => count(suites.filter((s) => re.test(s.file)));
const failed = {};
for (const s of suites) { const f = s.tests.filter((a) => a.status === "failed").map((a) => a.fullName || a.title); if (f.length) failed[s.file] = f; }
const summary = {
  executedAt: new Date(r.startTime).toISOString(), command: "npm run test:coverage",
  total: r.numTotalTests, passed: r.numPassedTests, failed: r.numFailedTests, skipped: r.numPendingTests,
  suites: r.numTotalTestSuites, failedSuites: r.numFailedTestSuites, successRatePct: +((100 * r.numPassedTests) / r.numTotalTests).toFixed(2),
  suitesFailedWithoutFailedTest: suites.filter((s) => s.status === "failed" && !failed[s.file]).map((s) => ({ file: s.file, reason: String(s.message || "").replace(/\u001b\[[0-9;]*m/g, "").split("\n").filter(Boolean).slice(0, 3).join(" | ").slice(0, 300) })),
  auditSuites: Object.fromEntries(suites.filter((s) => s.file.startsWith("nfr.")).map((s) => [s.file, count([s])])),
  auditTotal: pick(/^nfr\./),
  existingSuite: count(suites.filter((s) => !s.file.startsWith("nfr."))),
  byDomain: {
    copilotIA: pick(/^(ai\.|aiCopilot|aiDashboardBridge)/),
    googleCalendar: pick(/googleCalendar|calendar/i), email: pick(/email/i), llmProviders: pick(/llmProvider/i),
    redis: pick(/redis/i), rag: pick(/\.rag\.|realRag/i), importCsvExcel: pick(/client|upload/i), socket: pick(/socket/i), mfa: pick(/^mfa/),
  },
  failedTestsByFile: failed,
  coverage: JSON.parse(fs.readFileSync("reports/jest/coverage-summary.json", "utf8")).total,
};
fs.writeFileSync("reports/jest/summary.json", JSON.stringify(summary, null, 2));
const { failedTestsByFile, coverage, ...short } = summary;
console.log(JSON.stringify(short, null, 1));
console.log("failed files:", Object.entries(failedTestsByFile).map(([k, v]) => `${k}=${v.length}`).join(", "));
