"use strict";
// Audit non fonctionnel — mesure du temps de reprise (RTO technique) de
// l'instance de TEST : arrêt brutal du processus, redémarrage, puis attente
// du retour de /health (base joignable) et d'un appel métier authentifié.
//   node nfr/rto-test.js [répétitions]
// Ce qui est mesuré : le temps de redémarrage à froid du service.
// Ce qui ne l'est pas : le délai de détection de la panne (aucun superviseur
// de type PM2 / systemd n'est configuré dans le projet).
require("dotenv").config();
const fs = require("fs");
const { spawn, execFileSync } = require("child_process");

const PORT = Number(process.env.NFR_PORT || 4100);
const U = `http://127.0.0.1:${PORT}`;
const RUNS = Number(process.argv[2] || 3);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function listeningPid() {
  try {
    const out = execFileSync("powershell", ["-NoProfile", "-Command", `(Get-NetTCPConnection -LocalPort ${PORT} -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1).OwningProcess`], { encoding: "utf8" }).trim();
    return out ? Number(out) : null;
  } catch (e) {
    return null;
  }
}
async function healthy() {
  try {
    const r = await fetch(`${U}/health`, { signal: AbortSignal.timeout(1000) });
    return r.status === 200 && (await r.json()).database === "up";
  } catch (e) {
    return false;
  }
}
function start() {
  const log = fs.openSync("reports/env/test-instance.log", "a");
  const child = spawn(process.execPath, ["src/app.js"], {
    env: { ...process.env, NODE_ENV: "test", PORT: String(PORT), DB_NAME: `${process.env.DB_NAME}_test`, AUTO_EMAIL_JOBS_ENABLED: "false", EMAIL_HOST: "127.0.0.1", EMAIL_PORT: "2525", METRICS_TOKEN: process.env.METRICS_TOKEN || "nfr-metrics-token" },
    detached: true,
    stdio: ["ignore", log, log],
    windowsHide: true,
  });
  child.unref();
}

(async () => {
  const runs = [];
  for (let i = 1; i <= RUNS; i++) {
    const pid = listeningPid();
    if (!pid) throw new Error(`Aucun processus à l'écoute sur le port ${PORT}`);
    const tKill = Date.now();
    process.kill(pid, "SIGKILL");
    while (await healthy()) await sleep(50);
    const tDown = Date.now();
    start();
    while (!(await healthy())) await sleep(100);
    const tHealth = Date.now();
    const s = await fetch(`${U}/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "qa.responsable_logistique_achat@qa-probar.com", password: process.env.QA_PASSWORD || "QaAudit#2026" }) });
    const { accessToken } = await s.json();
    const m = await fetch(`${U}/machines`, { headers: { Authorization: `Bearer ${accessToken}` } });
    const tBusiness = Date.now();
    const run = { run: i, killedPid: pid, at: new Date(tKill).toISOString(), unavailableAfterMs: tDown - tKill, restartToHealthMs: tHealth - tDown, killToHealthMs: tHealth - tKill, killToBusinessCallMs: tBusiness - tKill, businessCallStatus: m.status };
    runs.push(run);
    console.log(JSON.stringify(run));
    await sleep(3000);
  }
  const v = runs.map((r) => r.killToHealthMs);
  const b = runs.map((r) => r.killToBusinessCallMs);
  const report = {
    measuredAt: new Date().toISOString(), target: U, method: "SIGKILL du processus Node puis relance manuelle par script (aucun superviseur automatique)",
    runs,
    killToHealthMs: { min: Math.min(...v), avg: Math.round(v.reduce((a, c) => a + c, 0) / v.length), max: Math.max(...v) },
    killToBusinessCallMs: { min: Math.min(...b), avg: Math.round(b.reduce((a, c) => a + c, 0) / b.length), max: Math.max(...b) },
  };
  // "restart-only" : simple redémarrage de l'instance, sans écraser le rapport de mesure.
  if (process.argv[3] !== "restart-only") fs.writeFileSync("reports/env/rto-results.json", JSON.stringify(report, null, 2));
  console.log("RTO technique (arrêt → /health OK) ms :", JSON.stringify(report.killToHealthMs));
})().catch((e) => {
  console.error("RTO_ERROR:", e.message);
  process.exit(1);
});
