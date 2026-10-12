"use strict";

// Contrôle d'accès UNIQUE aux contacts commerciaux (règle A, vocabulaire des
// rôles v2 — constants/roles.js). Utilisé par la liste, le détail, les
// actions, les relances, la modification et la suppression, pour qu'aucune
// route n'applique une règle différente.
//
//   Consulter (VIEW)
//     - admin / superadmin / superadmin2, commercial_sedentaire : tous
//     - accueil : tous (vue complète historique de la liste, inchangée)
//     - commercial : contacts qui lui sont affectés (commercialId), qu'il
//       suit via une relance (commercial_contact_relances.commercialId) ou
//       qu'il a créés (createdBy)
//     - le créateur d'un contact le consulte toujours
//   Gérer (MANAGE — modifier, actions, relances)
//     - admins, commercial_sedentaire : tous
//     - commercial : ses contacts (même périmètre que VIEW)
//     - le créateur (droit historique conservé)
//   Supprimer (DELETE)
//     - admins, commercial_sedentaire, ou le créateur (droit historique) —
//       un contact simplement affecté/suivi ne suffit pas
//   Tout autre cas → 403. Contact inexistant / identifiant invalide → 404.

const { Op } = require("sequelize");
const CommercialContact = require("../../../models/CommercialContact");
const CommercialContactRelance = require("../../../models/CommercialContactRelance");
const { ROLES, ADMIN_TIER_ROLES } = require("../../../constants/roles");

const LEVELS = Object.freeze({ VIEW: "view", MANAGE: "manage", DELETE: "delete" });

const FULL_VIEW_ROLES = [...ADMIN_TIER_ROLES, ROLES.COMMERCIAL_SEDENTAIRE, ROLES.ACCUEIL];
const FULL_MANAGE_ROLES = [...ADMIN_TIER_ROLES, ROLES.COMMERCIAL_SEDENTAIRE];

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// req.user expose `sub`, les actingUser du Copilot exposent `id`.
function userIdOf(user) {
  return user?.sub || user?.id || null;
}

// Ids des contacts qu'un commercial suit via au moins une relance.
async function followedContactIds(userId) {
  const rows = await CommercialContactRelance.findAll({
    where: { commercialId: userId },
    attributes: ["commercialContactId"],
  });
  return [...new Set(rows.map((r) => r.commercialContactId).filter(Boolean))];
}

// Périmètre de la LISTE : { all: true } | { all: false, where } | null (interdit).
async function contactListScope(user) {
  const role = user?.role;
  if (FULL_VIEW_ROLES.includes(role)) return { all: true };
  if (role !== ROLES.COMMERCIAL) return null;

  const userId = userIdOf(user);
  const followed = await followedContactIds(userId);
  const or = [{ createdBy: userId }, { commercialId: userId }];
  if (followed.length) or.push({ id: { [Op.in]: followed } });
  return { all: false, where: { [Op.or]: or }, followedContactIds: followed };
}

async function isInCommercialScope(userId, contact) {
  if (contact.commercialId === userId) return true;
  const count = await CommercialContactRelance.count({
    where: { commercialContactId: contact.id, commercialId: userId },
  });
  return count > 0;
}

// Décision pour UN contact déjà chargé (au minimum id, createdBy, commercialId).
async function canAccessContact(user, contact, level = LEVELS.VIEW) {
  const role = user?.role;
  const userId = userIdOf(user);
  if (!role || !userId || !contact) return false;

  const isCreator = contact.createdBy === userId;

  if (level === LEVELS.DELETE) {
    return FULL_MANAGE_ROLES.includes(role) || isCreator;
  }

  const fullRoles = level === LEVELS.MANAGE ? FULL_MANAGE_ROLES : FULL_VIEW_ROLES;
  if (fullRoles.includes(role) || isCreator) return true;
  if (role === ROLES.COMMERCIAL) return isInCommercialScope(userId, contact);
  return false;
}

// Middleware Express : charge le contact désigné par req.params[param],
// répond 404 / 403, sinon expose req.contactAccess = { contact } et continue.
function requireContactAccess(level = LEVELS.VIEW, param = "id") {
  return async (req, res, next) => {
    try {
      const id = req.params[param];
      const contact = UUID_RE.test(String(id))
        ? await CommercialContact.findByPk(id, { attributes: ["id", "createdBy", "commercialId"] })
        : null;
      if (!contact) return res.status(404).json({ message: "Contact introuvable" });
      if (!(await canAccessContact(req.user, contact, level))) {
        return res.status(403).json({ message: "Accès refusé à ce contact" });
      }
      req.contactAccess = { contact };
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

module.exports = {
  LEVELS,
  contactListScope,
  canAccessContact,
  requireContactAccess,
  followedContactIds,
};
