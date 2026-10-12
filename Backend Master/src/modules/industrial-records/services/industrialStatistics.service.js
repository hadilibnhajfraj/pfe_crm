"use strict";

// Statistiques des fiches industrielles en LECTURE SEULE (PROBAR ASSISTANT —
// analytique CRM).
//
// Périmètre : `scope.createdBy` (fourni par le Tool) → uniquement ses propres
// fiches — même règle que industrialRecord.service.js::listRecords
// (isOwnerScoped). Dimensions : liste fermée d'expressions SQL écrites ici.
//
// Machine : lien réel `machineId` → machines ; à défaut, le libellé saisi
// (`machine`). Si la colonne `machineId` n'existe pas encore (migration non
// appliquée), repli automatique sur le libellé saisi.

// Chargé à la première requête (et non à l'import) : les modules qui
// importent ce service sans l'appeler (tests des Tools, qui le simulent)
// n'ouvrent pas de connexion à la base.
const db = () => require("../../../db").sequelize;

const MODULES = Object.freeze(["probar", "melange", "maintenance"]);
const GROUP_BY_VALUES = Object.freeze(["machine", "module", "operator", "month", "status"]);

function dimensions(hasMachineId) {
  return {
    machine: hasMachineId
      ? {
          key: `COALESCE(ir."machineId"::text, 'name:' || LOWER(TRIM(ir.machine)))`,
          label: `COALESCE(NULLIF(TRIM(CONCAT_WS(' ', m.code, m.nom)), ''), TRIM(ir.machine))`,
          present: `(ir."machineId" IS NOT NULL OR COALESCE(TRIM(ir.machine), '') <> '')`,
          joins: `LEFT JOIN machines m ON m.id = ir."machineId"`,
        }
      : {
          key: `'name:' || LOWER(TRIM(ir.machine))`,
          label: `TRIM(ir.machine)`,
          present: `COALESCE(TRIM(ir.machine), '') <> ''`,
          joins: "",
        },
    module: { key: `ir.module`, label: `UPPER(ir.module)`, present: `ir.module IS NOT NULL`, joins: "" },
    operator: { key: `LOWER(TRIM(ir.operateur))`, label: `TRIM(ir.operateur)`, present: `COALESCE(TRIM(ir.operateur), '') <> ''`, joins: "" },
    month: {
      key: `TO_CHAR(DATE_TRUNC('month', COALESCE(ir."dateFiche", ir."createdAt")), 'YYYY-MM')`,
      label: `TO_CHAR(DATE_TRUNC('month', COALESCE(ir."dateFiche", ir."createdAt")), 'YYYY-MM')`,
      present: `TRUE`,
      joins: "",
    },
    status: { key: `ir.statut`, label: `ir.statut`, present: `ir.statut IS NOT NULL`, joins: "" },
  };
}

let machineIdColumnCache = null;
async function hasMachineIdColumn() {
  if (machineIdColumnCache !== null) return machineIdColumnCache;
  const rows = await db().query(
    `SELECT 1 FROM information_schema.columns WHERE table_name = 'industrial_records' AND column_name = 'machineId'`,
    { type: "SELECT" }
  );
  machineIdColumnCache = rows.length > 0;
  return machineIdColumnCache;
}

/**
 * @param {{ groupBy?: string|null, order?: "desc"|"asc", limit?: number, module?: string,
 *           from?: string, to?: string }} query
 * @param {{ createdBy: string|null }} scope
 */
async function getIndustrialStatistics(query = {}, scope = { createdBy: null }) {
  const groupBy = query.groupBy || null;
  if (groupBy && !GROUP_BY_VALUES.includes(groupBy)) throw { status: 400, message: `groupBy invalide : ${groupBy}` };
  if (query.module && !MODULES.includes(query.module)) throw { status: 400, message: `module invalide : ${query.module}` };
  const order = query.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);

  const replacements = {};
  const clauses = ["TRUE"];
  if (scope && scope.createdBy) {
    clauses.push(`ir."createdBy" = :scopeCreatedBy`);
    replacements.scopeCreatedBy = scope.createdBy;
  }
  if (query.module) {
    clauses.push(`ir.module = :module`);
    replacements.module = query.module;
  }
  if (query.from) {
    clauses.push(`COALESCE(ir."dateFiche", ir."createdAt") >= :fromDate`);
    replacements.fromDate = new Date(query.from);
  }
  if (query.to) {
    clauses.push(`COALESCE(ir."dateFiche", ir."createdAt") <= :toDate`);
    replacements.toDate = new Date(query.to);
  }
  const where = clauses.join(" AND ");
  const base = {
    groupBy,
    scope: scope && scope.createdBy ? "mine" : "all",
    filters: { module: query.module || null, from: query.from || null, to: query.to || null },
  };

  if (!groupBy) {
    const [row] = await db().query(
      `SELECT COUNT(*)::int AS total, COALESCE(SUM(ir."quantiteProduite"), 0)::float AS quantity FROM industrial_records ir WHERE ${where}`,
      { replacements, type: "SELECT" }
    );
    return { ...base, totalRecords: row.total, totalQuantity: row.quantity, groups: [], groupCount: 0, withDimension: 0, withoutDimension: 0, truncated: false };
  }

  const dim = dimensions(await hasMachineIdColumn())[groupBy];
  const [totals] = await db().query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${dim.present})::int AS "withDimension",
            COUNT(DISTINCT ${dim.key}) FILTER (WHERE ${dim.present})::int AS "groupCount"
       FROM industrial_records ir ${dim.joins} WHERE ${where}`,
    { replacements, type: "SELECT" }
  );
  const groups = await db().query(
    `SELECT ${dim.key} AS key, MAX(${dim.label}) AS label, COUNT(*)::int AS count,
            COALESCE(SUM(ir."quantiteProduite"), 0)::float AS quantity
       FROM industrial_records ir ${dim.joins}
      WHERE ${where} AND ${dim.present}
      GROUP BY ${dim.key}
      ORDER BY count ${order}, label ASC
      LIMIT :limit`,
    { replacements: { ...replacements, limit }, type: "SELECT" }
  );
  return {
    ...base,
    totalRecords: totals.total,
    withDimension: totals.withDimension,
    withoutDimension: totals.total - totals.withDimension,
    groupCount: totals.groupCount,
    groups: groups.map((g) => ({ key: g.key, label: g.label, count: g.count, quantity: g.quantity })),
    truncated: totals.groupCount > groups.length,
  };
}

module.exports = { getIndustrialStatistics, GROUP_BY_VALUES, MODULES, _resetMachineIdColumnCache: () => (machineIdColumnCache = null) };
