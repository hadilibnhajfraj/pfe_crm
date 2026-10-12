"use strict";

// PLAN À BLANC FINAL des corrections de données autorisées, ligne par ligne.
//
//   npm run data:plan
//
// LECTURE SEULE : ce script n'exécute que des SELECT. Il écrit dans
// reports/data-quality/ :
//   - dry-run-final.json         : lot A et lot B, une entrée par valeur
//   - duplicate-review.json      : paires de doublons candidats (jamais fusionnées)
//   - contact-client-links.json  : contacts portant le matricule d'un client
//
// Lot A — liens déduits d'un libellé déjà présent sur la même ligne :
//   project_actions.actionTypeId, projects.engineerId, projects.companyId
// Lot B — coordonnées reprises des projets de la personne :
//   engineers.phone / email, architects.phone / email
//   HIGH            = une seule valeur, valide, propre à cette personne
//   REVIEW_REQUIRED = plusieurs valeurs, format non reconnu, valeur portée
//                     par une autre personne, ou nom de fiche inexploitable
//
// Aucune valeur n'est inventée ni reformatée : la valeur proposée est celle
// saisie dans le CRM, citée avec sa ligne d'origine. Seules des cases vides
// sont proposées au remplissage.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/db");
const { normalizeName } = require("../src/utils/nameMatch");

const OUT_DIR = path.join(__dirname, "..", "reports", "data-quality");
const PLACEHOLDERS = new Set(["none", "null", "n/a", "na", "-", "--", ".", "x", "aucun", "neant", "inconnu", "test", "xxx", "?"]);

const q = (sql, replacements = {}) => sequelize.query(sql, { replacements, type: "SELECT" });
const clean = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ");
const digits = (v) => String(v || "").replace(/\D/g, "");
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Numéro tunisien : 8 chiffres, éventuellement précédés de 216.
const validTnPhone = (v) => /^(?:00216|216)?[2-9]\d{7}$/.test(digits(v));
const taxKey = (v) => clean(v).toUpperCase().replace(/[^A-Z0-9]/g, "");
// « strict » : identique à la casse et aux espaces près. « normalized » :
// identique une fois accents et ponctuation retirés.
const strictKey = (v) => clean(v).toLowerCase();
const usableName = (v) => normalizeName(v).length >= 3 && !PLACEHOLDERS.has(normalizeName(v));

function matchReferential(label, referential) {
  const value = clean(label);
  if (!value || PLACEHOLDERS.has(normalizeName(value))) return { status: "empty" };
  const strict = referential.filter((r) => strictKey(r.name) === strictKey(value));
  if (strict.length === 1) return { status: "match", kind: "strict", match: strict[0] };
  const normalized = referential.filter((r) => normalizeName(r.name) === normalizeName(value));
  if (normalized.length === 1) return { status: "match", kind: "normalized", match: normalized[0] };
  return { status: strict.length + normalized.length ? "ambiguous" : "none" };
}

