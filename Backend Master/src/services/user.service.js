"use strict";

// Extraction fidèle de la logique déjà présente dans les routes historiques
// routes/admin.js et routes/users.routes.js — aucune règle métier nouvelle,
// juste un déplacement vers une couche service pour que les AI Tools
// puissent l'appeler sans jamais toucher un modèle Sequelize directement
// (voir AI-Business-Copilot/00_PLAN_DEVELOPPEMENT.md). Les routes HTTP
// existantes ne sont pas modifiées et continuent d'interroger les modèles
// comme avant — ce fichier est un ajout, pas un remplacement.

const { Op } = require("sequelize");
const User = require("../models/User");
const UserProfile = require("../models/UserProfile");
const { NON_COMMERCIAL_ROLES } = require("../constants/commercialRoles");
const { resolveFullName } = require("../utils/userDisplay");

const SUPERADMIN_ROLES = ["superadmin", "superadmin2"];
// Liste préservée telle quelle depuis admin.js PUT /users/:id/role — connue
// pour être plus restrictive que l'ENUM réel (superadmin2 n'y figure pas,
// voir §14 P... du dossier d'architecture) : non corrigée ici, une
// extraction fidèle ne change pas le comportement observé.
const ASSIGNABLE_ROLES = ["user", "admin", "superadmin"];

const PROFILE_FIELDS = [
  "name",
  "designation",
  "birthday",
  "phone",
  "country",
  "state",
  "address",
  "about",
  "avatarUrl",
  "nom",
  "prenom",
  "matricule",
  "qualification",
  "departement",
  "service",
];
const HR_PROFILE_FIELDS = [
  "name",
  "designation",
  "phone",
  "nom",
  "prenom",
  "matricule",
  "qualification",
  "departement",
  "service",
];

function pickAllowed(body, allowedKeys) {
  const data = {};
  for (const key of allowedKeys) {
    if (body[key] !== undefined) data[key] = body[key];
  }
  return data;
}

function shapeProfile(profile, user) {
  return {
    ...profile.toJSON(),
    email: user?.email || "",
    role: user?.role || "",
    isActive: user?.isActive ?? true,
  };
}

async function getOrCreateProfile(userId) {
  let profile = await UserProfile.findOne({ where: { userId } });
  if (!profile) profile = await UserProfile.create({ userId });
  return profile;
}

// admin.js GET /admin/users — listing complet, ordonné par date de création.
async function listUsers() {
  return User.findAll({
    attributes: ["id", "email", "role", "isActive", "createdAt", "updatedAt"],
    order: [["createdAt", "DESC"]],
  });
}

// users.routes.js GET / — listing filtrable par rôle, ordonné par email.
async function listUsersByRole({ role } = {}) {
  const where = {};
  if (role) where.role = role.toLowerCase();
  return User.findAll({ where, attributes: ["id", "email", "role"], order: [["email", "ASC"]] });
}

// users.routes.js GET /commercials — candidats sélectionnables comme
// "Commercial" (exclut NON_COMMERCIAL_ROLES, actifs uniquement).
async function listCommercialCandidates() {
  const users = await User.findAll({
    where: { role: { [Op.notIn]: NON_COMMERCIAL_ROLES }, isActive: true },
    attributes: ["id", "email", "role"],
    include: [{ model: UserProfile, as: "profile", attributes: ["name", "nom", "prenom"], required: false }],
    order: [["email", "ASC"]],
  });
  return users.map((u) => ({ id: u.id, fullName: resolveFullName(u), email: u.email, role: u.role }));
}

// admin.js PUT /users/:id/active — actorRole = rôle de l'appelant, déjà
// vérifié admin-tier en amont (Tool/route) ; cette fonction ne fait que la
// règle "un non-superadmin ne peut pas désactiver un superadmin".
async function setUserActive(actorRole, userId, active) {
  const user = await User.findByPk(userId);
  if (!user) throw { status: 404, message: "User not found" };

  if (!SUPERADMIN_ROLES.includes(actorRole) && SUPERADMIN_ROLES.includes(user.role)) {
    throw { status: 403, message: "Cannot modify superadmin" };
  }

  await user.update({ isActive: active });
  return { id: user.id, email: user.email, isActive: user.isActive };
}

// admin.js PUT /users/:id/role — voir ASSIGNABLE_ROLES ci-dessus pour la
// liste (volontairement inchangée).
async function setUserRole(userId, role) {
  if (!ASSIGNABLE_ROLES.includes(role)) throw { status: 400, message: "Invalid role" };

  const user = await User.findByPk(userId);
  if (!user) throw { status: 404, message: "User not found" };

  await user.update({ role });
  return { id: user.id, email: user.email, role: user.role };
}

// users.routes.js GET /me/profile
async function getMyProfile(userId) {
  const profile = await getOrCreateProfile(userId);
  const user = await User.findByPk(userId, { attributes: ["id", "email", "role", "isActive"] });
  return shapeProfile(profile, user);
}

// users.routes.js PUT /me/profile — sans gestion de fichier avatar (upload
// multipart hors périmètre d'un AI Tool JSON, voir Backend Master/src/ai/README.md).
async function updateMyProfile(userId, body) {
  const data = pickAllowed(body, PROFILE_FIELDS);
  const profile = await getOrCreateProfile(userId);
  await profile.update(data);
  await profile.reload();
  const user = await User.findByPk(userId, { attributes: ["id", "email", "role", "isActive"] });
  return shapeProfile(profile, user);
}

// users.routes.js GET /:id/profile (vue admin)
async function getUserProfile(userId) {
  const user = await User.findByPk(userId, { attributes: ["id", "email", "role"] });
  if (!user) throw { status: 404, message: "Utilisateur introuvable" };
  const profile = await getOrCreateProfile(userId);
  return { ...profile.toJSON(), email: user.email, role: user.role };
}

// users.routes.js PUT /:id/profile (édition admin des champs RH)
async function updateUserProfile(userId, body) {
  const user = await User.findByPk(userId, { attributes: ["id"] });
  if (!user) throw { status: 404, message: "Utilisateur introuvable" };
  const data = pickAllowed(body, HR_PROFILE_FIELDS);
  const profile = await getOrCreateProfile(userId);
  await profile.update(data);
  return profile;
}

module.exports = {
  listUsers,
  listUsersByRole,
  listCommercialCandidates,
  setUserActive,
  setUserRole,
  getMyProfile,
  updateMyProfile,
  getUserProfile,
  updateUserProfile,
};
