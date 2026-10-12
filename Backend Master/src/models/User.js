// models/User.js
const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");
const { ALL_ROLES, DEFAULT_SIGNUP_ROLE } = require("../constants/roles");

const User = sequelize.define(
  "User",
  {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },

    email: { type: DataTypes.STRING(200), allowNull: false, unique: true },
    passwordHash: { type: DataTypes.STRING(200), allowNull: false },

    isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },

    // Vocabulaire des rôles v2 — identique à l'ENUM PostgreSQL après la
    // migration 20260929090000-rename-user-roles.js (voir constants/roles.js).
    role: {
      type: DataTypes.ENUM(...ALL_ROLES),
      allowNull: false,
      defaultValue: DEFAULT_SIGNUP_ROLE,
    },

    // models/User.js (extrait)
resetPasswordTokenHash: { type: DataTypes.STRING, allowNull: true },
resetPasswordExpiresAt: { type: DataTypes.DATE, allowNull: true },
resetPasswordRequestedAt: { type: DataTypes.DATE, allowNull: true },

    // Utilisé par signin/refresh/logout/reset-password pour invalider les
    // sessions (bcrypt.compare contre le refresh token en clair envoyé au
    // client) — colonne ajoutée via migration, absente auparavant.
    refreshTokenHash: { type: DataTypes.STRING, allowNull: true },

    // ── MFA (voir services/mfa.service.js) ──────────────────────────────
    // mfaLastVerifiedAt gouverne la règle "3 jours" (24h pour les rôles
    // admin/superadmin/superadmin2) ; les 4 champs lastLogin* sont le
    // contexte de la dernière connexion réussie, comparés à chaque nouvelle
    // tentative pour forcer un MFA immédiat si IP/navigateur/appareil/pays
    // diffère (voir cahier des charges MFA).
    mfaLastVerifiedAt: { type: DataTypes.DATE, allowNull: true },
    lastLoginIp: { type: DataTypes.STRING(64), allowNull: true },
    lastLoginBrowser: { type: DataTypes.STRING(100), allowNull: true },
    lastLoginCountry: { type: DataTypes.STRING(2), allowNull: true },
    lastLoginDeviceId: { type: DataTypes.STRING(100), allowNull: true },

    // Dernier envoi RÉEL d'un email OTP (distinct de mfaLastVerifiedAt, qui
    // suit la validation, pas l'envoi) — cooldown anti-spam 60s, voir
    // services/mfa.service.js.
    mfaLastSentAt: { type: DataTypes.DATE, allowNull: true },

  },
  {
    tableName: "users",
    timestamps: true,
    indexes: [{ unique: true, fields: ["email"] }],
  }
);

module.exports = User;
