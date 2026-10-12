"use strict";
// Cas COMPLÉMENTAIRES du Copilot (hors des 22 cas de référence, non comptés dans le taux) :
//   S01 — relance formulée simplement, puis confirmation ;
//   S02 — RAG avec téléversement au bon format (multipart).
require("dotenv").config();
const fs = require("fs");
const { Client } = require("pg");
const U = process.env.BASE_URL || "http://127.0.0.1:4100";
const tok = {};
const login = async (role) => { const r = await fetch(`${U}/auth/signin`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: process.env.QA_PASSWORD || "QaAudit#2026" }) }); tok[role] = (await r.json()).accessToken; };
const chat = async (role, message, conversationId) => { const t0 = Date.now(); const r = await fetch(`${U}/ai-copilot/chat`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok[role]}` }, body: JSON.stringify({ message, ...(conversationId ? { conversationId } : {}) }) }); const j = await r.json(); const d = j.data || {}; return { http: r.status, ms: Date.now() - t0, conversationId: d.conversationId, intent: d.intent, agent: d.agent, answer: d.answer, tools: (d.toolCalls || []).map((c) => ({ tool: c.tool, input: c.input, output: String(c.output).slice(0, 300) })), pendingAction: d.pendingAction, citations: d.citations }; };
(async () => {
  const db = new Client({ host: process.env.DB_HOST, port: Number(process.env.DB_PORT), user: process.env.DB_USER, password: process.env.DB_PASSWORD, database: `${process.env.DB_NAME}_test` });
  await db.connect();
  const n = async () => Number((await db.query(`SELECT count(*) n FROM commercial_contact_relances`)).rows[0].n);
  await login("commercial_sedentaire"); await login("commercial");
  const out = { executedAt: new Date().toISOString(), note: "Cas complémentaires, non comptés dans le taux des 22 cas de référence." };
  await db.query(`DELETE FROM commercial_contacts WHERE "nomSociete" = 'Atlas NFR'`);
  const c = await (await fetch(`${U}/commercial-contacts`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${tok.commercial_sedentaire}` }, body: JSON.stringify({ typeClient: "Tuteur", nomSociete: "Atlas NFR", nom: "Atlas", prenom: "NFR", telephone: "20000009", statut: "ok" }) })).json();
  const before = await n();
  const a = await chat("commercial_sedentaire", "Crée une relance pour le contact Atlas NFR.");
  const mid = await n();
  const b = await chat("commercial_sedentaire", "Demain à 10h, commentaire : suivi devis.", a.conversationId);
  const mid2 = await n();
  const yes = await chat("commercial_sedentaire", "Oui, je confirme.", a.conversationId);
  const after = await n();
  out.S01 = { title: "Relance formulée simplement puis confirmation", relances: { before, afterRequest: mid, afterDetails: mid2, afterConfirmation: after }, pendingAfterRequest: a.pendingAction != null, pendingAfterDetails: b.pendingAction != null, steps: [a, b, yes] };
  await db.query(`DELETE FROM commercial_contacts WHERE id = $1`, [c.id]);
  // S02 — RAG multipart
  const form = new FormData();
  form.append("file", new Blob(["Procédure qualité NFR-7421. Le délai de garantie des treillis PROMESH de référence ZX-7421 est de 37 mois à compter de la date de livraison."], { type: "text/plain" }), "procedure-nfr-7421.txt");
  const up = await fetch(`${U}/ai-copilot/documents`, { method: "POST", headers: { Authorization: `Bearer ${tok.commercial}` }, body: form });
  const upj = await up.json().catch(() => ({}));
  const q = up.status === 201 ? await chat("commercial", "D'après les documents, quel est le délai de garantie de la référence ZX-7421 ?") : null;
  out.S02 = { title: "RAG — téléversement multipart puis question", uploadHttp: up.status, uploadBody: JSON.stringify(upj).slice(0, 300), factRestituted: q ? /37\s*mois/i.test(String(q.answer)) : null, citations: q ? (q.citations || []).length : null, question: q };
  const id = upj.data && (upj.data.id || upj.data.documentId);
  if (id) await fetch(`${U}/ai-copilot/documents/${id}`, { method: "DELETE", headers: { Authorization: `Bearer ${tok.commercial}` } });
  await db.end();
  fs.writeFileSync("reports/copilot/copilot-supplementary.json", JSON.stringify(out, null, 2));
  console.log("S01", JSON.stringify(out.S01.relances), "pending:", out.S01.pendingAfterRequest, out.S01.pendingAfterDetails);
  for (const s of out.S01.steps) console.log("   ", s.ms, "ms |", JSON.stringify(s.tools.map((t) => t.tool)), "|", String(s.answer).slice(0, 200));
  console.log("S02 upload", out.S02.uploadHttp, out.S02.uploadBody.slice(0, 160), "| fact:", out.S02.factRestituted, "citations:", out.S02.citations, "|", q ? String(q.answer).slice(0, 200) : "");
})().catch((e) => { console.error("ERR", e); process.exit(1); });
