// Audit non fonctionnel — test de charge k6 de l'authentification (POST /auth/signin).
// Mesuré à part : le hachage bcrypt (coût 12) rend cet endpoint volontairement coûteux.
// Usage : k6 run -e VUS=10 -e DURATION=30s nfr/k6/login-load.js
import http from "k6/http";
import { check, sleep } from "k6";

const BASE = __ENV.BASE_URL || "http://127.0.0.1:4100";
const VUS = Number(__ENV.VUS || 10);
const ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat", "admin", "superadmin", "superadmin2"];

export const options = {
  vus: VUS,
  duration: __ENV.DURATION || "30s",
  summaryTrendStats: ["avg", "min", "med", "max", "p(90)", "p(95)", "p(99)"],
  thresholds: { http_req_failed: ["rate<0.01"], http_req_duration: ["p(95)<2000"] },
};

export default function () {
  const role = ROLES[(__VU + __ITER) % ROLES.length];
  const res = http.post(
    `${BASE}/auth/signin`,
    JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: __ENV.QA_PASSWORD || "QaAudit#2026" }),
    { headers: { "Content-Type": "application/json" } }
  );
  check(res, { "connexion 200": (r) => r.status === 200, "jeton présent": (r) => !!r.json("accessToken") });
  sleep(1);
}

export function handleSummary(data) {
  return { [__ENV.OUT || `reports/k6/summary-login-${VUS}vus.json`]: JSON.stringify(data, null, 2) };
}
