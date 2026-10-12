"use strict";

// Statistiques de projets en LECTURE SEULE (PROBAR ASSISTANT — analytique CRM).
//
// Un seul GROUP BY SQL par question : aucune pagination, aucun chargement de
// tous les projets en mémoire. Les dimensions sont une LISTE FERMÉE
// d'expressions SQL écrites ici ; rien de ce qui vient d'un message
// utilisateur n'est jamais concaténé à la requête (valeurs passées en
// `replacements`).
//
// Périmètre : `scope.ownerId` (fourni par le Tool, jamais par l'appelant)
// restreint aux projets de ce propriétaire — même règle que list_projects /
// project.repository.js (`mine` → ownerId = utilisateur).

// Chargé à la première requête (et non à l'import) : les modules qui
// importent ce service sans l'appeler (tests des Tools, qui le simulent)
// n'ouvrent pas de connexion à la base.
const db = () => require("../../../db").sequelize;

// Ingénieur : lien réel `engineerId` → engineers ; à défaut, le nom saisi
// (`ingenieurResponsable`) normalisé, pour ne pas perdre les projets dont le
// lien n'a pas encore été synchronisé (voir services/personSync.service.js).
const DIMENSIONS = Object.freeze({
  engineer: {
    key: `COALESCE(p."engineerId"::text, 'name:' || LOWER(TRIM(p."ingenieurResponsable")))`,
    label: `COALESCE(e.name, TRIM(p."ingenieurResponsable"))`,
    present: `(p."engineerId" IS NOT NULL OR COALESCE(TRIM(p."ingenieurResponsable"), '') <> '')`,
    joins: `LEFT JOIN engineers e ON e.id = p."engineerId"`,
  },
  owner: {
    key: `p."ownerId"::text`,
    label: `COALESCE(NULLIF(TRIM(up.name), ''), NULLIF(TRIM(CONCAT_WS(' ', up.prenom, up.nom)), ''), u.email)`,
    present: `p."ownerId" IS NOT NULL`,
    joins: `LEFT JOIN users u ON u.id = p."ownerId" LEFT JOIN user_profiles up ON up."userId" = p."ownerId"`,
  },
  status: {
    key: `TRIM(p.statut)`,
    label: `TRIM(p.statut)`,
    present: `COALESCE(TRIM(p.statut), '') <> ''`,
    joins: "",
  },
  client: {
    key: `p."companyId"::text`,
    label: `c.name`,
    present: `p."companyId" IS NOT NULL`,
    joins: `LEFT JOIN companies c ON c.id = p."companyId"`,
  },
  product_family: {
    key: `UPPER(TRIM(p."productFamily"::text))`,
    label: `UPPER(TRIM(p."productFamily"::text))`,
    present: `COALESCE(TRIM(p."productFamily"::text), '') <> ''`,
    joins: "",
  },
  month: {
    key: `TO_CHAR(DATE_TRUNC('month', p."createdAt"), 'YYYY-MM')`,
    label: `TO_CHAR(DATE_TRUNC('month', p."createdAt"), 'YYYY-MM')`,
    present: `p."createdAt" IS NOT NULL`,
    joins: "",
  },
});

const GROUP_BY_VALUES = Object.freeze(Object.keys(DIMENSIONS));

function buildWhere(filters, scope) {
  const clauses = ["TRUE"];
  const replacements = {};
  if (scope && scope.ownerId) {
    clauses.push(`p."ownerId" = :scopeOwnerId`);
    replacements.scopeOwnerId = scope.ownerId;
  }
  if (!filters.includeArchived) clauses.push(`COALESCE(p."isArchived", false) = false`);
  if (filters.productFamily) {
    clauses.push(`UPPER(TRIM(p."productFamily"::text)) = :productFamily`);
    replacements.productFamily = String(filters.productFamily).toUpperCase();
  }
  if (filters.statut) {
    clauses.push(`LOWER(TRIM(p.statut)) = LOWER(:statut)`);
    replacements.statut = filters.statut;
  }
  if (filters.from) {
    clauses.push(`p."createdAt" >= :fromDate`);
    replacements.fromDate = new Date(filters.from);
  }
  if (filters.to) {
    clauses.push(`p."createdAt" <= :toDate`);
    replacements.toDate = new Date(filters.to);
  }
  return { where: clauses.join(" AND "), replacements };
}

/**
 * @param {{ groupBy?: string|null, order?: "desc"|"asc", limit?: number,
 *           includeArchived?: boolean, productFamily?: string, statut?: string,
 *           from?: string, to?: string }} query
 * @param {{ ownerId: string|null }} scope
 */
async function getProjectStatistics(query = {}, scope = { ownerId: null }) {
  const groupBy = query.groupBy || null;
  if (groupBy && !DIMENSIONS[groupBy]) {
    throw { status: 400, message: `groupBy invalide : ${groupBy}` };
  }
  const order = query.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  const filters = { includeArchived: query.includeArchived !== false, productFamily: query.productFamily, statut: query.statut, from: query.from, to: query.to };
  const { where, replacements } = buildWhere(filters, scope);

  const base = {
    groupBy,
    scope: scope && scope.ownerId ? "mine" : "all",
    includeArchived: filters.includeArchived,
    filters: {
      productFamily: filters.productFamily || null,
      statut: filters.statut || null,
      from: filters.from || null,
      to: filters.to || null,
    },
  };

  if (!groupBy) {
    const [row] = await db().query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE COALESCE(p."isArchived", false) = true)::int AS archived
         FROM projects p WHERE ${where}`,
      { replacements, type: "SELECT" }
    );
    return { ...base, totalProjects: row.total, archivedProjects: row.archived, groups: [], groupCount: 0, withDimension: 0, withoutDimension: 0, truncated: false };
  }

  const dim = DIMENSIONS[groupBy];
  const [totals] = await db().query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${dim.present})::int AS "withDimension",
            COUNT(DISTINCT ${dim.key}) FILTER (WHERE ${dim.present})::int AS "groupCount"
       FROM projects p ${dim.joins} WHERE ${where}`,
    { replacements, type: "SELECT" }
  );
  const groups = await db().query(
    `SELECT ${dim.key} AS key, MAX(${dim.label}) AS label, COUNT(*)::int AS count
       FROM projects p ${dim.joins}
      WHERE ${where} AND ${dim.present}
      GROUP BY ${dim.key}
      ORDER BY count ${order}, label ASC
      LIMIT :limit`,
    { replacements: { ...replacements, limit }, type: "SELECT" }
  );

  const result = {
    ...base,
    totalProjects: totals.total,
    withDimension: totals.withDimension,
    withoutDimension: totals.total - totals.withDimension,
    groupCount: totals.groupCount,
    groups: groups.map((g) => ({ key: g.key, label: g.label, count: g.count })),
    truncated: totals.groupCount > groups.length,
  };

  // Ingénieurs référencés sans aucun projet : uniquement sur le périmètre
  // complet (admin) — pour un périmètre « mes projets », ce chiffre n'aurait
  // pas de sens.
  if (groupBy === "engineer" && !(scope && scope.ownerId)) {
    const [row] = await db().query(
      `SELECT COUNT(*)::int AS n FROM engineers e WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p."engineerId" = e.id AND ${where})`,
      { replacements, type: "SELECT" }
    );
    result.engineersWithoutProjects = row.n;
  }
  return result;
}

module.exports = { getProjectStatistics, GROUP_BY_VALUES };
