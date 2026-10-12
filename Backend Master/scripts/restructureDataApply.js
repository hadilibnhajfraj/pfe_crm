"use strict";

// Données existantes à adapter à la nouvelle structure, étape par étape.
//
//   node scripts/restructureDataApply.js --step=<étape>            (simulation)
//   node scripts/restructureDataApply.js --step=<étape> --apply    (écriture)
//
// SANS --apply, le script ne fait que des SELECT dans une transaction READ
// ONLY et écrit ce qu'il ferait dans reports/data-quality/restructure-<étape>.json.
// Il fonctionne alors même si les migrations ne sont pas encore passées.
//
// Étapes (chacune dans UNE transaction, chaque écriture journalisée dans
// data_change_log, exécutée par DATA_AGENT) :
//
//   mark-test-data            après le lot 1. Pose dataStatus = TEST sur les
//                             lignes KEEP_TEST et REVIEW_REQUIRED sur les lignes
//                             REVIEW de test-data-review.json. Aucune autre
//                             colonne n'est touchée ; rien n'est supprimé.
//   link-maintenance-machines après le lot 5. Renseigne machineId des demandes
//                             dont l'équipement nomme une machine du référentiel
//                             (« PROMESH — Machine 1 »), avec la fonction déjà
//                             utilisée par l'application.
//   copy-documents            après le lot 7, SUR LE SERVEUR qui détient le
//                             vrai dossier uploads. Copie les références de
//                             fichiers dans documents / document_files. Les
//                             colonnes d'origine ne sont pas modifiées, aucun
//                             fichier n'est déplacé ni supprimé.
//
// Une ligne n'est écrite que si la base correspond toujours à ce qui est
// attendu (valeur d'origine inchangée) ; sinon elle est laissée et signalée.

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { sequelize } = require("../src/db");
const { parseMachineRef } = require("../src/utils/machineRef");

const ROOT = path.join(__dirname, "..");
const OUT_DIR = path.join(ROOT, "reports", "data-quality");
const EXECUTED_BY = "DATA_AGENT";
const DATA_STATUS_TABLES = ["por_promesh", "industrial_records", "recuperable_fiches", "maintenance_requests", "hr_requests", "archive_requests"];
const STATUS_BY_ACTION = { KEEP_TEST: "TEST", REVIEW: "REVIEW_REQUIRED" };

const arg = (name) => (process.argv.find((a) => a.startsWith(`--${name}=`)) || "").split("=")[1];
const APPLY = process.argv.includes("--apply");

async function log(q, batchId, entry) {
  await q(
    `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
     VALUES (:batchId, :table, :record, :column, :oldValue, :newValue, CAST(:source AS jsonb), :reason, :confidence, :operation, :executedBy)`,
    { batchId, executedBy: EXECUTED_BY, confidence: "HIGH", oldValue: null, ...entry, source: JSON.stringify(entry.source) }
  );
}

// ── Étape 1 : marquage des données de test ──────────────────────────────────
async function markTestData({ q, batchId, result }) {
  const review = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "test-data-review.json"), "utf8"));
  for (const row of review.rows) {
    const target = STATUS_BY_ACTION[row.action];
    if (!target) continue; // DELETE_AFTER_VALIDATION : aucune action ici
    const item = { table: row.table, record_id: row.record, label: row.label, column: "dataStatus", new_value: target, reason: row.reason };
    if (!DATA_STATUS_TABLES.includes(row.table)) {
      result.notApplicable.push({ ...item, why: "cette table n'a pas de colonne dataStatus dans la structure validée" });
      continue;
    }
    if (!APPLY) {
      result.planned.push(item);
      continue;
    }
    const [current] = await q(`SELECT "dataStatus"::text AS value FROM "${row.table}" WHERE id = :id FOR UPDATE`, { id: row.record });
    if (!current || current.value !== "REAL") {
      result.skipped.push({ ...item, why: current ? `dataStatus vaut déjà ${current.value}` : "ligne introuvable" });
      continue;
    }
    const written = await q(`UPDATE "${row.table}" SET "dataStatus" = :target WHERE id = :id AND "dataStatus" = 'REAL' RETURNING id`, { target, id: row.record });
    if (written.length !== 1) throw new Error(`${row.table} ${row.record} : ${written.length} ligne(s) modifiée(s) au lieu de 1`);
    await log(q, batchId, { table: row.table, record: row.record, column: "dataStatus", oldValue: "REAL", newValue: target, operation: "UPDATE", reason: row.reason, source: { type: "TEST_DATA_REVIEW", action: row.action, label: row.label } });
    result.written.push(item);
  }
}

