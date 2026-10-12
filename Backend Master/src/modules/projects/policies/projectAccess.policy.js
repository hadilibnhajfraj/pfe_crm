"use strict";

// Périmètre d'accès aux projets pour les routes HTTP.
//
// Règle métier (rôles réels de constants/roles.js) :
//   - admin / superadmin / superadmin2 : tous les projets ; eux seuls peuvent
//     cibler un autre utilisateur avec ?userId= / ?ownerId= ;
//   - tout autre rôle : uniquement les projets dont il est propriétaire
//     (projects.ownerId) ou qui lui ont été partagés (user_projects).
//     Un identifiant d'utilisateur envoyé dans la requête n'élargit jamais
//     ce périmètre.
//
// Ce fichier ne sert QUE les routes et contrôleurs HTTP. Les services
// partagés (project.service.js, dashboard.service.js…) ne sont pas modifiés :
// le Copilot IA les appelle directement et applique son propre périmètre
// (ai/mcp/tools/projects/listProjectsTool.js::scopeInputForActingUser).
//
// Les modèles sont chargés à la demande (require dans les fonctions) pour
// qu'importer cette politique ne charge pas le graphe Sequelize.

const { Op } = require("sequelize");
const { ADMIN_TIER_ROLES, ROLES } = require("../../../constants/roles");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EDIT_PERMISSIONS = ["owner", "editor"];

// Statistiques « projets par utilisateur » : vue d'ensemble destinée aux
// administrateurs et à l'écran d'accueil (application Flutter, route /accueil).
const USER_STATS_ROLES = [...ADMIN_TIER_ROLES, ROLES.ACCUEIL];

function models() {
  return require("../../../models/associations");
}

function isAdmin(user) {
  return ADMIN_TIER_ROLES.includes(user?.role);
}

function userIdOf(user) {
  return user?.sub || null;
}

async function linkedProjectIds(userId) {
  const { UserProject } = models();
  const links = await UserProject.findAll({ where: { userId }, attributes: ["projectId"], raw: true });
  return [...new Set(links.map((l) => l.projectId).filter(Boolean))];
}

/**
 * Clause WHERE (table projects) limitant une liste au périmètre de l'utilisateur.
 * {} pour un administrateur. À placer sous [Op.and] quand la requête porte
 * déjà un [Op.or] (recherche).
 */
async function projectScopeWhere(user) {
  if (isAdmin(user)) return {};
  const userId = userIdOf(user);
  if (!userId) return { id: { [Op.in]: [] } };
  const linked = await linkedProjectIds(userId);
  const or = [{ ownerId: userId }];
  if (linked.length) or.push({ id: { [Op.in]: linked } });
  return { [Op.or]: or };
}

/**
 * true / false, ou null si le projet n'existe pas.
 * level "view" : propriétaire ou n'importe quel partage.
 * level "edit" : propriétaire ou partage owner / editor.
 */
async function projectAccess(user, projectId, level = "view") {
  const { Project, UserProject } = models();
  const project = await Project.findByPk(projectId, { attributes: ["id", "ownerId"] });
  if (!project) return null;
  if (isAdmin(user)) return true;
  const userId = userIdOf(user);
  if (!userId) return false;
  if (project.ownerId === userId) return true;
  const link = await UserProject.findOne({ where: { userId, projectId }, attributes: ["permission"] });
  if (!link) return false;
  return level === "edit" ? EDIT_PERMISSIONS.includes(link.permission) : true;
}

function deny(res, status, message) {
  return res.status(status).json({ success: false, message });
}

async function decide(req, res, next, projectId, level) {
  const allowed = await projectAccess(req.user, projectId, level);
  if (allowed === null) return deny(res, 404, "Project not found");
  if (!allowed) return deny(res, 403, "Forbidden: project outside your scope");
  return next();
}

/**
 * Middleware : le projet désigné par req.params[param] doit être dans le
 * périmètre de l'utilisateur. Un identifiant mal formé est laissé au
 * handler (qui répond 400) ; un administrateur passe toujours.
 */
function requireProjectAccess(level = "view", param = "id") {
  return async (req, res, next) => {
    try {
      if (isAdmin(req.user)) return next();
      const projectId = req.params[param];
      if (!UUID_RE.test(projectId || "")) return next();
      return await decide(req, res, next, projectId, level);
    } catch (err) {
      return deny(res, 500, "Access check failed");
    }
  };
}

// Même contrôle, le projet étant retrouvé à partir d'une action de projet.
function requireActionAccess(level = "edit", param = "actionId") {
  return async (req, res, next) => {
    try {
      if (isAdmin(req.user)) return next();
      const { ProjectAction } = models();
      const action = await ProjectAction.findByPk(req.params[param], { attributes: ["id", "projectId"] });
      if (!action) return deny(res, 404, "Action not found");
      return await decide(req, res, next, action.projectId, level);
    } catch (err) {
      return deny(res, 500, "Access check failed");
    }
  };
}

// Même contrôle, à partir d'un rappel (project_reminders).
function requireReminderAccess(level = "edit", param = "id") {
  return async (req, res, next) => {
    try {
      if (isAdmin(req.user)) return next();
      const { ProjectReminder } = models();
      const reminder = await ProjectReminder.findByPk(req.params[param], { attributes: ["id", "projectId"] });
      if (!reminder) return deny(res, 404, "Reminder not found");
      return await decide(req, res, next, reminder.projectId, level);
    } catch (err) {
      return deny(res, 500, "Access check failed");
    }
  };
}

function requireRoles(...roles) {
  return (req, res, next) => {
    const role = req.user?.role;
    if (!role) return deny(res, 401, "Unauthorized");
    if (!roles.includes(role)) return deny(res, 403, "Forbidden");
    return next();
  };
}

const requireAdmin = requireRoles(...ADMIN_TIER_ROLES);

// L'identifiant d'utilisateur de l'URL doit être celui du jeton, sauf administrateur.
function requireSelfOrAdmin(param = "id") {
  return (req, res, next) => {
    if (isAdmin(req.user)) return next();
    if (userIdOf(req.user) && req.params[param] === userIdOf(req.user)) return next();
    return deny(res, 403, "Forbidden: another user's data");
  };
}

/**
 * Filtres de liste (project.service.listProjects, tableau Kanban) : pour un
 * non-administrateur, tout champ de périmètre envoyé par le client est
 * retiré et remplacé par « mes projets ». Même règle que le Copilot.
 */
function scopeListQuery(query, user) {
  if (isAdmin(user)) return query;
  const { mine: _mine, myProjects: _myProjects, ownerId: _ownerId, userId: _userId, ...rest } = query || {};
  return { ...rest, mine: "true" };
}

module.exports = {
  USER_STATS_ROLES,
  isAdmin,
  projectScopeWhere,
  projectAccess,
  requireProjectAccess,
  requireActionAccess,
  requireReminderAccess,
  requireRoles,
  requireAdmin,
  requireSelfOrAdmin,
  scopeListQuery,
};
