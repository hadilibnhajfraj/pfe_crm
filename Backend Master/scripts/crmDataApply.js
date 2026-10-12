"use strict";

// ÉCRITURE des corrections de données validées, lot par lot.
//
//   node scripts/crmDataApply.js --lot=A --run=<identifiant>
//   node scripts/crmDataApply.js --lot=B --run=<identifiant>
//
// Périmètre STRICT (aucune autre colonne n'est jamais écrite) :
//   lot A : project_actions.actionTypeId, projects.engineerId, projects.companyId
//   lot B : engineers.phone / email, architects.phone / email
//
// Source de vérité : reports/data-quality/dry-run-validated.json, le plan à
// blanc validé. Une valeur n'est écrite que si elle y figure ET que la base
// correspond toujours à ce plan au moment de l'écriture :
//   - la case cible est toujours vide ;
//   - la valeur source est toujours celle du plan ;
//   - pour le lot B, la valeur est toujours classée HIGH après recalcul.
// Sinon la ligne n'est PAS modifiée et est journalisée REVIEW_REQUIRED.
//
// Chaque lot s'exécute dans UNE transaction : toute erreur annule le lot
// entier. Chaque valeur écrite produit une ligne dans data_change_log.
// updatedAt n'est pas touché : seule la colonne citée change.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/db");
const { computeLots } = require("./crmDataPlan");

const OUT_DIR = path.join(__dirname, "..", "reports", "data-quality");
const EXECUTED_BY = "DATA_AGENT";
const SCOPE = {
  A: { project_actions: ["actionTypeId"], projects: ["engineerId", "companyId"] },
  B: { engineers: ["phone", "email"], architects: ["phone", "email"] },
};
// Lot A : colonne du libellé source et référentiel de la clé écrite.
const LOT_A = {
  "project_actions.actionTypeId": { sourceColumn: "typeAction_legacy", referential: "project_action_types" },
  "projects.engineerId": { sourceColumn: "ingenieurResponsable", referential: "engineers" },
  "projects.companyId": { sourceColumn: "entreprise", referential: "companies" },
};

const clean = (v) => String(v == null ? "" : v).trim().replace(/\s+/g, " ");
const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];

function assertScope(lot, change) {
  if (!(SCOPE[lot][change.table] || []).includes(change.column)) throw new Error(`hors périmètre : ${change.table}.${change.column}`);
}

async function log(transaction, batchId, change, operation, { oldValue, newValue, reason, confidence }) {
  await sequelize.query(
    `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
     VALUES (:batchId, :table, :record, :column, :oldValue, :newValue, CAST(:source AS jsonb), :reason, :confidence, :operation, :executedBy)`,
    {
      transaction,
      replacements: { batchId, table: change.table, record: change.record_id, column: change.column, oldValue: oldValue == null ? null : String(oldValue), newValue: newValue == null ? null : String(newValue), source: JSON.stringify(change.source), reason, confidence, operation, executedBy: EXECUTED_BY },
    }
  );
}

const select = (transaction, sql, replacements) => sequelize.query(sql, { transaction, replacements, type: "SELECT" });

// ── LOT A ───────────────────────────────────────────────────────────────────
async function checkLotA(transaction, change) {
  const { sourceColumn, referential } = LOT_A[`${change.table}.${change.column}`];
  const [row] = await select(transaction, `SELECT "${change.column}"::text AS current, "${sourceColumn}"::text AS source FROM "${change.table}" WHERE id = :id FOR UPDATE`, { id: change.record_id });
  if (!row) return "ligne introuvable";
  if (row.current != null) return `la case n'est plus vide (valeur actuelle : ${row.current})`;
  const expected = change.table === "projects" ? clean(change.source.value) : change.source.value;
  const actual = change.table === "projects" ? clean(row.source) : row.source;
  if (actual !== expected) return `le libellé source a changé (« ${row.source} » au lieu de « ${change.source.value} »)`;
  const [target] = await select(transaction, `SELECT name FROM "${referential}" WHERE id = :id`, { id: change.new_value });
  if (!target) return `la fiche cible n'existe plus dans ${referential}`;
  if (target.name !== change.new_value_label) return `la fiche cible a été renommée (« ${target.name} »)`;
  return null;
}

