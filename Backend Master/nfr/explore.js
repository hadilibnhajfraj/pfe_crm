const U = "http://127.0.0.1:4100";
const tok = {};
async function login(role) { const r = await fetch(U + "/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: "QaAudit#2026" }) }); tok[role] = (await r.json()).accessToken; }
async function call(role, method, path, body) {
  const r = await fetch(U + path, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tok[role]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); console.log(`${method} ${path} [${role}] -> ${r.status} ${t.slice(0, Number(process.env.N || 330)).replace(/\s+/g, " ")}`);
  try { return JSON.parse(t); } catch { return null; }
}
(async () => {
  for (const r of ["commercial", "commercial_sedentaire", "responsable_logistique_achat", "superadmin", "accueil"]) await login(r);
  const RLA = "responsable_logistique_achat";
  await call(RLA, "GET", "/machines");
  const d = await call(RLA, "POST", "/por-promesh/new", { machine: "1", poste: "matin" });
  const id = d && (d.id || (d.data && d.data.id) || (d.report && d.report.id));
  console.log("POR id =", id);
  if (id) {
    await call(RLA, "PUT", `/por-promesh/${id}`, { operateur: "QA Operateur" });
    await call(RLA, "POST", `/por-promesh/${id}/validate`);
    await call(RLA, "PUT", `/por-promesh/${id}`, { operateur: "Modif après validation" });
    await call(RLA, "POST", `/por-promesh/${id}/validate`);
    await call(RLA, "DELETE", `/por-promesh/${id}`);
  }
  await call(RLA, "POST", "/machines", { typeMachine: "PROBAR" });
  await call(RLA, "POST", "/industrial-records", { module: "probar" });
  await call("commercial", "POST", "/maintenance-requests", { equipement: "", typePanne: "" });
  await call("commercial", "POST", "/hr-requests", { type: "vacances" });
  await call("commercial", "POST", "/archive-requests", {});
  await call("commercial", "POST", "/commercial-contacts", {});
  await call("commercial", "POST", "/commercial-contacts/assign", { contactIds: ["x"], commercialId: "y" });
  await call("commercial", "GET", "/projects?limit=1");
  await call("commercial_sedentaire", "GET", "/commercial-contacts?limit=1");
  await call("commercial", "GET", "/notifications");
  await call("commercial", "GET", "/projects/00000000-0000-0000-0000-000000000000");
  await call("commercial", "GET", "/commercial-contacts/00000000-0000-0000-0000-000000000000");
  await call("commercial", "POST", "/projects", {});
})();
