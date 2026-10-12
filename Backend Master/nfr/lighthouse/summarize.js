"use strict";
// Agrège les rapports Lighthouse (médiane de N exécutions par mode).
const fs = require("fs");
const dir = "reports/lighthouse";
const med = (a) => { const s = [...a].sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
const out = {};
for (const mode of ["desktop", "mobile"]) {
  const runs = fs.readdirSync(dir).filter((f) => f.startsWith(`login-${mode}-run`) && f.endsWith(".report.json")).map((f) => JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8")));
  if (!runs.length) continue;
  const cat = (k) => runs.map((r) => Math.round(r.categories[k].score * 100));
  const aud = (k) => runs.map((r) => r.audits[k].numericValue);
  out[mode] = {
    url: runs[0].finalDisplayedUrl, lighthouseVersion: runs[0].lighthouseVersion, fetchTimes: runs.map((r) => r.fetchTime), runs: runs.length,
    performance: { median: med(cat("performance")), all: cat("performance") },
    accessibility: { median: med(cat("accessibility")), all: cat("accessibility") },
    bestPractices: { median: med(cat("best-practices")), all: cat("best-practices") },
    seo: { median: med(cat("seo")), all: cat("seo") },
    fcpMs: Math.round(med(aud("first-contentful-paint"))), lcpMs: Math.round(med(aud("largest-contentful-paint"))),
    tbtMs: Math.round(med(aud("total-blocking-time"))), cls: +med(aud("cumulative-layout-shift")).toFixed(3), speedIndexMs: Math.round(med(aud("speed-index"))),
    totalByteWeightKb: Math.round(med(aud("total-byte-weight")) / 1024),
    emulation: runs[0].configSettings.formFactor, throttling: runs[0].configSettings.throttlingMethod,
  };
}
fs.writeFileSync(`${dir}/lighthouse-summary.json`, JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 1));
