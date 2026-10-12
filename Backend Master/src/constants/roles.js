"use strict";

// Référentiel unique des rôles de `users.role` (ENUM PostgreSQL
// enum_users_role). Vocabulaire v2 — migration
// 20260929090000-rename-user-roles.js :
//   ancien "user"       → "commercial"            (commercial terrain : crée et suit ses projets)
//   ancien "commercial" → "commercial_sedentaire" (gère et affecte les contacts commerciaux)
// Les autres rôles sont inchangés. "user" n'est plus un rôle métier.

const ROLES = Object.freeze({
  COMMERCIAL: "commercial",
  COMMERCIAL_SEDENTAIRE: "commercial_sedentaire",
  ACCUEIL: "accueil",
  ADMIN: "admin",
  SUPERADMIN: "superadmin",
  RESPONSABLE_LOGISTIQUE_ACHAT: "responsable_logistique_achat",
  SUPERADMIN2: "superadmin2",
});

// Ordre identique à l'ENUM PostgreSQL après migration.
const ALL_ROLES = Object.freeze([
  ROLES.COMMERCIAL,
  ROLES.COMMERCIAL_SEDENTAIRE,
  ROLES.ACCUEIL,
  ROLES.ADMIN,
  ROLES.SUPERADMIN,
  ROLES.RESPONSABLE_LOGISTIQUE_ACHAT,
  ROLES.SUPERADMIN2,
]);

const ADMIN_TIER_ROLES = Object.freeze([ROLES.ADMIN, ROLES.SUPERADMIN, ROLES.SUPERADMIN2]);

// Rôle attribué à toute nouvelle inscription (compte inactif jusqu'à
// activation par un administrateur, qui attribue alors le rôle définitif,
// par ex. commercial_sedentaire).
const DEFAULT_SIGNUP_ROLE = ROLES.COMMERCIAL;

// Version du vocabulaire des rôles portée par chaque access token (claim
// `rv`). Un token sans `rv` égal à cette valeur a été émis avant la
// migration v2 : son claim `role` peut avoir l'ANCIEN sens ("commercial" =
// sédentaire) — il est rejeté (401) pour forcer une reconnexion unique.
const ROLE_VOCABULARY_VERSION = 2;

module.exports = {
  ROLES,
  ALL_ROLES,
  ADMIN_TIER_ROLES,
  DEFAULT_SIGNUP_ROLE,
  ROLE_VOCABULARY_VERSION,
};
