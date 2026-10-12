"use strict";

// Statistiques des contacts commerciaux et de leurs relances, en LECTURE
// SEULE (PROBAR ASSISTANT — analytique CRM).
//
// Périmètre : `scope.userId` (fourni par le Tool) → uniquement les contacts
// créés par cet utilisateur — même règle que
// commercialContactKpi.service.js::listCommercialContacts (`createdBy`).
// Les relances suivent le périmètre de leur contact.
//
// Dimensions : liste fermée d'expressions SQL écrites ici ; les valeurs
// venant de la demande passent uniquement par `replacements`.

// Chargé à la première requête (et non à l'import) : les modules qui
// importent ce service sans l'appeler (tests des Tools, qui le simulent)
// n'ouvrent pas de connexion à la base.
const db = () => require("../../../db").sequelize;

const USER_LABEL = (alias, profile) =>
  `COALESCE(NULLIF(TRIM(${profile}.name), ''), NULLIF(TRIM(CONCAT_WS(' ', ${profile}.prenom, ${profile}.nom)), ''), ${alias}.email)`;

const CONTACT_DIMENSIONS = Object.freeze({
  // Commercial ASSIGNÉ au contact (celui qui le gère).
  commercial: {
    key: `cc."commercialId"::text`,
    label: USER_LABEL("u", "up"),
    present: `cc."commercialId" IS NOT NULL`,
    joins: `LEFT JOIN users u ON u.id = cc."commercialId" LEFT JOIN user_profiles up ON up."userId" = cc."commercialId"`,
  },
  status: { key: `cc.statut`, label: `cc.statut`, present: `cc.statut IS NOT NULL`, joins: "" },
  month: {
    key: `TO_CHAR(DATE_TRUNC('month', cc."createdAt"), 'YYYY-MM')`,
    label: `TO_CHAR(DATE_TRUNC('month', cc."createdAt"), 'YYYY-MM')`,
    present: `cc."createdAt" IS NOT NULL`,
    joins: "",
  },
});

const RELANCE_DIMENSIONS = Object.freeze({
  commercial: {
    key: `COALESCE(r."commercialId", r."createdBy")::text`,
    label: `COALESCE(NULLIF(TRIM(r."commercialName"), ''), ${USER_LABEL("u", "up")})`,
    present: `COALESCE(r."commercialId", r."createdBy") IS NOT NULL`,
    joins: `LEFT JOIN users u ON u.id = COALESCE(r."commercialId", r."createdBy") LEFT JOIN user_profiles up ON up."userId" = COALESCE(r."commercialId", r."createdBy")`,
  },
  status: { key: `r."statutRelance"`, label: `r."statutRelance"`, present: `r."statutRelance" IS NOT NULL`, joins: "" },
  month: {
    key: `TO_CHAR(DATE_TRUNC('month', r."createdAt"), 'YYYY-MM')`,
    label: `TO_CHAR(DATE_TRUNC('month', r."createdAt"), 'YYYY-MM')`,
    present: `r."createdAt" IS NOT NULL`,
    joins: "",
  },
});

const METRICS = Object.freeze(["contacts", "relances", "contacts_without_relance"]);
const GROUP_BY_VALUES = Object.freeze(["commercial", "status", "month"]);

function contactScope(scope, replacements, alias = "cc") {
  if (!scope || !scope.userId) return "TRUE";
  replacements.scopeUserId = scope.userId;
  return `${alias}."createdBy" = :scopeUserId`;
}

function period(query, column, replacements) {
  const clauses = [];
  if (query.from) {
    clauses.push(`${column} >= :fromDate`);
    replacements.fromDate = new Date(query.from);
  }
  if (query.to) {
    clauses.push(`${column} <= :toDate`);
    replacements.toDate = new Date(query.to);
  }
  return clauses.length ? clauses.join(" AND ") : "TRUE";
}

