"use strict";
// Conserve la preuve de collecte Prometheus / Grafana : cibles, requêtes PromQL
// instantanées sur la fenêtre de collecte, export du tableau de bord Grafana.
//   node nfr/monitoring/collect-evidence.js [fenêtre, défaut 10m]
const fs = require("fs");
const P = "http://localhost:9090";
const G = "http://localhost:3001";
const W = process.argv[2] || "10m";
const J = 'job="crm-probar-backend"';
const q = async (expr) => { const r = await (await fetch(`${P}/api/v1/query?query=${encodeURIComponent(expr)}`)).json(); return r.data.result.map((x) => ({ labels: x.metric, value: Number(x.value[1]) })); };
const one = async (expr) => { const r = await q(expr); return r.length ? +r[0].value.toFixed(4) : null; };
(async () => {
  const targets = (await (await fetch(`${P}/api/v1/targets`)).json()).data.activeTargets.map((t) => ({ job: t.labels.job, health: t.health, scrapeUrl: t.scrapeUrl, lastScrape: t.lastScrape, lastError: t.lastError }));
  const ev = {
    collectedAt: new Date().toISOString(), window: W, prometheus: P, targets,
    note: "Valeurs observées sur la fenêtre de collecte uniquement (trafic de test Newman + k6). Ce n'est PAS une mesure historique de disponibilité.",
    metrics: {
      seriesCount: await one(`count({${J}})`),
      requestsInWindow: await one(`sum(increase(http_requests_total{${J}}[${W}]))`),
      requestsPerSecAvg: await one(`sum(rate(http_requests_total{${J}}[${W}]))`),
      avgResponseTimeSeconds: await one(`sum(rate(http_request_duration_seconds_sum{${J}}[${W}])) / sum(rate(http_request_duration_seconds_count{${J}}[${W}]))`),
      p95Seconds: await one(`histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket{${J}}[${W}])))`),
      p99Seconds: await one(`histogram_quantile(0.99, sum by (le) (rate(http_request_duration_seconds_bucket{${J}}[${W}])))`),
      requestsByStatusClass: {
        "2xx": Math.round(await one(`sum(increase(http_requests_total{${J},status_code=~"2.."}[${W}])) or vector(0)`)),
        "3xx": Math.round(await one(`sum(increase(http_requests_total{${J},status_code=~"3.."}[${W}])) or vector(0)`)),
        "4xx": Math.round(await one(`sum(increase(http_requests_total{${J},status_code=~"4.."}[${W}])) or vector(0)`)),
        "5xx": Math.round(await one(`sum(increase(http_requests_total{${J},status_code=~"5.."}[${W}])) or vector(0)`)),
      },
      http5xxInWindow: await one(`sum(increase(http_requests_total{${J},status_code=~"5.."}[${W}])) or vector(0)`),
      nodeCpuPctOfOneCoreAvg: await one(`100 * avg_over_time(rate(process_cpu_seconds_total{${J}}[1m])[${W}:15s])`),
      nodeCpuPctOfOneCoreMax: await one(`100 * max_over_time(rate(process_cpu_seconds_total{${J}}[1m])[${W}:15s])`),
      nodeRssMbNow: await one(`process_resident_memory_bytes{${J}} / 1048576`),
      nodeRssMbMax: await one(`max_over_time(process_resident_memory_bytes{${J}}[${W}]) / 1048576`),
      targetUpNow: await one(`up{${J}}`),
      scrapeSuccessRatioInWindow: await one(`avg_over_time(up{${J}}[${W}])`),
      databaseUpGauge: await one(`crm_database_up{${J}}`),
      postgresConnections: await one(`sum(pg_stat_database_numbackends{datname=~".*_test"})`),
      postgresCommitsPerSecAvg: await one(`sum(rate(pg_stat_database_xact_commit{datname=~".*_test"}[${W}]))`),
      top5RoutesByRequests: (await q(`topk(5, sum by (route) (increase(http_requests_total{${J}}[${W}])))`)).map((x) => ({ route: x.labels.route, requests: Math.round(x.value) })),
    },
  };
  fs.mkdirSync("reports/prometheus", { recursive: true });
  fs.mkdirSync("reports/grafana", { recursive: true });
  fs.writeFileSync("reports/prometheus/prometheus-evidence.json", JSON.stringify(ev, null, 2));
  fs.copyFileSync("nfr/monitoring/prometheus.yml", "reports/prometheus/prometheus.yml");
  const auth = { Authorization: "Basic " + Buffer.from("admin:admin").toString("base64") };
  const d = await (await fetch(`${G}/api/dashboards/uid/crm-probar-nfr`, { headers: auth })).json();
  fs.writeFileSync("reports/grafana/dashboard-export.json", JSON.stringify({ exportedAt: new Date().toISOString(), meta: d.meta, dashboard: d.dashboard }, null, 2));
  const ds = await (await fetch(`${G}/api/datasources`, { headers: auth })).json();
  fs.writeFileSync("reports/grafana/datasources.json", JSON.stringify(ds.map((x) => ({ name: x.name, type: x.type, url: x.url, isDefault: x.isDefault })), null, 2));
  console.log(JSON.stringify(ev.metrics, null, 1));
  console.log("dashboard:", d.dashboard && d.dashboard.title, "| panels:", d.dashboard && d.dashboard.panels.length, "| datasource:", ds.map((x) => x.name + "→" + x.url).join(","));
})().catch((e) => { console.error("EVIDENCE_ERROR:", e.message); process.exit(1); });
