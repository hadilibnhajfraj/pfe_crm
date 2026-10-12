"use strict";

const { ROLES } = require("./roles");

// Rôles NE POUVANT JAMAIS être sélectionnés comme "Commercial" — destinataire
// d'une affectation de contact (commercial_contacts.commercialId) ou d'une
// relance (commercial_contact_relances.commercialId) et menu déroulant
// GET /users/commercials. Vocabulaire v2 (constants/roles.js) : seul le rôle
// "commercial" est éligible. commercial_sedentaire RÉALISE les affectations
// mais n'en est jamais le destinataire.
//
// La règle reste exprimée par exclusion (liste noire) pour conserver le
// comportement historique : un futur rôle commercial ajouté à l'ENUM serait
// éligible sans modifier ce fichier.
const NON_COMMERCIAL_ROLES = [
  ROLES.ADMIN,
  ROLES.SUPERADMIN,
  ROLES.SUPERADMIN2,
  ROLES.RESPONSABLE_LOGISTIQUE_ACHAT,
  ROLES.ACCUEIL, // accueil / réception — fonction non commerciale
  ROLES.COMMERCIAL_SEDENTAIRE, // réalise l'affectation, n'en est jamais le destinataire
];

function isCommercialEligibleRole(role) {
  return Boolean(role) && !NON_COMMERCIAL_ROLES.includes(role);
}

module.exports = { NON_COMMERCIAL_ROLES, isCommercialEligibleRole };