// ── Étape 2 : demandes de maintenance → machine ─────────────────────────────
async function linkMaintenanceMachines({ q, batchId, result }) {
  const machines = await q(`SELECT id, code, "typeMachine"::text AS type, numero FROM machines`);
  const requests = await q(`SELECT id, "ticketNo", equipement FROM maintenance_requests ORDER BY "ticketNo"`);
  for (const r of requests) {
    const ref = parseMachineRef(r.equipement, null);
    const matches = ref ? machines.filter((m) => m.type === ref.typeMachine && m.numero === ref.numero) : [];
    const item = { table: "maintenance_requests", record_id: r.id, label: `ticket ${r.ticketNo}`, column: "machineId", equipement: r.equipement };
    if (matches.length !== 1) {
      result.skipped.push({ ...item, why: "l'équipement ne désigne pas une machine unique du référentiel : machineId reste vide" });
      continue;
    }
    item.new_value = matches[0].id;
    item.machine = matches[0].code;
    if (!APPLY) {
      result.planned.push(item);
      continue;
    }
    const [current] = await q(`SELECT "machineId"::text AS value, equipement FROM maintenance_requests WHERE id = :id FOR UPDATE`, { id: r.id });
    if (!current || current.value != null || current.equipement !== r.equipement) {
      result.skipped.push({ ...item, why: "la demande a changé depuis la lecture" });
      continue;
    }
    const written = await q(`UPDATE maintenance_requests SET "machineId" = :machineId WHERE id = :id AND "machineId" IS NULL RETURNING id`, { machineId: matches[0].id, id: r.id });
    if (written.length !== 1) throw new Error(`maintenance_requests ${r.id} : ${written.length} ligne(s) modifiée(s) au lieu de 1`);
    await log(q, batchId, { table: "maintenance_requests", record: r.id, column: "machineId", newValue: matches[0].id, operation: "UPDATE", reason: `équipement « ${r.equipement} » = machine ${matches[0].code}`, source: { type: "CRM_database", table: "maintenance_requests", record_id: r.id, column: "equipement", value: r.equipement } });
    result.written.push(item);
  }
}