// Calcule les deux lots à partir de l'état actuel de la base (SELECT seuls).
async function computeLots() {
  const companies = await q(`SELECT id, name FROM companies`);
  const engineers = await q(`SELECT id, name, phone, email FROM engineers`);
  const architects = await q(`SELECT id, name, phone, email FROM architects`);
  const actionTypes = await q(`SELECT id, name FROM project_action_types`);
  const projects = await q(
    `SELECT id, "nomProjet" AS name, entreprise, "companyId", "ingenieurResponsable", "engineerId", "telephoneIngenieur", "emailIngenieur",
            architecte, "architectId", "telephoneArchitecte", "emailArchitecte"
       FROM projects`
  );

  // ── LOT A ────────────────────────────────────────────────────────────────
  const lotA = [];
  const lotANotMatched = [];

  const actions = await q(`SELECT id, "projectId", "typeAction_legacy"::text AS legacy FROM project_actions WHERE "actionTypeId" IS NULL ORDER BY id`);
  for (const a of actions) {
    const r = matchReferential(a.legacy, actionTypes);
    const base = { table: "project_actions", record_id: String(a.id), column: "actionTypeId", old_value: null, source: { type: "CRM_database", table: "project_actions", record_id: String(a.id), column: "typeAction_legacy", value: a.legacy } };
    if (r.status === "match") lotA.push({ ...base, new_value: r.match.id, new_value_label: r.match.name, match: r.kind, reason: `libellé « ${clean(a.legacy)} » = project_action_types.name « ${r.match.name} »`, confidence: "HIGH", operation: "UPDATE" });
    else lotANotMatched.push({ ...base, reason: `aucun type d'action unique pour « ${clean(a.legacy)} »`, operation: "SKIPPED" });
  }

  // Lien effectif d'un projet après le lot A (existant, ou proposé par le lot A).
  const effective = new Map(projects.map((p) => [p.id, { engineerId: p.engineerId, engineerVia: p.engineerId ? "lien existant" : null, architectId: p.architectId, architectVia: p.architectId ? "lien existant" : null }]));
  for (const p of projects) {
    for (const [text, column, referential, table, sourceColumn] of [
      [p.ingenieurResponsable, "engineerId", engineers, "engineers", "ingenieurResponsable"],
      [p.entreprise, "companyId", companies, "companies", "entreprise"],
    ]) {
      if (p[column] || !clean(text)) continue;
      const r = matchReferential(text, referential);
      const base = { table: "projects", record_id: p.id, record_label: p.name, column, old_value: null, source: { type: "CRM_database", table: "projects", record_id: p.id, column: sourceColumn, value: clean(text) } };
      if (r.status === "match") {
        lotA.push({ ...base, new_value: r.match.id, new_value_label: r.match.name, match: r.kind, reason: `libellé « ${clean(text)} » = ${table}.name « ${r.match.name} »`, confidence: "HIGH", operation: "UPDATE" });
        if (column === "engineerId") Object.assign(effective.get(p.id), { engineerId: r.match.id, engineerVia: "lien proposé par le lot A" });
      } else if (r.status !== "empty") {
        lotANotMatched.push({ ...base, reason: r.status === "ambiguous" ? `« ${clean(text)} » correspond à plusieurs lignes de ${table}` : `« ${clean(text)} » absent de ${table} : créer la fiche est une décision métier`, operation: "SKIPPED" });
      }
    }
  }

  // ── LOT B ────────────────────────────────────────────────────────────────
  const lotB = [];
  const lotBReview = [];
  // Une même valeur portée par plusieurs personnes est un conflit.
  const holders = { phone: new Map(), email: new Map() };
  const people = [
    ...engineers.map((e) => ({ ...e, table: "engineers", idKey: "engineerId", viaKey: "engineerVia", phoneColumn: "telephoneIngenieur", emailColumn: "emailIngenieur" })),
    ...architects.map((a) => ({ ...a, table: "architects", idKey: "architectId", viaKey: "architectVia", phoneColumn: "telephoneArchitecte", emailColumn: "emailArchitecte" })),
  ];
  const keyOf = (column, v) => (column === "phone" ? digits(v).slice(-8) : clean(v).toLowerCase());
  const found = new Map();
  for (const person of people) {
    const own = projects.filter((p) => effective.get(p.id)[person.idKey] === person.id);
    for (const column of ["phone", "email"]) {
      const projectColumn = column === "phone" ? person.phoneColumn : person.emailColumn;
      const values = new Map();
      for (const p of own) {
        const raw = clean(p[projectColumn]);
        if (!raw || PLACEHOLDERS.has(normalizeName(raw))) continue;
        const key = keyOf(column, raw) || raw;
        if (!values.has(key)) values.set(key, { key, forms: new Map(), projects: [] });
        const entry = values.get(key);
        entry.forms.set(raw, (entry.forms.get(raw) || 0) + 1);
        entry.projects.push({ id: p.id, name: p.name, column: projectColumn, value: raw, link: effective.get(p.id)[person.viaKey] });
      }
      found.set(`${person.table}:${person.id}:${column}`, { person, column, own, values: [...values.values()] });
      for (const v of values.values()) {
        if (!holders[column].has(v.key)) holders[column].set(v.key, new Map());
        holders[column].get(v.key).set(`${person.table}:${person.id}`, person.name);
      }
    }
  }
  for (const { person, column, own, values } of found.values()) {
    if (!values.length || clean(person[column])) continue;
    const candidates = values.map((v) => ({ value: [...v.forms.entries()].sort((a, b) => b[1] - a[1])[0][0], forms: [...v.forms.keys()], projects: v.projects, key: v.key }));
    const conflicts = [];
    if (candidates.length > 1) conflicts.push(`${candidates.length} valeurs différentes sur ses projets`);
    if (!usableName(person.name)) conflicts.push(`nom de fiche inexploitable (« ${clean(person.name)} »)`);
    for (const c of candidates) {
      const valid = column === "phone" ? validTnPhone(c.value) : EMAIL_RE.test(c.value);
      if (!valid) conflicts.push(`format non reconnu : « ${c.value} »`);
      const others = [...holders[column].get(c.key).entries()].filter(([id]) => id !== `${person.table}:${person.id}`).map(([, name]) => name);
      if (others.length) conflicts.push(`« ${c.value} » est aussi sur les projets de : ${others.join(", ")}`);
    }
    const entry = {
      table: person.table,
      record_id: person.id,
      record_label: person.name,
      column,
      old_value: person[column] || null,
      new_value: conflicts.length ? null : candidates[0].value,
      value_found: candidates.map((c) => ({ value: c.value, other_forms: c.forms.filter((f) => f !== c.value), projects: c.projects.length })),
      projects_linked: own.length,
      projects_with_value: candidates.reduce((s, c) => s + c.projects.length, 0),
      source: { type: "CRM_database", table: "projects", column: column === "phone" ? person.phoneColumn : person.emailColumn, records: candidates.flatMap((c) => c.projects) },
      conflicts,
    };
    if (conflicts.length) lotBReview.push({ ...entry, reason: conflicts.join(" ; "), confidence: candidates.length > 1 ? "MEDIUM" : "LOW", operation: "REVIEW_REQUIRED" });
    else lotB.push({ ...entry, reason: `seule valeur saisie, sur ${entry.projects_with_value} de ses ${own.length} projet(s)`, confidence: "HIGH", operation: "UPDATE" });
  }

  return { lotA, lotANotMatched, lotB, lotBReview, projects, companies };
}

