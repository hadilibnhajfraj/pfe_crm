"use strict";
// Échantillonne les ressources pendant un test de charge (toutes les 2 s) :
//   - processus Node du backend : CPU et mémoire, lus sur /metrics (prom-client) ;
//   - machine : CPU global (os.cpus) et mémoire libre ;
//   - PostgreSQL : connexions actives et transactions par seconde (pg_stat_database).
//     Le CPU des processus postgres n'est pas lisible sans droits administrateur
//     (service Windows) : il n'est donc pas relevé.
// Usage : node nfr/k6/resource-sampler.js <fichier-sortie.json>   (arrêt : SIGINT / SIGTERM, ou fichier <sortie>.stop)
require("dotenv").config();
const fs = require("fs");
const os = require("os");
const { Client } = require("pg");

const OUT = process.argv[2] || "reports/k6/resources.json";
const BASE = process.env.BASE_URL || "http://127.0.0.1:4100";
const TOKEN = process.env.METRICS_TOKEN || "nfr-metrics-token";
const INTERVAL = 2000;
const samples = [];
let prev = null;

function cpuTimes() {
  let idle = 0;
  let total = 0;
  for (const c of os.cpus()) {
    for (const k of Object.keys(c.times)) total += c.times[k];
    idle += c.times.idle;
  }
  return { idle, total };
}

function metric(text, name) {
  const m = text.match(new RegExp(`^${name}(?:\\{[^}]*\\})? ([0-9.eE+-]+)$`, "m"));
  return m ? Number(m[1]) : null;
}

async function main() {
  const db = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: `${process.env.DB_NAME}_test`,
  });
  await db.connect();
  let stop = false;
  process.on("SIGINT", () => (stop = true));
  process.on("SIGTERM", () => (stop = true));

  while (!stop && !fs.existsSync(`${OUT}.stop`)) {
    const t = Date.now();
    const cpu = cpuTimes();
    let node = null;
    try {
      const text = await (await fetch(`${BASE}/metrics`, { headers: { Authorization: `Bearer ${TOKEN}` } })).text();
      node = {
        cpuSeconds: metric(text, "process_cpu_seconds_total"),
        rssBytes: metric(text, "process_resident_memory_bytes"),
        heapUsedBytes: metric(text, "nodejs_heap_size_used_bytes"),
        eventLoopLagP99: metric(text, "nodejs_eventloop_lag_p99_seconds"),
      };
    } catch (e) {
      node = null;
    }
    const conn = await db.query(
      `SELECT count(*) FILTER (WHERE state = 'active')::int AS active, count(*)::int AS total
       FROM pg_stat_activity WHERE datname = current_database()`
    );
    const tx = await db.query(
      `SELECT (xact_commit + xact_rollback)::bigint AS n FROM pg_stat_database WHERE datname = current_database()`
    );
    const pg = { tx: Number(tx.rows[0].n) };
    if (prev) {
      const dt = (t - prev.t) / 1000;
      samples.push({
        at: new Date(t).toISOString(),
        systemCpuPct: +(100 * (1 - (cpu.idle - prev.cpu.idle) / (cpu.total - prev.cpu.total))).toFixed(1),
        systemFreeMemMb: Math.round(os.freemem() / 1048576),
        nodeCpuPctOfOneCore: node && prev.node ? +(100 * (node.cpuSeconds - prev.node.cpuSeconds) / dt).toFixed(1) : null,
        nodeRssMb: node ? Math.round(node.rssBytes / 1048576) : null,
        nodeHeapUsedMb: node ? Math.round(node.heapUsedBytes / 1048576) : null,
        nodeEventLoopLagP99Ms: node && node.eventLoopLagP99 != null ? +(node.eventLoopLagP99 * 1000).toFixed(1) : null,
        postgresTransactionsPerSec: +((pg.tx - prev.pg.tx) / dt).toFixed(1),
        postgresActiveConnections: conn.rows[0].active,
        postgresConnections: conn.rows[0].total,
      });
    }
    prev = { t, cpu, pg, node };
    await new Promise((r) => setTimeout(r, Math.max(0, INTERVAL - (Date.now() - t))));
  }
  await db.end();
  const col = (k) => samples.map((s) => s[k]).filter((v) => v != null);
  const stat = (k) => {
    const v = col(k);
    return v.length ? { avg: +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1), max: Math.max(...v) } : null;
  };
  const summary = {};
  for (const k of ["systemCpuPct", "nodeCpuPctOfOneCore", "nodeRssMb", "nodeHeapUsedMb", "nodeEventLoopLagP99Ms", "postgresTransactionsPerSec", "postgresActiveConnections", "postgresConnections"]) summary[k] = stat(k);
  fs.writeFileSync(OUT, JSON.stringify({ logicalCpus: os.cpus().length, totalMemMb: Math.round(os.totalmem() / 1048576), sampleCount: samples.length, summary, samples }, null, 2));
  if (fs.existsSync(`${OUT}.stop`)) fs.unlinkSync(`${OUT}.stop`);
}

main().catch((e) => {
  console.error("SAMPLER_ERROR:", e.message);
  process.exit(1);
});
