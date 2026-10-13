"use strict";

const Joi = require("joi");

// Règle UNIQUE de validation d'un identifiant UUID pour le MCP : utilisateur
// agissant (validationManager.js) et identifiants reçus par les outils.
//
// Les colonnes `uuid` de PostgreSQL acceptent toutes les versions. Le schéma
// en contient deux : v4 (gen_random_uuid(), Sequelize.UUIDV4) et v5
// (identifiants dérivés d'un nom, produits par scripts/demo-seeder). Exiger la
// seule v4 refusait tout compte et toute entité en v5 avant même le contrôle
// d'accès.
//
// Ce qui reste refusé : toute chaîne qui n'est pas un UUID au format canonique
// (8-4-4-4-12 hexadécimaux, tirets obligatoires, sans accolades), une version
// hors 1 à 8, une variante non RFC 4122. La validation d'identifiant n'est donc
// pas relâchée sur la forme ; l'autorisation reste du ressort du
// PermissionManager et des services, inchangés.
const UUID_VERSIONS = Object.freeze(["uuidv1", "uuidv2", "uuidv3", "uuidv4", "uuidv5", "uuidv6", "uuidv7", "uuidv8"]);

function uuidString() {
  return Joi.string().guid({ version: [...UUID_VERSIONS], separator: "-", wrapper: false });
}

module.exports = { uuidString, UUID_VERSIONS };
