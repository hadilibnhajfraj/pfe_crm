const { DataTypes } = require("sequelize");
const { sequelize } = require("../db");

const CommercialContact = sequelize.define(
  "CommercialContact",
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    typeClient: {
      type: DataTypes.ENUM("Tuteur", "Cloture", "Batiment"),
      allowNull: false,
      defaultValue: "autre",
    },

    nomSociete: {
      type: DataTypes.STRING(200),
      allowNull: true,
    },

    nom: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },

    prenom: {
      type: DataTypes.STRING(120),
      allowNull: false,
    },

    localisation: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },

    telephone: {
      type: DataTypes.STRING(40),
      allowNull: false,
    },

    message: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    statut: {
      type: DataTypes.ENUM(
        "ok",
        "rappeler_plus_tard",
        "user_injoignable",
        "client_refuse"
      ),
      allowNull: false,
      defaultValue: "user_injoignable",
    },

    nbAppels: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },

    sujetDiscussion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    // ✅ NEW
    pipelineStage: {
      type: DataTypes.ENUM(
        "Prospect",
        "Contacté",
        "Visite",
        "Devis envoyé",
        "Negociation",
        "Gagné",
        "Perdu"
      ),
      allowNull: false,
      defaultValue: "Prospect",
    },

    // ✅ NEW
   dateAppel: {
  type: DataTypes.DATE,
  allowNull: true, // 🔥 IMPORTANT temporaire
  defaultValue: DataTypes.NOW,
},
user_nom: {
  type: DataTypes.ENUM("najeh", "mooemen", "mayssa"),
  allowNull: true,
},

// 🔥 AJOUT
user_nom_custom: {
  type: DataTypes.STRING,
  allowNull: true,
},
email: {
  type: DataTypes.STRING(150),
  allowNull: true,
  validate: {
    isEmail: true, // ✅ validation automatique
  },
},
matriculeFiscale: {
  type: DataTypes.STRING(50),
  allowNull: true, // ou false si obligatoire
},
    createdBy: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    // Commercial (role "commercial") AUQUEL le contact est affecté —
    // distinct de commercial_contact_relances.commercialId (qui ne vaut
    // que pour une relance ponctuelle). Renseigné par l'action "Affecter
    // des contacts" (POST /commercial-contacts/assign). Les 485 contacts
    // antérieurs à la migration 20260929090100 conservent la valeur posée
    // par le backfill historique 20260718090100 (commercialId = createdBy).
    commercialId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    // Utilisateur QUI a réalisé l'affectation (commercial_sedentaire ou
    // admin) et date de cette affectation — même convention que
    // maintenance_requests.assignedBy/assignedAt. NULL pour les affectations
    // antérieures à la migration 20260929090100 (auteur historique inconnu).
    assignedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
    assignedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "commercial_contacts",
    timestamps: true,
    indexes: [
      // Filtre principal de GET /commercial-contacts ("mes contacts") et de
      // commercialContactKpi.service.js — une FK ne crée pas d'index en
      // PostgreSQL (voir la migration 20260731000200-...).
      { fields: ["createdBy"] },
    ],
  }
);
module.exports = CommercialContact;