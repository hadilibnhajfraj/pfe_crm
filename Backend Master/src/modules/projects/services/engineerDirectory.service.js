"use strict";

// Annuaire des ingénieurs du CRM (PROBAR ASSISTANT), en LECTURE SEULE.
//
// - `listEngineers` : MÊME requête et MÊMES champs ({ id, name }) que
//   GET /engineers/all (controllers/engineer.controller.js::getAllEngineers,
//   inchangé) — noms nettoyés, noms vides exclus, tri alphabétique — plus le
//   total réel.
// - `findProjectEngineers` : ingénieur des projets dont le nom correspond,
//   dans le PÉRIMÈTRE fourni par le Tool (`scope.ownerId` → uniquement les
//   projets de ce propriétaire, même règle que list_projects).
//
// Aucune valeur de la demande n'est concaténée au SQL (replacements).

// Chargé à la première requête (et non à l'import) : les modules qui
// importent ce service sans l'appeler (tests des Tools) n'ouvrent pas de
// connexion à la base.
const db = () => require("../../../db").sequelize;

const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 1000;

function clampLimit(value, fallback = DEFAULT_LIMIT) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) return fallback;
  return Math.min(n, MAX_LIMIT);
}

/**
 * @param {{ search?: string, limit?: number }} query
 * @returns {Promise<{ items: {id, name}[], total: number, truncated: boolean }>}
 */
async function listEngineers(query = {}) {
  const limit = clampLimit(query.limit);
  const offset = Number.isInteger(Number(query.offset)) && Number(query.offset) > 0 ? Number(query.offset) : 0;
  const replacements = { limit, offset };
  let where = `name IS NOT NULL AND TRIM(name) <> ''`;
  if (query.search && String(query.search).trim()) {
    where += ` AND LOWER(TRIM(name)) LIKE :search`;
    replacements.search = `%${String(query.search).trim().toLowerCase()}%`;
  }
  const [{ total }] = await db().query(`SELECT COUNT(*)::int AS total FROM engineers WHERE ${where}`, { replacements, type: "SELECT" });
  const items = await db().query(
    `SELECT id, TRIM(name) AS name FROM engineers WHERE ${where} ORDER BY LOWER(TRIM(name)) ASC LIMIT :limit OFFSET :offset`,
    { replacements, type: "SELECT" }
  );
  // `truncated` : il reste des ingénieurs après cette page.
  return { items, total, offset, truncated: offset + items.length < total };
}

/**
 * @param {{ projectName: string, limit?: number }} query
 * @param {{ ownerId: string|null }} scope
 * @returns {Promise<{ projectName: string, scope: "mine"|"all", matches: {projectId, projectName, engineer: {id, name}|null}[] }>}
 */
async function findProjectEngineers(query = {}, scope = { ownerId: null }) {
  const projectName = String(query.projectName || "").trim();
  if (!projectName) throw { status: 400, message: "projectName requis" };
  const replacements = { projectName: `%${projectName.toLowerCase()}%`, limit: clampLimit(query.limit, 5) };
  let where = `LOWER(p."nomProjet") LIKE :projectName`;
  if (scope && scope.ownerId) {
    where += ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  const rows = await db().query(
    `SELECT p.id AS "projectId", p."nomProjet" AS "projectName", p."engineerId",
            COALESCE(TRIM(e.name), NULLIF(TRIM(p."ingenieurResponsable"), '')) AS "engineerName"
       FROM projects p LEFT JOIN engineers e ON e.id = p."engineerId"
      WHERE ${where}
      ORDER BY LOWER(p."nomProjet") ASC
      LIMIT :limit`,
    { replacements, type: "SELECT" }
  );
  return {
    projectName,
    scope: scope && scope.ownerId ? "mine" : "all",
    matches: rows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      engineer: r.engineerName ? { id: r.engineerId || null, name: r.engineerName } : null,
    })),
  };
}

module.exports = { listEngineers, findProjectEngineers, DEFAULT_LIMIT, MAX_LIMIT };
