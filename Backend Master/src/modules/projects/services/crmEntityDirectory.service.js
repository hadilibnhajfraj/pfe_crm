"use strict";

// Recherche d'UNE personne ou d'UNE société précise dans le CRM (PROBAR
// ASSISTANT) et lecture de TOUTES ses informations structurées, en LECTURE
// SEULE :
//   - ingénieurs          (table `engineers` + projets liés)
//   - architectes         (table `architects` + projets liés)
//   - contacts commerciaux (table `commercial_contacts` + actions, relances)
//   - sociétés            (table `companies` + projets liés)
//   - promoteur d'un projet (`projects.promoteur`)
//
// Le PÉRIMÈTRE est fourni par le Tool (jamais décidé ici) :
//   scope.ownerId        → projets de ce propriétaire uniquement (null : tous)
//   scope.contacts       → { mode: "all" | "createdBy" | "commercialId" | "none", userId }
//   scope.engineerCoordinates → "all" | "linked" (coordonnées d'un ingénieur
//                          visibles seulement s'il est lié à un projet du périmètre)
//
// Aucune valeur de la demande n'est concaténée au SQL (replacements) ; le
// rapprochement de noms (exact → normalisé → mots → approché) se fait en JS
// (utils/nameMatch.js). Un champ vide est renvoyé `null` — jamais inventé.

const { matchNames, normalizeName } = require("../../../utils/nameMatch");

// Chargé à la première requête : importer ce service n'ouvre pas de connexion.
const db = () => require("../../../db").sequelize;

const MAX_CANDIDATES = 5000;
const MAX_MATCHES = 8;
const PROJECT_LIMIT = 15;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const RANK = { exact: 0, normalized: 1, tokens: 2, fuzzy: 3 };

const DEFAULT_SCOPE = Object.freeze({ ownerId: null, contacts: { mode: "all", userId: null }, engineerCoordinates: "all" });

function cleanName(value) {
  const name = String(value || "").trim().replace(/\s+/g, " ");
  if (!name) throw { status: 400, message: "name requis" };
  return name.slice(0, 200);
}

function text(value) {
  const s = value == null ? "" : String(value).trim();
  return s || null;
}

function select(sql, replacements = {}) {
  return db().query(sql, { replacements, type: "SELECT" });
}

// ── Identifiant saisi à la place d'un nom (e-mail, téléphone, id) ──────────
function identifierOf(query) {
  const q = query.trim();
  if (UUID_RE.test(q)) return { kind: "id", value: q };
  if (EMAIL_RE.test(q)) return { kind: "email", value: q.toLowerCase() };
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 6 && /^[\d\s+().-]+$/.test(q)) return { kind: "phone", value: digits };
  return null;
}

