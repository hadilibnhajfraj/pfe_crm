"use strict";
// Agrège les résultats bruts k6 + ressources en un tableau de scalabilité.
// Sortie : reports/k6/scalability-summary.json et tableau console.
const fs = require("fs");
const levels = process.argv.slice(2).map(Number);
const f = (n, d = 1) => (n == null ? "n/d" : Number(n).toFixed(d));
const rows = [];
for (const vus of levels.length ? levels : [10, 25, 50, 100]) {
  const p = `reports/k6/summary-${vus}vus.json`;
  if (!fs.existsSync(p)) continue;
  const k = JSON.parse(fs.readFileSync(p, "utf8"));
  const m = k.metrics;
  const d = m.http_req_duration.values;
  const r = fs.existsSync(`reports/k6/resources-${vus}vus.json`) ? JSON.parse(fs.readFileSync(`reports/k6/resources-${vus}vus.json`, "utf8")).summary : {};
  const endpoints = {};
  for (const key of Object.keys(m).filter((x) => x.startsWith("ep_"))) endpoints[key.slice(3)] = { avg: +f(m[key].values.avg), p95: +f(m[key].values["p(95)"]), p99: +f(m[key].values["p(99)"]), max: +f(m[key].values.max) };
  rows.push({
    vus, requests: m.http_reqs.values.count, reqPerSec: +f(m.http_reqs.values.rate, 2), iterations: m.iterations.values.count,
    avgMs: +f(d.avg), medMs: +f(d.med), minMs: +f(d.min), maxMs: +f(d.max), p90Ms: +f(d["p(90)"]), p95Ms: +f(d["p(95)"]), p99Ms: +f(d["p(99)"]),
    errorRatePct: +f(100 * m.http_req_failed.values.rate, 3), checksOkPct: +f(100 * m.business_checks_ok.values.rate, 3),
    thresholds: Object.fromEntries(Object.entries(m).filter(([, v]) => v.thresholds).map(([name, v]) => [name, Object.fromEntries(Object.entries(v.thresholds).map(([t, o]) => [t, o.ok ? "tenu" : "non tenu"]))])),
    systemCpuAvgPct: r.systemCpuPct && r.systemCpuPct.avg, systemCpuMaxPct: r.systemCpuPct && r.systemCpuPct.max,
    nodeCpuAvgPctOfOneCore: r.nodeCpuPctOfOneCore && r.nodeCpuPctOfOneCore.avg, nodeCpuMaxPctOfOneCore: r.nodeCpuPctOfOneCore && r.nodeCpuPctOfOneCore.max,
    nodeRssAvgMb: r.nodeRssMb && r.nodeRssMb.avg, nodeRssMaxMb: r.nodeRssMb && r.nodeRssMb.max,
    eventLoopLagP99MaxMs: r.nodeEventLoopLagP99Ms && r.nodeEventLoopLagP99Ms.max,
    pgTxPerSecAvg: r.postgresTransactionsPerSec && r.postgresTransactionsPerSec.avg, pgConnectionsMax: r.postgresConnections && r.postgresConnections.max, pgActiveMax: r.postgresActiveConnections && r.postgresActiveConnections.max,
    endpoints,
  });
}
fs.writeFileSync("reports/k6/scalability-summary.json", JSON.stringify(rows, null, 2));
console.log("VUs | req | req/s | avg | med | p90 | p95 | p99 | max | err% | sysCPU avg/max | nodeCPU avg/max (%1c) | RSS max | lag p99 max | pg tx/s | pg conn max");
for (const r of rows) console.log([r.vus, r.requests, r.reqPerSec, r.avgMs, r.medMs, r.p90Ms, r.p95Ms, r.p99Ms, r.maxMs, r.errorRatePct, `${r.systemCpuAvgPct}/${r.systemCpuMaxPct}`, `${r.nodeCpuAvgPctOfOneCore}/${r.nodeCpuMaxPctOfOneCore}`, r.nodeRssMaxMb, r.eventLoopLagP99MaxMs, r.pgTxPerSecAvg, r.pgConnectionsMax].join(" | "));
const last = rows[rows.length - 1];
if (last) { console.log(`\nDétail par endpoint à ${last.vus} VUs (avg / p95 / p99 ms) :`); for (const [k, v] of Object.entries(last.endpoints).sort((a, b) => b[1].p95 - a[1].p95)) console.log(`  ${k.padEnd(20)} ${v.avg} / ${v.p95} / ${v.p99}`); }
const first = rows[0];
if (first) { console.log(`\nDétail par endpoint à ${first.vus} VUs (avg / p95 / p99 ms) :`); for (const [k, v] of Object.entries(first.endpoints).sort((a, b) => b[1].p95 - a[1].p95)) console.log(`  ${k.padEnd(20)} ${v.avg} / ${v.p95} / ${v.p99}`); }