async function main() {
  const generatedAt = new Date().toISOString();
  const { lotA, lotANotMatched, lotB, lotBReview, projects, companies } = await computeLots();
  const tally = (list, fn) => list.reduce((acc, x) => ((acc[fn(x)] = (acc[fn(x)] || 0) + 1), acc), {});
  const plan = {
    generatedAt,
    dryRun: true,
    note: "Aucune écriture. Seules des cases vides sont proposées au remplissage ; aucune valeur existante n'est remplacée.",
    summary: {
      lotA: { toUpdate: lotA.length, byColumn: tally(lotA, (c) => `${c.table}.${c.column}`), byMatch: tally(lotA, (c) => `${c.table}.${c.column} (${c.match})`), notMatched: lotANotMatched.length },
      lotB: { toUpdate: lotB.length, byColumn: tally(lotB, (c) => `${c.table}.${c.column}`), reviewRequired: lotBReview.length, reviewByColumn: tally(lotBReview, (c) => `${c.table}.${c.column}`) },
      outOfScope: ["notifications", "fusion de doublons", "clés étrangères clients / contacts / sociétés", "projects.productFamily"],
    },
    lotA: { changes: lotA, notMatched: lotANotMatched },
    lotB: { changes: lotB, reviewRequired: lotBReview },
  };

  // ── DOUBLONS : dossier de revue, aucune fusion ───────────────────────────
  const audit = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "audit.json"), "utf8"));
  const tables = { company: "companies", engineer: "engineers", architect: "architects", client: "clients", contact: "commercial_contacts" };
  const links = { company: "companyId", engineer: "engineerId", architect: "architectId" };
  const fullRow = async (entity, id) => {
    const [row] = await q(`SELECT * FROM "${tables[entity]}" WHERE id = :id`, { id });
    if (!row) return null;
    if (links[entity]) row.linkedProjects = projects.filter((p) => p[links[entity]] === id).length;
    return row;
  };
  const clientsByTax = tally(await q(`SELECT "matriculeFiscal" AS m FROM clients WHERE "matriculeFiscal" IS NOT NULL`), (c) => taxKey(c.m));
  const IGNORED = new Set(["id", "createdAt", "updatedAt"]);
  const pairs = [];
  for (const [group, { candidates }] of Object.entries(audit.duplicates)) {
    for (const c of candidates) {
      const a = await fullRow(c.entity, c.record1.id);
      const b = await fullRow(c.entity, c.record2.id);
      if (!a || !b) continue;
      const similar = {};
      const different = {};
      for (const key of Object.keys(a)) {
        if (IGNORED.has(key)) continue;
        const [va, vb] = [a[key], b[key]];
        if (va == null && vb == null) continue;
        if (clean(va).toLowerCase() === clean(vb).toLowerCase()) similar[key] = va;
        else different[key] = { A: va, B: vb };
      }
      let recommendation = "À vérifier : orthographe proche, peut désigner deux entités distinctes.";
      if (c.confidence >= 0.95) recommendation = "Probablement la même fiche : fusion à valider par un responsable.";
      else if (c.confidence >= 0.8) recommendation = "Probablement la même entité (mêmes mots) : à confirmer avant toute fusion.";
      if (group === "clientsByTaxId") {
        const shared = clientsByTax[taxKey(a.matriculeFiscal)] || 0;
        recommendation = shared > 2 ? `Matricule de remplissage partagé par ${shared} clients : NE PAS fusionner ; le matricule est à corriger à la source.` : "Même matricule fiscal : probablement le même client saisi deux fois, fusion à valider.";
      }
      if (group === "contacts" && c.confidence < 0.95) recommendation = "Deux noms sur un même numéro (standard d'entreprise ou collègues) : ne pas fusionner sans vérification.";
      pairs.push({ group, entity: c.entity, table: tables[c.entity], recordA: a, recordB: b, similarFields: similar, differentFields: different, score: c.confidence, reason: c.reason, recommendation, status: "REVIEW_REQUIRED" });
    }
  }
  const duplicateReview = { generatedAt, note: "Aucune fusion effectuée ni proposée à l'écriture. Chaque paire attend une décision humaine.", total: pairs.length, byGroup: tally(pairs, (p) => p.group), pairs };

  // ── CONTACTS ↔ CLIENTS : analyse seule, aucune modification de structure ──
  const clients = await q(`SELECT id, code, "raisonSociale", "matriculeFiscal", region FROM clients`);
  const contacts = await q(`SELECT id, nom, prenom, "nomSociete", telephone, "matriculeFiscale" FROM commercial_contacts`);
  const clientsByKey = new Map();
  for (const c of clients) {
    const key = taxKey(c.matriculeFiscal);
    if (key.length < 6) continue;
    if (!clientsByKey.has(key)) clientsByKey.set(key, []);
    clientsByKey.get(key).push(c);
  }
  const companyByName = new Map(companies.map((c) => [normalizeName(c.name), c]));
  const contactLinks = [];
  for (const c of contacts) {
    const matches = clientsByKey.get(taxKey(c.matriculeFiscale));
    if (taxKey(c.matriculeFiscale).length < 6 || !matches) continue;
    const company = companyByName.get(normalizeName(c.nomSociete)) || matches.map((m) => companyByName.get(normalizeName(m.raisonSociale))).find(Boolean) || null;
    const sameName = matches.some((m) => normalizeName(m.raisonSociale) === normalizeName(c.nomSociete));
    contactLinks.push({
      contact: { id: c.id, name: clean(`${c.prenom || ""} ${c.nom || ""}`), nomSociete: c.nomSociete, telephone: c.telephone },
      matricule: c.matriculeFiscale,
      matchingClients: matches.map((m) => ({ id: m.id, code: m.code, raisonSociale: m.raisonSociale, region: m.region })),
      matchingCompany: company ? { id: company.id, name: company.name } : null,
      currentRelation: "aucune : la société du contact est un texte libre (nomSociete), sans lien vers clients ni companies",
      proposedRelation:
        matches.length > 1
          ? `aucune : matricule partagé par ${matches.length} clients (valeur de remplissage ou doublon client à traiter d'abord)`
          : `contact → client « ${matches[0].raisonSociale} » (code ${matches[0].code})${sameName ? ", nom de société identique" : ", nom de société différent : à vérifier"}`,
      status: "ANALYSIS_ONLY",
    });
  }
  const linkReport = { generatedAt, note: "Analyse seule : aucune clé étrangère ajoutée, aucune structure modifiée.", total: contactLinks.length, withSingleClient: contactLinks.filter((l) => l.matchingClients.length === 1).length, withCompany: contactLinks.filter((l) => l.matchingCompany).length, links: contactLinks };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, "dry-run-final.json"), JSON.stringify(plan, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "duplicate-review.json"), JSON.stringify(duplicateReview, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, "contact-client-links.json"), JSON.stringify(linkReport, null, 2));

  console.log("Plan à blanc final (lecture seule) :");
  console.log(`  Lot A : ${lotA.length} modification(s) ${JSON.stringify(plan.summary.lotA.byMatch)} — ${lotANotMatched.length} sans correspondance`);
  console.log(`  Lot B : ${lotB.length} HIGH ${JSON.stringify(plan.summary.lotB.byColumn)} — ${lotBReview.length} REVIEW_REQUIRED ${JSON.stringify(plan.summary.lotB.reviewByColumn)}`);
  console.log(`  Doublons à revoir : ${pairs.length} — contacts portant un matricule client : ${contactLinks.length}`);
  await sequelize.close();
}

if (require.main === module) {
  main().catch(async (err) => {
    console.error("Plan interrompu :", err.message);
    try {
      await sequelize.close();
    } catch (_e) {
      /* connexion déjà fermée */
    }
    process.exit(1);
  });
}

module.exports = { computeLots };