// ── Étape 3 : références de fichiers → documents / document_files ───────────
function fileFacts(fileUrl) {
  const local = path.join(ROOT, decodeURI(String(fileUrl).replace(/^https?:\/\/[^/]+/, "")).replace(/^\//, ""));
  const extension = path.extname(local).toLowerCase().replace(".", "") || null;
  if (!fs.existsSync(local)) return { storageStatus: "MISSING", sizeBytes: null, checksum: null, extension };
  return { storageStatus: "PRESENT", sizeBytes: fs.statSync(local).size, checksum: crypto.createHash("sha256").update(fs.readFileSync(local)).digest("hex"), extension };
}

async function copyDocuments({ q, batchId, result }) {
  // Une requête par colonne d'origine, toutes avec les mêmes noms de colonnes.
  const source = (table, o) =>
    q(
      `SELECT '${table}' AS "sourceTable", '${o.column}' AS "sourceColumn", id::text AS "sourceRecordId", "${o.column}" AS "fileUrl", ${o.titre} AS titre,
              '${o.categorie}' AS categorie, '${o.ownerColumn}' AS "ownerColumn", ${o.owner}::text AS "ownerId", ${o.originalName || "NULL"} AS "originalName",
              ${o.mimeType || "NULL"} AS "mimeType", ${o.uploadedBy || "NULL"}::text AS "uploadedBy", "${o.date || "createdAt"}" AS "uploadedAt"
         FROM "${table}" WHERE NULLIF(TRIM("${o.column}"), '') IS NOT NULL ORDER BY "createdAt", id`
    );
  const sources = [
    ...(await source("project_devis", { column: "fileUrl", titre: `"nomDevis"`, categorie: "DEVIS", ownerColumn: "projectId", owner: `"projectId"`, originalName: `"originalName"`, mimeType: `"mimeType"` })),
    ...(await source("project_bon_de_commande", { column: "fileUrl", titre: `"nomBonDeCommande"`, categorie: "BON_DE_COMMANDE", ownerColumn: "projectId", owner: `"projectId"`, originalName: `"originalName"`, mimeType: `"mimeType"` })),
    ...(await source("project_actions", { column: "fileUrl", titre: `'Pièce jointe d''action'`, categorie: "PIECE_ACTION", ownerColumn: "projectId", owner: `"projectId"` })),
    ...(await source("por_promesh_attachments", { column: "fileUrl", titre: `"fileName"`, categorie: "PRODUCTION", ownerColumn: "porPromeshId", owner: `"porPromeshId"`, originalName: `"fileName"`, uploadedBy: `"uploadedBy"` })),
    ...(await source("por_promesh", { column: "photoNonConformite", titre: `'Photo de non-conformité'`, categorie: "PRODUCTION", ownerColumn: "porPromeshId", owner: "id", date: "updatedAt" })),
  ];
  const seen = new Set();
  for (const s of sources) {
    const item = { table: "document_files", sourceTable: s.sourceTable, sourceColumn: s.sourceColumn, sourceRecordId: s.sourceRecordId, fileUrl: s.fileUrl, titre: s.titre, categorie: s.categorie, [s.ownerColumn]: s.ownerId, ...fileFacts(s.fileUrl) };
    // FOUND / MISSING : constat fait SUR CE SERVEUR, à refaire sur le serveur de production.
    item.fileCheck = item.storageStatus === "PRESENT" ? "FOUND" : "MISSING";
    if (seen.has(s.fileUrl)) {
      result.skipped.push({ ...item, fileCheck: "DUPLICATE_REFERENCE", why: "même fichier déjà référencé par une autre colonne : une seule copie" });
      continue;
    }
    seen.add(s.fileUrl);
    // Seuls les fichiers réellement présents sont copiés : un fichier absent
    // ne reçoit aucune fiche et reste signalé MISSING dans le rapport.
    if (item.storageStatus !== "PRESENT") {
      result.skipped.push({ ...item, why: "fichier absent sur ce serveur : aucune fiche créée, référence d'origine conservée" });
      continue;
    }
    if (!APPLY) {
      result.planned.push(item);
      continue;
    }
    const [existing] = await q(`SELECT id, "storageStatus"::text AS status FROM document_files WHERE "fileUrl" = :fileUrl FOR UPDATE`, { fileUrl: s.fileUrl });
    if (existing) {
      // Un fichier noté absent n'est jamais considéré comme définitivement
      // migré : relancer l'étape là où il existe complète sa fiche.
      if (existing.status !== "PRESENT" && item.storageStatus === "PRESENT") {
        await q(`UPDATE document_files SET "storageStatus" = 'PRESENT', "sizeBytes" = :sizeBytes, checksum = :checksum, "updatedAt" = NOW() WHERE id = :id`, { sizeBytes: item.sizeBytes, checksum: item.checksum, id: existing.id });
        await log(q, batchId, { table: "document_files", record: existing.id, column: "storageStatus", oldValue: existing.status, newValue: "PRESENT", operation: "UPDATE", reason: "fichier retrouvé sur ce serveur", source: { type: "filesystem", fileUrl: s.fileUrl } });
        result.rechecked.push(item);
      } else {
        result.skipped.push({ ...item, why: existing.status === "PRESENT" ? "déjà copié" : "déjà copié, fichier toujours absent ici : à revérifier sur le serveur de production" });
      }
      continue;
    }
    const [doc] = await q(`INSERT INTO documents (titre, categorie, "${s.ownerColumn}", "createdBy") VALUES (:titre, :categorie, :ownerId, :uploadedBy) RETURNING id`, { titre: String(s.titre || "Document").slice(0, 255), categorie: s.categorie, ownerId: s.ownerId, uploadedBy: s.uploadedBy });
    const [file] = await q(
      `INSERT INTO document_files ("documentId", "fileUrl", "originalName", "mimeType", extension, "sizeBytes", checksum, "storageStatus", "sourceTable", "sourceColumn", "sourceRecordId", "uploadedBy", "uploadedAt")
       VALUES (:documentId, :fileUrl, :originalName, :mimeType, :extension, :sizeBytes, :checksum, :storageStatus, :sourceTable, :sourceColumn, :sourceRecordId, :uploadedBy, :uploadedAt) RETURNING id`,
      { documentId: doc.id, fileUrl: s.fileUrl, originalName: s.originalName, mimeType: s.mimeType, extension: item.extension, sizeBytes: item.sizeBytes, checksum: item.checksum, storageStatus: item.storageStatus, sourceTable: s.sourceTable, sourceColumn: s.sourceColumn, sourceRecordId: s.sourceRecordId, uploadedBy: s.uploadedBy, uploadedAt: s.uploadedAt }
    );
    const source = { type: "CRM_database", table: s.sourceTable, record_id: s.sourceRecordId, column: s.sourceColumn, value: s.fileUrl };
    await log(q, batchId, { table: "documents", record: doc.id, column: "titre", newValue: s.titre, operation: "INSERT", reason: "fiche descriptive d'une pièce jointe existante", source });
    await log(q, batchId, { table: "document_files", record: file.id, column: "fileUrl", newValue: s.fileUrl, operation: "INSERT", reason: `copie de la référence ${s.sourceTable}.${s.sourceColumn} ; fichier ${item.storageStatus === "PRESENT" ? "présent" : "absent"} sur ce serveur`, source });
    result.written.push(item);
  }
}

const STEPS = { "mark-test-data": markTestData, "link-maintenance-machines": linkMaintenanceMachines, "copy-documents": copyDocuments };

async function main() {
  const step = arg("step");
  if (!STEPS[step]) throw new Error(`usage : --step=${Object.keys(STEPS).join("|")} [--apply]`);
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\..+/, "").replace("T", "-");
  const batchId = `RS-${stamp}-${step}`;
  const result = { step, mode: APPLY ? "apply" : "dry-run", batchId: APPLY ? batchId : null, startedAt: new Date().toISOString(), planned: [], written: [], rechecked: [], skipped: [], notApplicable: [], errors: [] };

  // Garde-fou : en écriture, la base visée doit être nommée explicitement.
  const [[{ database }]] = await sequelize.query("SELECT current_database() AS database");
  result.database = database;
  if (APPLY && arg("database") !== database) throw new Error(`écriture refusée : ajoutez --database=${database} pour confirmer la base visée (reçu : ${arg("database") || "rien"})`);

  const transaction = await sequelize.transaction();
  if (!APPLY) await sequelize.query("SET TRANSACTION READ ONLY", { transaction });
  const q = async (sql, replacements) => {
    const [rows] = await sequelize.query(sql, { transaction, replacements });
    return rows;
  };
  try {
    await STEPS[step]({ q, batchId, result });
    if (APPLY) {
      const [{ n }] = await q(`SELECT COUNT(*)::int AS n FROM data_change_log WHERE batch_id = :batchId`, { batchId });
      const expected = step === "copy-documents" ? result.written.length * 2 + result.rechecked.length : result.written.length;
      if (n !== expected) throw new Error(`journal incohérent : ${n} ligne(s) pour ${expected} attendue(s)`);
      await transaction.commit();
      result.committed = true;
    } else {
      await transaction.rollback();
    }
  } catch (err) {
    await transaction.rollback();
    result.committed = false;
    result.errors.push(err.message);
    result.written = [];
  }

  if (step === "copy-documents") {
    result.fileCheck = {};
    for (const x of [...result.planned, ...result.written, ...result.rechecked, ...result.skipped]) result.fileCheck[x.fileCheck] = (result.fileCheck[x.fileCheck] || 0) + 1;
    console.log(`Fichiers : ${JSON.stringify(result.fileCheck)}`);
  }
  const file = path.join(OUT_DIR, `restructure-${step}${APPLY ? `-${stamp}` : ""}.json`);
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`Base : ${result.database}`);
  console.log(`${step} (${APPLY ? "ÉCRITURE" : "simulation, lecture seule"}) : prévu ${result.planned.length}, écrit ${result.written.length}, ignoré ${result.skipped.length}, hors périmètre ${result.notApplicable.length}, erreurs ${result.errors.length}`);
  if (result.errors.length) console.log(`Erreur (transaction annulée) : ${result.errors[0]}`);
  console.log(`Détail : ${path.relative(ROOT, file)}`);
  await sequelize.close();
  if (result.errors.length) process.exit(1);
}

main().catch(async (err) => {
  console.error("Interrompu avant toute écriture :", err.message);
  try {
    await sequelize.close();
  } catch (_e) {
    /* connexion déjà fermée */
  }
  process.exit(1);
});
