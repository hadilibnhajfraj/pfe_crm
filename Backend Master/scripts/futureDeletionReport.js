"use strict";

// Rapport de SUPPRESSION FUTURE : pour chaque ligne classée
// DELETE_AFTER_VALIDATION dans test-data-review.json, compte les lignes
// d'autres tables qui en dépendent (clés étrangères). RIEN N'EST SUPPRIMÉ.
//
//   npm run data:deletion-report
//
// LECTURE SEULE : transaction PostgreSQL READ ONLY. Écrit un seul fichier,
// reports/data-quality/FUTURE_DELETION_REPORT.md.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/db");

const DIR = path.join(__dirname, "..", "reports", "data-quality");
const RULES = { a: "NO ACTION (bloque)", r: "RESTRICT (bloque)", c: "CASCADE (supprime aussi)", n: "SET NULL (détache)", d: "SET DEFAULT" };

async function main() {
  const review = JSON.parse(fs.readFileSync(path.join(DIR, "test-data-review.json"), "utf8"));
  const candidates = review.rows.filter((r) => r.action === "DELETE_AFTER_VALIDATION");
  const t = await sequelize.transaction();
  await sequelize.query("SET TRANSACTION READ ONLY", { transaction: t });
  const q = (sql, replacements) => sequelize.query(sql, { type: "SELECT", transaction: t, replacements });

  const fks = await q(
    `SELECT c.conrelid::regclass::text AS child, a.attname AS col, c.confrelid::regclass::text AS parent, c.confdeltype AS rule
       FROM pg_constraint c JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
      WHERE c.contype = 'f' AND array_length(c.conkey, 1) = 1`
  );
  const strip = (s) => s.replace(/"/g, "");
  const tables = [...new Set(candidates.map((c) => c.table))];
  const dependents = new Map(); // id → [{ child, col, rule, n }]
  const totals = {};
  for (const table of tables) {
    const ids = candidates.filter((c) => c.table === table).map((c) => c.record);
    for (const fk of fks.filter((f) => strip(f.parent) === table)) {
      const child = strip(fk.child);
      const rows = await q(`SELECT "${fk.col}"::text AS id, COUNT(*)::int AS n FROM "${child}" WHERE "${fk.col}"::text IN (:ids) GROUP BY 1`, { ids });
      for (const r of rows) {
        if (!dependents.has(r.id)) dependents.set(r.id, []);
        dependents.get(r.id).push({ child, col: fk.col, rule: RULES[fk.rule] || fk.rule, n: r.n });
        const key = `${table} ← ${child}.${fk.col} — ${RULES[fk.rule] || fk.rule}`;
        totals[key] = (totals[key] || 0) + r.n;
      }
    }
  }
  await t.rollback();

  const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 60);
  const lines = [
    "# Rapport de suppression future",
    "",
    `Généré le ${new Date().toISOString().slice(0, 10)} par \`npm run data:deletion-report\`, en lecture seule. **Aucune ligne n'a été supprimée.** Ce rapport prépare une décision ; la suppression demandera un accord explicite, une sauvegarde et un journal.`,
    "",
    `${candidates.length} lignes sont classées \`DELETE_AFTER_VALIDATION\` dans \`TEST_DATA_REVIEW.md\`.`,
    "",
    "## Synthèse",
    "",
    "| Table | Lignes candidates | Sans aucune dépendance | Avec dépendances |",
    "|---|---|---|---|",
    ...tables.map((table) => {
      const rows = candidates.filter((c) => c.table === table);
      const withDeps = rows.filter((r) => dependents.has(r.record)).length;
      return `| \`${table}\` | ${rows.length} | ${rows.length - withDeps} | ${withDeps} |`;
    }),
    "",
    "## Lignes dépendantes, par relation",
    "",
    "Ce que la base ferait si la ligne candidate était supprimée telle quelle.",
    "",
    "| Relation | Lignes dépendantes |",
    "|---|---|",
    ...(Object.keys(totals).length ? Object.entries(totals).sort((a, b) => b[1] - a[1]).map(([k, n]) => `| ${k} | ${n} |`) : ["| aucune | 0 |"]),
    "",
  ];
  for (const table of tables) {
    const rows = candidates.filter((c) => c.table === table);
    lines.push(`## ${table} (${rows.length})`, "", "| Enregistrement | Identifiant | Dépendances | Suppression directe possible |", "|---|---|---|---|");
    for (const r of rows) {
      const deps = dependents.get(r.record) || [];
      const blocking = deps.some((d) => /bloque/.test(d.rule));
      lines.push(`| ${cell(r.label)} | \`${r.record}\` | ${deps.length ? deps.map((d) => `${d.child}.${d.col} : ${d.n} (${d.rule.split(" ")[0]} ${d.rule.split(" ")[1] || ""})`.trim()).join(" ; ") : "aucune"} | ${blocking ? "non : dépendances bloquantes" : deps.length ? "oui, avec effets sur les lignes liées" : "oui"} |`);
    }
    lines.push("");
  }
  fs.writeFileSync(path.join(DIR, "FUTURE_DELETION_REPORT.md"), lines.join("\n"));
  console.log(`Rapport de suppression future (lecture seule) : ${candidates.length} ligne(s) candidate(s), ${[...dependents.keys()].length} avec dépendances. Rien n'a été supprimé.`);
  for (const [k, n] of Object.entries(totals).sort((a, b) => b[1] - a[1]).slice(0, 12)) console.log(`  ${k} : ${n}`);
  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Rapport interrompu :", err.message);
  try {
    await sequelize.close();
  } catch (_e) {
    /* connexion déjà fermée */
  }
  process.exit(1);
});