// ── LOT B ───────────────────────────────────────────────────────────────────
const keyOf = (c) => `${c.table}:${c.record_id}:${c.column}`;
const LOT_B = {
  engineers: { link: "engineerId", phone: "telephoneIngenieur", email: "emailIngenieur" },
  architects: { link: "architectId", phone: "telephoneArchitecte", email: "emailArchitecte" },
};

async function checkLotB(transaction, change, recomputed) {
  const fresh = recomputed.high.get(keyOf(change));
  if (!fresh) {
    const review = recomputed.review.get(keyOf(change));
    return review ? `n'est plus HIGH après recalcul : ${review.reason}` : "n'apparaît plus dans le recalcul (source disparue ou case déjà remplie)";
  }
  if (fresh.new_value !== change.new_value) return `la valeur candidate a changé (« ${fresh.new_value} » au lieu de « ${change.new_value} »)`;
  const [row] = await select(transaction, `SELECT "${change.column}" AS current, name FROM "${change.table}" WHERE id = :id FOR UPDATE`, { id: change.record_id });
  if (!row) return "fiche introuvable";
  if (clean(row.current)) return `la case n'est plus vide (valeur actuelle : ${row.current})`;
  if (row.name !== change.record_label) return `la fiche a été renommée (« ${row.name} »)`;
  // Les projets sources portent toujours la valeur et sont bien liés à la personne.
  const spec = LOT_B[change.table];
  for (const src of fresh.source.records) {
    const [p] = await select(transaction, `SELECT "${spec.link}"::text AS link, "${spec[change.column]}" AS value FROM projects WHERE id = :id`, { id: src.id });
    if (!p || p.link !== change.record_id) return `le projet source « ${src.name} » n'est pas lié à cette fiche`;
    if (clean(p.value) !== src.value) return `la valeur du projet source « ${src.name} » a changé`;
  }
  return null;
}

async function counts() {
  const [row] = await sequelize.query(
    `SELECT (SELECT COUNT(*)::int FROM project_actions WHERE "actionTypeId" IS NULL) AS "project_actions.actionTypeId",
            (SELECT COUNT(*)::int FROM projects WHERE "engineerId" IS NULL) AS "projects.engineerId",
            (SELECT COUNT(*)::int FROM projects WHERE "companyId" IS NULL) AS "projects.companyId",
            (SELECT COUNT(*)::int FROM engineers WHERE NULLIF(TRIM(phone), '') IS NULL) AS "engineers.phone",
            (SELECT COUNT(*)::int FROM engineers WHERE NULLIF(TRIM(email), '') IS NULL) AS "engineers.email",
            (SELECT COUNT(*)::int FROM architects WHERE NULLIF(TRIM(phone), '') IS NULL) AS "architects.phone",
            (SELECT COUNT(*)::int FROM architects WHERE NULLIF(TRIM(email), '') IS NULL) AS "architects.email"`,
    { type: "SELECT" }
  );
  return row;
}

