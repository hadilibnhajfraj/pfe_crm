const U = "http://127.0.0.1:4100"; const tok = {}; const ids = {};
async function login(role) { const r = await fetch(U + "/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: "QaAudit#2026" }) }); const j = await r.json(); tok[role] = j.accessToken; ids[role] = j.user.id; }
async function call(role, method, path, body) {
  const r = await fetch(U + path, { method, headers: { "Content-Type": "application/json", ...(role ? { Authorization: `Bearer ${tok[role]}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); console.log(`${method} ${path} [${role}] -> ${r.status} ${t.slice(0, 260).replace(/\s+/g, " ")}`);
  try { return JSON.parse(t); } catch { return null; }
}
(async () => {
  for (const r of ["commercial", "commercial_sedentaire", "responsable_logistique_achat", "superadmin", "accueil", "admin"]) await login(r);
  const RLA = "responsable_logistique_achat", SED = "commercial_sedentaire";
  const c = await call(SED, "POST", "/commercial-contacts", { typeClient: "Tuteur", nom: "NFR", prenom: "Explore", telephone: "20000001", statut: "ok" });
  const cid = c && (c.id || (c.contact && c.contact.id) || (c.data && c.data.id));
  if (cid) {
    await call(SED, "POST", "/commercial-contacts/assign", { contactIds: [cid], commercialId: ids.commercial });
    await call(SED, "POST", "/commercial-contacts/assign", { contactIds: [cid], commercialId: ids.accueil });
    await call(SED, "GET", `/commercial-contacts/${cid}`);
    await call(SED, "POST", `/commercial-contacts/${cid}/relances`, {});
    await call(SED, "POST", `/commercial-contacts/${cid}/relances`, { dateRelance: "2027-01-15", heureRelance: "10:00", commentaire: "NFR" });
    await call("commercial", "GET", `/commercial-contacts/${cid}/actions`);
    await call("accueil", "PUT", `/commercial-contacts/${cid}`, { nom: "Hack" });
    await call("commercial", "DELETE", `/commercial-contacts/${cid}`);
    await call("superadmin", "DELETE", `/commercial-contacts/${cid}`);
  }
  const m = await call("commercial", "POST", "/maintenance-requests", { equipement: "Compresseur NFR", typePanne: "Fuite", urgence: "faible", description: "explore" });
  const mid = m && ((m.data && m.data.id) || m.id);
  if (mid) { await call("commercial", "PUT", `/maintenance-requests/${mid}/accept`); await call(RLA, "PUT", `/maintenance-requests/${mid}/accept`); await call(RLA, "PUT", `/maintenance-requests/${mid}/start`); await call(RLA, "PUT", `/maintenance-requests/${mid}/complete`); await call(RLA, "GET", `/maintenance-requests/${mid}/history`); await call("superadmin", "DELETE", `/maintenance-requests/${mid}`); }
  const h = await call("commercial", "POST", "/hr-requests", { type: "sortie", dateSortie: "2027-02-01", heureSortie: "10:00", heureRetour: "11:00", motif: "NFR" });
  const hid = h && ((h.data && h.data.id) || h.id);
  await call("commercial", "POST", "/hr-requests", { type: "conge", typeConge: "ordinaire", dateDebut: "2027-03-10", dateFin: "2027-03-01", adresse: "Tunis", telephone: "20000001", motif: "x" });
  if (hid) { await call("commercial", "PUT", `/hr-requests/${hid}/accept`); await call("superadmin", "PUT", `/hr-requests/${hid}/accept`); await call("commercial", "DELETE", `/hr-requests/${hid}`); await call("superadmin", "DELETE", `/hr-requests/${hid}`); }
  const p = await call("superadmin", "GET", "/projects?limit=1"); const pid = p.items[0].id;
  const a = await call("commercial", "POST", "/archive-requests", { projectId: pid, subject: "NFR", message: "explore", type: "ARCHIVAGE" });
  await call("commercial", "POST", "/archive-requests", { projectId: pid, subject: "NFR", message: "explore", type: "ARCHIVAGE" });
  const aid = a && ((a.data && a.data.id) || a.id || (a.request && a.request.id));
  if (aid) { await call("superadmin", "DELETE", `/archive-requests/${aid}`); }
  await call(RLA, "POST", "/industrial-records", { module: "melange", dateFiche: "2026-10-03" });
  await call(RLA, "POST", "/recuperables", { module: "PROBAR", machine: "1", ligne: "L1", poste: "matin", date: "2026-10-03", lignes: [{ diametre: "8", dechetKg: -5 }] });
  await call("superadmin", "PUT", `/admin/users/${ids.accueil}/role`, { role: "pirate" });
  await call("admin", "PUT", `/admin/users/${ids.accueil}/role`, { role: "commercial" });
  const all = await (await fetch(U + "/projects?limit=1000", { headers: { Authorization: `Bearer ${tok.commercial}` } })).json(); console.log("projects visible to fresh commercial:", all.items.length, Object.keys(all).join(","));
  const all2 = await (await fetch(U + "/projects?limit=1000", { headers: { Authorization: `Bearer ${tok.superadmin}` } })).json(); console.log("projects visible to superadmin:", all2.items.length, all2.total);
})();
