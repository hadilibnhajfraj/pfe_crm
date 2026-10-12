// Audit non fonctionnel — test de charge k6 des endpoints critiques de l'API.
// Usage : k6 run -e VUS=10 -e DURATION=60s -e BASE_URL=http://127.0.0.1:4100 nfr/k6/api-load.js
// Cible : instance de TEST uniquement (nfr/start-test-instance.sh).
import http from "k6/http";
import { check, group, sleep } from "k6";
import { Trend, Rate } from "k6/metrics";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:4100";
const VUS = Number(__ENV.VUS || 10);
const DURATION = __ENV.DURATION || "60s";
const PASSWORD = __ENV.QA_PASSWORD || "QaAudit#2026";

export const options = {
  scenarios: {
    charge: {
      executor: "ramping-vus",
      startVUs: 0,
      stages: [
        { duration: "10s", target: VUS },
        { duration: DURATION, target: VUS },
        { duration: "5s", target: 0 },
      ],
      gracefulRampDown: "10s",
    },
  },
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  // Seuils = OBJECTIFS de l'audit (pas des résultats) : k6 indique s'ils sont tenus.
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["avg<2000", "p(95)<2000"],
  },
};

// Un Trend par endpoint pour obtenir le détail dans le résumé.
const ENDPOINTS = [
  ["health", "/health", null],
  ["projects", "/projects?limit=20", "commercial"],
  ["contacts", "/commercial-contacts", "commercial_sedentaire"],
  ["dashboard_user", "/dashboard/user", "commercial"],
  ["dashboard_kpis", "/dashboard/kpis", "superadmin"],
  ["notifications", "/notifications", "commercial"],
  ["machines", "/machines", "responsable_logistique_achat"],
  ["por_promesh", "/por-promesh", "responsable_logistique_achat"],
  ["industrial_records", "/industrial-records", "responsable_logistique_achat"],
  ["maintenance", "/maintenance-requests", "responsable_logistique_achat"],
  ["hr_requests", "/hr-requests", "commercial"],
];
const trends = {};
for (const [name] of ENDPOINTS) trends[name] = new Trend(`ep_${name}`, true);
const checksOk = new Rate("business_checks_ok");

export function setup() {
  const tokens = {};
  for (const role of ["commercial", "commercial_sedentaire", "responsable_logistique_achat", "superadmin"]) {
    const res = http.post(
      `${BASE}/auth/signin`,
      JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: PASSWORD }),
      { headers: { "Content-Type": "application/json" } }
    );
    if (res.status !== 200) throw new Error(`Connexion ${role} impossible (HTTP ${res.status})`);
    tokens[role] = res.json("accessToken");
  }
  return { tokens };
}

export default function (data) {
  group("parcours utilisateur", () => {
    for (const [name, path, role] of ENDPOINTS) {
      const params = { tags: { endpoint: name } };
      if (role) params.headers = { Authorization: `Bearer ${data.tokens[role]}` };
      const res = http.get(`${BASE}${path}`, params);
      trends[name].add(res.timings.duration);
      checksOk.add(check(res, { "statut 200": (r) => r.status === 200 }));
    }
  });
  sleep(1); // temps de réflexion entre deux parcours
}

export function handleSummary(data) {
  const out = __ENV.OUT || `reports/k6/summary-${VUS}vus.json`;
  return { [out]: JSON.stringify(data, null, 2) };
}