// ── Projets liés (clé étrangère, ou à défaut libellé saisi sur le projet) ──
async function linkedProjects({ fk, textColumn }, entity, scope) {
  const replacements = { id: entity.id, name: entity.name.toLowerCase(), limit: PROJECT_LIMIT };
  const link = `(p."${fk}" = :id OR (p."${fk}" IS NULL AND LOWER(TRIM(p."${textColumn}")) = :name))`;
  let where = link;
  if (scope.ownerId) {
    where += ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  const [{ total }] = await select(`SELECT COUNT(*)::int AS total FROM projects p WHERE ${where}`, replacements);
  const items = await select(
    `SELECT p.id, p."nomProjet" AS name, p.statut, p."isArchived" AS archived, NULLIF(TRIM(p.entreprise), '') AS company
       FROM projects p WHERE ${where}
      ORDER BY p."createdAt" DESC LIMIT :limit`,
    replacements
  );
  // Périmètre restreint : combien de projets liés existent AU-DELÀ de ce que
  // l'utilisateur peut voir (un nombre, jamais leur contenu) — pour ne pas
  // afficher « 0 projet » quand la fiche en a, mais hors de son périmètre.
  let outOfScope = 0;
  let outOfScopeWithCompany = false;
  if (scope.ownerId) {
    const [all] = await select(
      `SELECT COUNT(*)::int AS total, COUNT(NULLIF(TRIM(p.entreprise), ''))::int AS "withCompany" FROM projects p WHERE ${link}`,
      { id: replacements.id, name: replacements.name }
    );
    outOfScope = Math.max(0, all.total - total);
    outOfScopeWithCompany = all.withCompany > items.filter((p) => p.company).length && outOfScope > 0;
  }
  return { total, items, truncated: total > items.length, outOfScope, outOfScopeWithCompany };
}

// Valeurs distinctes d'une colonne texte des projets liés, dans le périmètre.
async function linkedProjectValues({ fk, textColumn }, entity, scope, column) {
  const replacements = { id: entity.id, name: entity.name.toLowerCase() };
  let where = `(p."${fk}" = :id OR (p."${fk}" IS NULL AND LOWER(TRIM(p."${textColumn}")) = :name)) AND NULLIF(TRIM(p."${column}"), '') IS NOT NULL`;
  if (scope.ownerId) {
    where += ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  const rows = await select(`SELECT MIN(TRIM(p."${column}")) AS value FROM projects p WHERE ${where} GROUP BY LOWER(TRIM(p."${column}")) ORDER BY 1 LIMIT 10`, replacements);
  return rows.map((r) => r.value);
}

// ── Ingénieurs ─────────────────────────────────────────────────────────────
const ENGINEER_LINK = { fk: "engineerId", textColumn: "ingenieurResponsable" };

async function engineerCandidates(name) {
  const id = identifierOf(name);
  if (id && id.kind === "id") return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM engineers WHERE id = :v`, { v: id.value }) };
  if (id && id.kind === "email") return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM engineers WHERE LOWER(TRIM(email)) = :v`, { v: id.value }) };
  if (id && id.kind === "phone") {
    return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM engineers WHERE REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') LIKE :v`, { v: `%${id.value}` }) };
  }
  const all = await select(`SELECT id, TRIM(name) AS name FROM engineers WHERE name IS NOT NULL AND TRIM(name) <> '' ORDER BY LOWER(TRIM(name)) LIMIT :limit`, { limit: MAX_CANDIDATES });
  const { matchType, matches } = matchNames(name, all);
  return { matchType, rows: matches };
}