async function main() {
  const lot = arg("lot");
  const run = arg("run");
  if (!SCOPE[lot] || !run) throw new Error("usage : --lot=A|B --run=<identifiant>");
  const batchId = `${run}-LOT${lot}`;
  const [{ n: already }] = await sequelize.query(`SELECT COUNT(*)::int AS n FROM data_change_log WHERE batch_id = :batchId`, { replacements: { batchId }, type: "SELECT" });
  if (already) throw new Error(`le lot ${batchId} a déjà été exécuté (${already} lignes journalisées)`);

  const validated = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "dry-run-validated.json"), "utf8"));
  const changes = lot === "A" ? validated.lotA.changes : validated.lotB.changes;
  const result = { batchId, lot, startedAt: new Date().toISOString(), expected: changes.length, expectedByColumn: {}, updated: 0, updatedByColumn: {}, reviewRequired: [], errors: [], before: await counts() };
  for (const c of changes) result.expectedByColumn[`${c.table}.${c.column}`] = (result.expectedByColumn[`${c.table}.${c.column}`] || 0) + 1;

  let recomputed = null;
  if (lot === "B") {
    // Recalcul complet sur l'état actuel de la base (après le lot A).
    const fresh = await computeLots();
    recomputed = { high: new Map(fresh.lotB.map((c) => [keyOf(c), c])), review: new Map(fresh.lotBReview.map((c) => [keyOf(c), c])) };
    const validatedKeys = new Set(changes.map(keyOf));
    result.recomputed = {
      high: fresh.lotB.length,
      reviewRequired: fresh.lotBReview.length,
      lotAStillPending: fresh.lotA.length,
      // HIGH au recalcul mais absent du plan validé : non autorisé, non écrit.
      newHighNotValidated: fresh.lotB.filter((c) => !validatedKeys.has(keyOf(c))).map((c) => ({ table: c.table, record_id: c.record_id, record_label: c.record_label, column: c.column })),
      reviewCases: fresh.lotBReview.map((c) => ({ table: c.table, record_id: c.record_id, record_label: c.record_label, column: c.column, value_found: c.value_found, projects_linked: c.projects_linked, reason: c.reason })),
    };
  }

  const transaction = await sequelize.transaction();
  try {
    for (const change of changes) {
      assertScope(lot, change);
      if (change.confidence !== "HIGH" || change.operation !== "UPDATE" || change.new_value == null) throw new Error(`entrée non autorisée dans le plan validé : ${keyOf(change)}`);
      const problem = lot === "A" ? await checkLotA(transaction, change) : await checkLotB(transaction, change, recomputed);
      if (problem) {
        await log(transaction, batchId, change, "REVIEW_REQUIRED", { oldValue: null, newValue: null, reason: `non modifié : ${problem}`, confidence: "MEDIUM" });
        result.reviewRequired.push({ table: change.table, record_id: change.record_id, record_label: change.record_label || null, column: change.column, reason: problem });
        continue;
      }
      const empty = lot === "A" ? `"${change.column}" IS NULL` : `NULLIF(TRIM("${change.column}"), '') IS NULL`;
      const written = await select(transaction, `UPDATE "${change.table}" SET "${change.column}" = :value WHERE id = :id AND ${empty} RETURNING id`, { value: change.new_value, id: change.record_id });
      if (written.length !== 1) throw new Error(`${keyOf(change)} : ${written.length} ligne(s) modifiée(s) au lieu de 1`);
      await log(transaction, batchId, change, "UPDATE", { oldValue: change.old_value, newValue: change.new_value, reason: change.reason, confidence: "HIGH" });
      result.updated += 1;
      result.updatedByColumn[`${change.table}.${change.column}`] = (result.updatedByColumn[`${change.table}.${change.column}`] || 0) + 1;
    }
    // Contrôle avant validation : autant de lignes journalisées que d'écritures.
    const [{ n }] = await select(transaction, `SELECT COUNT(*)::int AS n FROM data_change_log WHERE batch_id = :batchId AND operation = 'UPDATE'`, { batchId });
    if (n !== result.updated) throw new Error(`journal incohérent : ${n} lignes UPDATE pour ${result.updated} écritures`);
    await transaction.commit();
    result.committed = true;
  } catch (err) {
    await transaction.rollback();
    result.committed = false;
    result.updated = 0;
    result.updatedByColumn = {};
    result.reviewRequired = [];
    result.errors.push(err.message);
  }

  result.after = await counts();
  result.finishedAt = new Date().toISOString();
  fs.writeFileSync(path.join(OUT_DIR, `${batchId}.json`), JSON.stringify(result, null, 2));
  console.log(`${batchId} : ${result.committed ? "VALIDÉ (COMMIT)" : "ANNULÉ (ROLLBACK)"} — attendu ${result.expected}, écrit ${result.updated}, REVIEW_REQUIRED ${result.reviewRequired.length}, erreurs ${result.errors.length}`);
  if (result.errors.length) console.log(`Erreur : ${result.errors[0]}`);
  console.log(`Cases vides avant : ${JSON.stringify(result.before)}`);
  console.log(`Cases vides après : ${JSON.stringify(result.after)}`);
  await sequelize.close();
  if (!result.committed) process.exit(1);
}

main().catch(async (err) => {
  console.error("Exécution interrompue avant toute écriture :", err.message);
  try {
    await sequelize.close();
  } catch (_e) {
    /* connexion déjà fermée */
  }
  process.exit(1);
});