async function groupedCount({ from, dim, where, replacements, order, limit }) {
  const [totals] = await db().query(
    `SELECT COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE ${dim.present})::int AS "withDimension",
            COUNT(DISTINCT ${dim.key}) FILTER (WHERE ${dim.present})::int AS "groupCount"
       FROM ${from} ${dim.joins} WHERE ${where}`,
    { replacements, type: "SELECT" }
  );
  const groups = await db().query(
    `SELECT ${dim.key} AS key, MAX(${dim.label}) AS label, COUNT(*)::int AS count
       FROM ${from} ${dim.joins}
      WHERE ${where} AND ${dim.present}
      GROUP BY ${dim.key}
      ORDER BY count ${order}, label ASC
      LIMIT :limit`,
    { replacements: { ...replacements, limit }, type: "SELECT" }
  );
  return {
    total: totals.total,
    withDimension: totals.withDimension,
    withoutDimension: totals.total - totals.withDimension,
    groupCount: totals.groupCount,
    groups: groups.map((g) => ({ key: g.key, label: g.label, count: g.count })),
    truncated: totals.groupCount > groups.length,
  };
}

/**
 * @param {{ metric: "contacts"|"relances"|"contacts_without_relance", groupBy?: string|null,
 *           order?: "desc"|"asc", limit?: number, from?: string, to?: string }} query
 * @param {{ userId: string|null }} scope
 */
async function getCommercialContactStatistics(query = {}, scope = { userId: null }) {
  const metric = query.metric || "contacts";
  if (!METRICS.includes(metric)) throw { status: 400, message: `metric invalide : ${metric}` };
  const groupBy = query.groupBy || null;
  if (groupBy && !GROUP_BY_VALUES.includes(groupBy)) throw { status: 400, message: `groupBy invalide : ${groupBy}` };
  const order = query.order === "asc" ? "ASC" : "DESC";
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  const base = { metric, groupBy, scope: scope && scope.userId ? "mine" : "all", filters: { from: query.from || null, to: query.to || null } };

  if (metric === "contacts_without_relance") {
    const replacements = {};
    const where = `${contactScope(scope, replacements)} AND ${period(query, `cc."createdAt"`, replacements)}
      AND NOT EXISTS (SELECT 1 FROM commercial_contact_relances r WHERE r."commercialContactId" = cc.id)`;
    const [row] = await db().query(`SELECT COUNT(*)::int AS total FROM commercial_contacts cc WHERE ${where}`, { replacements, type: "SELECT" });
    const contacts = await db().query(
      `SELECT cc.id, cc.prenom, cc.nom, cc."nomSociete", cc.statut, cc."dateAppel"
         FROM commercial_contacts cc WHERE ${where}
        ORDER BY cc."createdAt" ASC LIMIT :limit`,
      { replacements: { ...replacements, limit }, type: "SELECT" }
    );
    return { ...base, total: row.total, groups: [], groupCount: 0, contacts, truncated: row.total > contacts.length };
  }

  if (metric === "contacts") {
    const replacements = {};
    const where = `${contactScope(scope, replacements)} AND ${period(query, `cc."createdAt"`, replacements)}`;
    if (!groupBy) {
      const [row] = await db().query(`SELECT COUNT(*)::int AS total FROM commercial_contacts cc WHERE ${where}`, { replacements, type: "SELECT" });
      return { ...base, total: row.total, groups: [], groupCount: 0, truncated: false };
    }
    return { ...base, ...(await groupedCount({ from: "commercial_contacts cc", dim: CONTACT_DIMENSIONS[groupBy], where, replacements, order, limit })) };
  }

  // Relances : créées (programmées) sur la période, dans le périmètre des contacts.
  const replacements = {};
  const where = `${contactScope(scope, replacements)} AND ${period(query, `r."createdAt"`, replacements)}`;
  const from = `commercial_contact_relances r JOIN commercial_contacts cc ON cc.id = r."commercialContactId"`;
  if (!groupBy) {
    const [row] = await db().query(`SELECT COUNT(*)::int AS total FROM ${from} WHERE ${where}`, { replacements, type: "SELECT" });
    return { ...base, total: row.total, groups: [], groupCount: 0, truncated: false };
  }
  return { ...base, ...(await groupedCount({ from, dim: RELANCE_DIMENSIONS[groupBy], where, replacements, order, limit })) };
}

module.exports = { getCommercialContactStatistics, METRICS, GROUP_BY_VALUES };