async function projectCoordinates(engineer, scope) {
  const replacements = { id: engineer.id, name: engineer.name.toLowerCase() };
  let where = `(p."engineerId" = :id OR (p."engineerId" IS NULL AND LOWER(TRIM(p."ingenieurResponsable")) = :name))`;
  if (scope.ownerId) {
    where += ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  const latest = (column) =>
    select(`SELECT TRIM(p."${column}") AS value FROM projects p WHERE ${where} AND NULLIF(TRIM(p."${column}"), '') IS NOT NULL ORDER BY p."updatedAt" DESC LIMIT 1`, replacements);
  const [[phone], [email]] = await Promise.all([latest("telephoneIngenieur"), latest("emailIngenieur")]);
  return { phone: phone ? phone.value : null, email: email ? email.value : null };
}

async function engineerDetails(row, scope) {
  const [e] = await select(`SELECT id, TRIM(name) AS name, phone, email, "createdAt", "updatedAt" FROM engineers WHERE id = :id`, { id: row.id });
  const projects = await linkedProjects(ENGINEER_LINK, { id: e.id, name: e.name }, scope);
  // Coordonnées : visibles par un administrateur, ou par un utilisateur dont
  // un projet (dans son périmètre) est suivi par cet ingénieur — il les voit
  // déjà sur la fiche de ce projet.
  const canSeeCoordinates = scope.engineerCoordinates === "all" || projects.total > 0;
  // La fiche ingénieur est souvent vide : ses coordonnées sont alors celles
  // saisies sur ses projets (telephoneIngenieur / emailIngenieur), lues dans
  // le périmètre de l'utilisateur — la plus récente renseignée.
  const onProjects = canSeeCoordinates ? await projectCoordinates(e, scope) : {};
  const company = [...new Set(projects.items.map((p) => p.company).filter(Boolean))].join(", ") || null;
  // Bureau d'études saisi sur ses projets (`projects.bureauEtude`) : la table
  // des ingénieurs n'a pas de colonne « société ».
  const designOffice = (await linkedProjectValues(ENGINEER_LINK, { id: e.id, name: e.name }, scope, "bureauEtude")).join(", ") || null;
  const restricted = canSeeCoordinates ? [] : ["phone", "email"];
  // Aucune société visible, mais des projets hors périmètre en portent une.
  if (!company && projects.outOfScopeWithCompany) restricted.push("company");
  return {
    entityType: "engineer",
    id: e.id,
    name: e.name,
    fields: {
      fullName: e.name,
      contactType: "engineer",
      phone: canSeeCoordinates ? text(e.phone) || onProjects.phone || null : null,
      email: canSeeCoordinates ? text(e.email) || onProjects.email || null : null,
      company,
      designOffice,
      createdAt: e.createdAt || null,
      updatedAt: e.updatedAt || null,
    },
    restricted,
    projects,
    activity: null,
  };
}

// ── Architectes ────────────────────────────────────────────────────────────
// Même structure que les ingénieurs : table `architects` (nom, téléphone,
// e-mail), projets par `projects.architectId`, à défaut le libellé
// `projects.architecte` ; coordonnées de repli saisies sur ses projets.
const ARCHITECT_LINK = { fk: "architectId", textColumn: "architecte" };

async function architectCandidates(name) {
  const id = identifierOf(name);
  if (id && id.kind === "id") return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM architects WHERE id = :v`, { v: id.value }) };
  if (id && id.kind === "email") return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM architects WHERE LOWER(TRIM(email)) = :v`, { v: id.value }) };
  if (id && id.kind === "phone") {
    return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM architects WHERE REGEXP_REPLACE(COALESCE(phone, ''), '\\D', '', 'g') LIKE :v`, { v: `%${id.value}` }) };
  }
  const all = await select(`SELECT id, TRIM(name) AS name FROM architects WHERE name IS NOT NULL AND TRIM(name) <> '' ORDER BY LOWER(TRIM(name)) LIMIT :limit`, { limit: MAX_CANDIDATES });
  const { matchType, matches } = matchNames(name, all);
  return { matchType, rows: matches };
}

async function architectDetails(row, scope) {
  const [a] = await select(`SELECT id, TRIM(name) AS name, phone, email, "createdAt", "updatedAt" FROM architects WHERE id = :id`, { id: row.id });
  const entity = { id: a.id, name: a.name };
  const projects = await linkedProjects(ARCHITECT_LINK, entity, scope);
  const canSeeCoordinates = scope.engineerCoordinates === "all" || projects.total > 0;
  let onProjects = {};
  if (canSeeCoordinates) {
    const [[phone], [email]] = await Promise.all([linkedProjectValues(ARCHITECT_LINK, entity, scope, "telephoneArchitecte"), linkedProjectValues(ARCHITECT_LINK, entity, scope, "emailArchitecte")].map((p) => p.then((v) => [v[0] || null])));
    onProjects = { phone, email };
  }
  const company = [...new Set(projects.items.map((p) => p.company).filter(Boolean))].join(", ") || null;
  const restricted = canSeeCoordinates ? [] : ["phone", "email"];
  if (!company && projects.outOfScopeWithCompany) restricted.push("company");
  return {
    entityType: "architect",
    id: a.id,
    name: a.name,
    fields: {
      fullName: a.name,
      contactType: "architect",
      phone: canSeeCoordinates ? text(a.phone) || onProjects.phone || null : null,
      email: canSeeCoordinates ? text(a.email) || onProjects.email || null : null,
      company,
      createdAt: a.createdAt || null,
      updatedAt: a.updatedAt || null,
    },
    restricted,
    projects,
    activity: null,
  };
}

// ── Contacts commerciaux ───────────────────────────────────────────────────
function contactScope(scope, alias = "c") {
  const { mode, userId } = scope.contacts || { mode: "none" };
  if (mode === "all") return { where: "TRUE", replacements: {} };
  if (mode === "createdBy") return { where: `${alias}."createdBy" = :contactUserId`, replacements: { contactUserId: userId } };
  if (mode === "commercialId") return { where: `${alias}."commercialId" = :contactUserId`, replacements: { contactUserId: userId } };
  return null;
}

const CONTACT_NAME = `TRIM(COALESCE(c.prenom, '') || ' ' || COALESCE(c.nom, ''))`;

async function contactCandidates(name, scope) {
  const scoped = contactScope(scope);
  if (!scoped) return { matchType: null, rows: [] };
  const base = `SELECT c.id, ${CONTACT_NAME} AS name, NULLIF(TRIM(c."nomSociete"), '') AS company FROM commercial_contacts c WHERE ${scoped.where}`;
  const id = identifierOf(name);
  if (id && id.kind === "id") return { matchType: "exact", rows: await select(`${base} AND c.id = :v`, { ...scoped.replacements, v: id.value }) };
  if (id && id.kind === "email") return { matchType: "exact", rows: await select(`${base} AND LOWER(TRIM(c.email)) = :v`, { ...scoped.replacements, v: id.value }) };
  if (id && id.kind === "phone") {
    return { matchType: "exact", rows: await select(`${base} AND REGEXP_REPLACE(COALESCE(c.telephone, ''), '\\D', '', 'g') LIKE :v`, { ...scoped.replacements, v: `%${id.value}` }) };
  }
  const all = await select(`${base} ORDER BY c."createdAt" DESC LIMIT :limit`, { ...scoped.replacements, limit: MAX_CANDIDATES });
  const byName = matchNames(name, all.filter((r) => r.name));
  if (byName.matches.length) return { matchType: byName.matchType, rows: byName.matches };
  // À défaut de personne à ce nom : les contacts de la société ainsi nommée.
  const byCompany = matchNames(name, all.filter((r) => r.company).map((r) => ({ ...r, name: r.company, personName: r.name })));
  return { matchType: byCompany.matchType, rows: byCompany.matches.map((r) => ({ id: r.id, name: r.personName || r.company, company: r.company })) };
}

async function contactDetails(row, scope) {
  const scoped = contactScope(scope);
  const [c] = await select(
    `SELECT c.id, c.nom, c.prenom, ${CONTACT_NAME} AS name, c."typeClient", c."nomSociete", c.telephone, c.email, c.localisation,
            c."matriculeFiscale", c.statut, c."pipelineStage", c."nbAppels", c."dateAppel", c."sujetDiscussion", c.message,
            c.user_nom, c.user_nom_custom, c."createdAt", c."updatedAt",
            COALESCE(NULLIF(TRIM(up.name), ''), u.email) AS "assignedCommercial"
       FROM commercial_contacts c
       LEFT JOIN users u ON u.id = c."commercialId"
       LEFT JOIN user_profiles up ON up."userId" = u.id
      WHERE c.id = :id AND ${scoped.where}`,
    { ...scoped.replacements, id: row.id }
  );
  if (!c) return null;
  const [actions] = await select(
    `SELECT COUNT(*)::int AS total,
            (SELECT a2."typeAction" FROM commercial_contact_actions a2 WHERE a2."commercialContactId" = :id ORDER BY a2."dateAction" DESC NULLS LAST LIMIT 1) AS "lastType",
            MAX(a."dateAction") AS "lastDate"
       FROM commercial_contact_actions a WHERE a."commercialContactId" = :id`,
    { id: c.id }
  );
  const [relances] = await select(
    `SELECT COUNT(*)::int AS total, MAX(r."dateRelance") AS "lastDate",
            (SELECT r2."statutRelance" FROM commercial_contact_relances r2 WHERE r2."commercialContactId" = :id ORDER BY r2."dateRelance" DESC NULLS LAST LIMIT 1) AS "lastStatus"
       FROM commercial_contact_relances r WHERE r."commercialContactId" = :id`,
    { id: c.id }
  );
  return {
    entityType: "contact",
    id: c.id,
    name: c.name || text(c.nomSociete) || "—",
    fields: {
      firstName: text(c.prenom),
      lastName: text(c.nom),
      fullName: c.name || null,
      contactType: text(c.typeClient),
      phone: text(c.telephone),
      email: text(c.email),
      address: text(c.localisation),
      company: text(c.nomSociete),
      taxId: text(c.matriculeFiscale),
      status: text(c.statut),
      pipelineStage: text(c.pipelineStage),
      assignedCommercial: text(c.assignedCommercial) || text(c.user_nom_custom) || text(c.user_nom),
      topic: text(c.sujetDiscussion),
      notes: text(c.message),
      createdAt: c.createdAt || null,
      updatedAt: c.updatedAt || null,
    },
    restricted: [],
    projects: null,
    activity: {
      calls: Number.isInteger(c.nbAppels) ? c.nbAppels : null,
      lastCall: c.dateAppel || null,
      actions: actions ? actions.total : 0,
      lastAction: actions && actions.lastDate ? { type: text(actions.lastType), date: actions.lastDate } : null,
      relances: relances ? relances.total : 0,
      lastRelance: relances && relances.lastDate ? { date: relances.lastDate, status: text(relances.lastStatus) } : null,
    },
  };
}

// ── Sociétés ───────────────────────────────────────────────────────────────
const COMPANY_LINK = { fk: "companyId", textColumn: "entreprise" };

async function companyCandidates(name) {
  const id = identifierOf(name);
  if (id && id.kind === "id") return { matchType: "exact", rows: await select(`SELECT id, TRIM(name) AS name FROM companies WHERE id = :v`, { v: id.value }) };
  if (id) return { matchType: null, rows: [] };
  const all = await select(`SELECT id, TRIM(name) AS name FROM companies WHERE name IS NOT NULL AND TRIM(name) <> '' ORDER BY LOWER(TRIM(name)) LIMIT :limit`, { limit: MAX_CANDIDATES });
  const { matchType, matches } = matchNames(name, all);
  return { matchType, rows: matches };
}

async function companyDetails(row, scope) {
  const [c] = await select(`SELECT id, TRIM(name) AS name, "createdAt", "updatedAt" FROM companies WHERE id = :id`, { id: row.id });
  // Ingénieurs des projets de cette société (clé `engineerId`, à défaut le
  // libellé saisi sur le projet), dans le périmètre de l'utilisateur.
  const engReplacements = { id: c.id, name: c.name.toLowerCase() };
  let engWhere = `(p."companyId" = :id OR (p."companyId" IS NULL AND LOWER(TRIM(p.entreprise)) = :name))`;
  if (scope.ownerId) {
    engWhere += ` AND p."ownerId" = :scopeOwnerId`;
    engReplacements.scopeOwnerId = scope.ownerId;
  }
  const engineers = await select(
    `SELECT MIN(COALESCE(TRIM(e.name), TRIM(p."ingenieurResponsable"))) AS name
       FROM projects p LEFT JOIN engineers e ON e.id = p."engineerId"
      WHERE ${engWhere} AND COALESCE(NULLIF(TRIM(e.name), ''), NULLIF(TRIM(p."ingenieurResponsable"), '')) IS NOT NULL
      GROUP BY LOWER(COALESCE(TRIM(e.name), TRIM(p."ingenieurResponsable"))) ORDER BY 1 LIMIT 15`,
    engReplacements
  );
  return {
    entityType: "company",
    id: c.id,
    name: c.name,
    fields: { fullName: c.name, contactType: "company", engineers: engineers.map((r) => r.name).join(", ") || null, createdAt: c.createdAt || null, updatedAt: c.updatedAt || null },
    restricted: [],
    projects: await linkedProjects(COMPANY_LINK, { id: c.id, name: c.name }, scope),
    activity: null,
  };
}

const FINDERS = {
  engineer: { candidates: (name) => engineerCandidates(name), details: engineerDetails },
  architect: { candidates: (name) => architectCandidates(name), details: architectDetails },
  contact: { candidates: (name, scope) => contactCandidates(name, scope), details: contactDetails },
  company: { candidates: (name) => companyCandidates(name), details: companyDetails },
};

/**
 * @param {"engineer"|"contact"|"company"} entityType
 * @param {{ name: string, includeDetails?: boolean }} query
 * @param {object} scope voir l'en-tête
 * @returns {Promise<{ entityType, name, matchType, matches: object[], truncated: boolean }>}
 *   Un résultat unique porte sa fiche complète (fields, projects, activity) ;
 *   plusieurs résultats ne portent que de quoi choisir (id, name, company).
 */
async function findEntity(entityType, query = {}, scope = DEFAULT_SCOPE) {
  const finder = FINDERS[entityType];
  if (!finder) throw { status: 400, message: `entityType invalide : ${entityType}` };
  const name = cleanName(query.name);
  const effectiveScope = { ...DEFAULT_SCOPE, ...scope };
  const { matchType, rows } = await finder.candidates(name, effectiveScope);
  const kept = rows.slice(0, MAX_MATCHES);

  let matches;
  if (kept.length === 1 && query.includeDetails !== false) {
    const details = await finder.details(kept[0], effectiveScope);
    matches = details ? [{ ...details, matchType }] : [];
  } else {
    matches = kept.map((r) => ({ entityType, id: r.id, name: r.name, company: r.company || null, matchType }));
  }
  return { entityType, name, matchType: matches.length ? matchType : null, matches, truncated: rows.length > kept.length };
}

/**
 * Nom sans type connu (« infos liées à X », « Qui est X ? ») : ingénieurs,
 * contacts commerciaux et sociétés ; le palier de rapprochement le plus sûr
 * l'emporte, et tous les résultats de ce palier sont renvoyés.
 */
async function findAnyEntity(query = {}, scope = DEFAULT_SCOPE) {
  const name = cleanName(query.name);
  const all = await Promise.all(Object.keys(FINDERS).map((type) => findEntity(type, { name, includeDetails: false }, scope)));
  const found = all.filter((r) => r.matches.length);
  if (!found.length) return { entityType: null, name, matchType: null, matches: [], truncated: false };
  const best = Math.min(...found.map((r) => RANK[r.matchType]));
  const kept = found.filter((r) => RANK[r.matchType] === best);
  const matches = kept.flatMap((r) => r.matches);
  if (matches.length === 1 && query.includeDetails !== false) {
    return findEntity(matches[0].entityType, { name: matches[0].id }, scope).then((r) => ({ ...r, name, matchType: kept[0].matchType, matches: r.matches.map((m) => ({ ...m, matchType: kept[0].matchType })) }));
  }
  return { entityType: kept.length === 1 ? kept[0].entityType : null, name, matchType: kept[0].matchType, matches, truncated: kept.some((r) => r.truncated) };
}

/**
 * Promoteur renseigné sur le(s) projet(s) désigné(s) par leur nom ou leur id,
 * dans le périmètre de l'utilisateur.
 * @param {{ projectName?: string, projectId?: string }} query
 */
async function findProjectPromoter(query = {}, scope = DEFAULT_SCOPE) {
  const replacements = { limit: 5 };
  let where;
  if (query.projectId) {
    where = `p.id = :projectId`;
    replacements.projectId = String(query.projectId);
  } else {
    where = `LOWER(p."nomProjet") LIKE :projectName`;
    replacements.projectName = `%${cleanName(query.projectName).toLowerCase()}%`;
  }
  if (scope && scope.ownerId) {
    where += ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  const rows = await select(
    `SELECT p.id AS "projectId", p."nomProjet" AS "projectName", NULLIF(TRIM(p.promoteur), '') AS promoteur
       FROM projects p WHERE ${where}
      ORDER BY LOWER(p."nomProjet") ASC LIMIT :limit`,
    replacements
  );
  return {
    scope: scope && scope.ownerId ? "mine" : "all",
    matches: rows.map((r) => ({ projectId: r.projectId, projectName: r.projectName, promoter: r.promoteur || null })),
  };
}

// ── Promoteurs ─────────────────────────────────────────────────────────────
// Il n'existe pas de table « promoteurs » : le promoteur est un champ texte
// du projet (`projects.promoteur`). La liste est donc l'ensemble des valeurs
// DISTINCTES de ce champ (casse et espaces ignorés), dans le périmètre de
// l'utilisateur, avec le nombre de projets de chacun.
function promoterScope(scope) {
  const replacements = {};
  // Valeurs de remplissage saisies à la place d'un nom (« None », « - »,
  // « néant »…) : ce ne sont pas des promoteurs.
  let where = `NULLIF(TRIM(p.promoteur), '') IS NOT NULL AND LOWER(TRIM(p.promoteur)) NOT IN ('none', 'null', 'n/a', 'na', '-', '--', '.', 'x', 'aucun', 'neant', 'néant', 'inconnu')`;
  if (scope && scope.ownerId) {
    where += ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  return { where, replacements };
}

const PROMOTER_KEY = `LOWER(REGEXP_REPLACE(TRIM(p.promoteur), '\\s+', ' ', 'g'))`;

/**
 * @param {{ limit?: number, offset?: number }} query
 * @returns {Promise<{ items: {name, projects}[], total: number, offset: number, truncated: boolean, scope: "mine"|"all" }>}
 */
async function listPromoters(query = {}, scope = DEFAULT_SCOPE) {
  const limit = Math.max(1, Math.min(200, parseInt(query.limit, 10) || 20));
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const { where, replacements } = promoterScope(scope);
  const [{ total }] = await select(`SELECT COUNT(DISTINCT ${PROMOTER_KEY})::int AS total FROM projects p WHERE ${where}`, replacements);
  const items = await select(
    `SELECT MIN(TRIM(p.promoteur)) AS name, COUNT(*)::int AS projects
       FROM projects p WHERE ${where}
      GROUP BY ${PROMOTER_KEY}
      ORDER BY ${PROMOTER_KEY} ASC
      LIMIT :limit OFFSET :offset`,
    { ...replacements, limit, offset }
  );
  return { items, total, offset, truncated: offset + items.length < total, scope: scope && scope.ownerId ? "mine" : "all" };
}

/**
 * Projets d'un promoteur désigné par son nom (exact → normalisé → mots →
 * approché). Plusieurs promoteurs possibles : renvoyés sans projets, pour
 * que l'appelant demande lequel.
 */
async function findPromoterProjects(query = {}, scope = DEFAULT_SCOPE) {
  const name = cleanName(query.name);
  const { where, replacements } = promoterScope(scope);
  const promoters = await select(`SELECT MIN(TRIM(p.promoteur)) AS name FROM projects p WHERE ${where} GROUP BY ${PROMOTER_KEY} LIMIT :limit`, { ...replacements, limit: MAX_CANDIDATES });
  const { matchType, matches } = matchNames(name, promoters);
  const base = { name, matchType, scope: scope && scope.ownerId ? "mine" : "all" };
  if (matches.length !== 1) return { ...base, matches: matches.slice(0, MAX_MATCHES).map((m) => ({ name: m.name })) };
  const [promoter] = matches;
  const projects = await select(
    `SELECT p.id, p."nomProjet" AS name, p.statut, p."isArchived" AS archived
       FROM projects p
      WHERE ${where} AND ${PROMOTER_KEY} = LOWER(REGEXP_REPLACE(TRIM(:promoter), '\\s+', ' ', 'g'))
      ORDER BY p."createdAt" DESC LIMIT :limit`,
    { ...replacements, promoter: promoter.name, limit: 50 }
  );
  return { ...base, matches: [{ name: promoter.name, projects: { total: projects.length, items: projects } }] };
}

/**
 * Sociétés référencées (table `companies`), paginées — mêmes champs et même
 * ouverture que GET /companies/all (tout utilisateur connecté).
 *
 * Lien société → projets : `projects.companyId` ; à défaut (colonne vide) le
 * libellé `projects.entreprise` égal au nom de la société. Les projets lus
 * sont TOUJOURS ceux du périmètre de l'utilisateur (`scope.ownerId`).
 *
 * @param {{ limit?: number, offset?: number,
 *           view?: "names"|"projects",                       projets de chaque société
 *           filter?: "with_projects"|"without_projects" }} query
 * @returns {Promise<{ items, total, totalAll, offset, truncated, scope, view, filter, projectsLoaded }>}
 *   `projectsLoaded` : false si la lecture des projets a échoué — les sociétés
 *   sont alors renvoyées seules, sans rien affirmer sur leurs projets.
 */
const COMPANY_PROJECT_LINK = `(p."companyId" = c.id OR (p."companyId" IS NULL AND LOWER(TRIM(p.entreprise)) = LOWER(TRIM(c.name))))`;
const COMPANY_PROJECTS_SHOWN = 8;

async function listCompanies(query = {}, scope = DEFAULT_SCOPE) {
  const limit = Math.max(1, Math.min(200, parseInt(query.limit, 10) || 20));
  const offset = Math.max(0, parseInt(query.offset, 10) || 0);
  const view = query.view === "projects" ? "projects" : "names";
  const filter = query.filter === "with_projects" || query.filter === "without_projects" ? query.filter : null;
  const scoped = Boolean(scope && scope.ownerId);
  const replacements = { limit, offset };
  let projectScope = "";
  if (scoped) {
    projectScope = ` AND p."ownerId" = :scopeOwnerId`;
    replacements.scopeOwnerId = scope.ownerId;
  }
  const named = `c.name IS NOT NULL AND TRIM(c.name) <> ''`;
  const linked = `EXISTS (SELECT 1 FROM projects p WHERE ${COMPANY_PROJECT_LINK}${projectScope})`;
  const where = filter === "with_projects" ? `${named} AND ${linked}` : filter === "without_projects" ? `${named} AND NOT ${linked}` : named;

  const [{ total }] = await select(`SELECT COUNT(*)::int AS total FROM companies c WHERE ${where}`, replacements);
  const totalAll = filter ? (await select(`SELECT COUNT(*)::int AS total FROM companies c WHERE ${named}`))[0].total : total;
  const items = await select(
    `SELECT c.id, TRIM(c.name) AS name,
            (SELECT COUNT(*)::int FROM projects p WHERE ${COMPANY_PROJECT_LINK}${projectScope}) AS projects
       FROM companies c
      WHERE ${where}
      ORDER BY LOWER(TRIM(c.name)) ASC, c.id ASC
      LIMIT :limit OFFSET :offset`,
    replacements
  );

  let projectsLoaded = null;
  if (view === "projects" && items.length) {
    try {
      const ids = items.map((i) => i.id);
      const rows = await select(
        `SELECT c.id AS "companyId", p.id, p."nomProjet" AS name, p.statut, p."isArchived" AS archived
           FROM companies c JOIN projects p ON ${COMPANY_PROJECT_LINK}
          WHERE c.id IN (:ids)${projectScope}
          ORDER BY p."createdAt" DESC, p.id ASC`,
        { ...replacements, ids }
      );
      // Hors périmètre : un nombre par société, jamais le contenu.
      const allCounts = scoped
        ? await select(`SELECT c.id AS "companyId", COUNT(*)::int AS n FROM companies c JOIN projects p ON ${COMPANY_PROJECT_LINK} WHERE c.id IN (:ids) GROUP BY c.id`, { ids })
        : [];
      const totals = new Map(allCounts.map((r) => [r.companyId, r.n]));
      const byCompany = new Map(ids.map((id) => [id, new Map()]));
      for (const r of rows) byCompany.get(r.companyId).set(r.id, { id: r.id, name: r.name, statut: r.statut, archived: r.archived });
      for (const item of items) {
        const projects = [...byCompany.get(item.id).values()];
        item.projects = projects.length;
        item.projectItems = projects.slice(0, COMPANY_PROJECTS_SHOWN);
        item.outOfScope = scoped ? Math.max(0, (totals.get(item.id) || 0) - projects.length) : 0;
      }
      projectsLoaded = true;
    } catch (err) {
      // La liste des sociétés reste servie ; la cause technique va au journal.
      console.error(`[crmEntityDirectory] lecture des projets par société impossible : ${err && err.message}`);
      projectsLoaded = false;
      for (const item of items) item.projects = null;
    }
  }
  return { items, total, totalAll, offset, truncated: offset + items.length < total, scope: scoped ? "mine" : "all", view, filter, projectsLoaded };
}

module.exports = { findEntity, findAnyEntity, findProjectPromoter, listCompanies, listPromoters, findPromoterProjects, normalizeName, PROJECT_LIMIT, DEFAULT_SCOPE };
