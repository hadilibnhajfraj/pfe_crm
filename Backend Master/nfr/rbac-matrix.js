"use strict";
// Relève la matrice RBAC RÉELLE (codes HTTP observés) : chaque rôle QA × chaque
// endpoint GET. Sortie : reports/env/rbac-matrix.json + tableau console.
const fs = require("fs");
const U = process.env.NFR_URL || "http://127.0.0.1:4100";
const ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat", "admin", "superadmin", "superadmin2"];
const PATHS = ["/me", "/projects", "/projects/kpi/dashboard", "/commercial-contacts", "/notifications", "/dashboard/user", "/dashboard/kpis",
  "/admin-dashboard/stats", "/machines", "/por-promesh", "/por-promesh/stats", "/industrial-records", "/recuperables",
  "/maintenance-requests/my", "/maintenance-requests", "/hr-requests", "/archive-requests/my", "/archive-requests",
  "/admin/users", "/users", "/engineers", "/architects", "/companies", "/pipeline-stages", "/tasks", "/ai-copilot/conversations", "/ai-dashboard"];
(async () => {
  const out = {};
  for (const role of ROLES) {
    const r = await fetch(`${U}/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: process.env.QA_PASSWORD || "QaAudit#2026" }) });
    const { accessToken } = await r.json();
    out[role] = {};
    for (const p of PATHS) {
      const res = await fetch(U + p, { headers: { Authorization: `Bearer ${accessToken}` } });
      out[role][p] = res.status;
    }
  }
  fs.mkdirSync("reports/env", { recursive: true });
  fs.writeFileSync("reports/env/rbac-matrix.json", JSON.stringify({ measuredAt: new Date().toISOString(), baseUrl: U, matrix: out }, null, 2));
  const short = { commercial: "COM", commercial_sedentaire: "SED", accueil: "ACC", responsable_logistique_achat: "RLA", admin: "ADM", superadmin: "SA", superadmin2: "SA2" };
  console.log("path".padEnd(30) + ROLES.map((r) => short[r].padStart(5)).join(""));
  for (const p of PATHS) console.log(p.padEnd(30) + ROLES.map((r) => String(out[r][p]).padStart(5)).join(""));
})();
