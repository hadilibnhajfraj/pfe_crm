"use strict";

// Compatibilité des identifiants du lot de démonstration avec le Copilot —
// à précharger APRÈS demo-guard.js, pour la démonstration seulement :
//
//   node -r ./scripts/demo/demo-guard.js -r ./scripts/demo/demo-uuid-compat.js src/app.js
//
// Pourquoi : le générateur du lot produit des identifiants UUID de version 5
// (dérivés du nom du lot, donc rejouables). Le Copilot exige la version 4 pour
// l'utilisateur connecté (src/ai/mcp/validationManager.js) et pour les
// identifiants passés à 40 outils : avec un compte demo.*, tout appel d'outil
// échoue par « "id" must be a valid GUID ».
//
// Ce fichier ne modifie aucun fichier du Copilot : pour CE processus, il fait
// accepter par Joi tout UUID bien formé, quelle que soit sa version. Une chaîne
// qui n'est pas un UUID reste refusée. Sans ce préchargement, rien ne change.

if (process.env.DEMO_MODE !== "true") {
  console.error("[demo-uuid-compat] REFUS : à charger uniquement après demo-guard.js.");
  process.exit(1);
}

const Joi = require("joi");

const stringPrototype = Object.getPrototypeOf(Joi.string());
const strictGuid = stringPrototype.guid;
const anyVersion = function guid(options = {}) {
  const { version, ...rest } = options; // la contrainte de version est retirée, le reste est conservé
  return strictGuid.call(this, rest);
};
stringPrototype.guid = anyVersion;
stringPrototype.uuid = anyVersion;

console.log("[demo-uuid-compat] Identifiants UUID acceptés quelle que soit leur version (processus de démonstration uniquement).");
