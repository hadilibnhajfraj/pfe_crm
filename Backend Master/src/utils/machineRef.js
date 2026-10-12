"use strict";

// Référentiel Machines — conversion de la valeur texte historique `machine`
// des fiches de production ("1", "PROBAR-01", "PROMESH — Machine 1"…) vers
// le couple (typeMachine, numero) qui identifie une ligne de `machines`.
//
// Règle (identique au backfill SQL de la migration
// 20260928090000-create-machines-and-link-production.js) :
//   - un préfixe PROBAR/PROMESH explicite dans le texte fixe le type ;
//   - sinon, une valeur purement numérique prend le type par défaut du
//     module (PROBAR pour une fiche PROBAR, PROMESH pour une fiche POR…) ;
//   - le numéro est le nombre entier en fin de texte.
// Tout autre texte (équipement libre d'une fiche maintenance, Mélange sans
// machine…) ne désigne aucune machine du référentiel → null.

const MACHINE_TYPES = ["PROBAR", "PROMESH"];

function parseMachineRef(value, defaultType = null) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;

  const prefix = text.match(/\b(PROBAR|PROMESH)\b/i);
  let typeMachine = null;
  if (prefix) typeMachine = prefix[1].toUpperCase();
  else if (/^\d+$/.test(text)) typeMachine = defaultType;
  if (!typeMachine) return null;

  const trailing = text.match(/(\d+)\s*$/);
  if (!trailing) return null;
  const numero = parseInt(trailing[1], 10);
  if (!Number.isInteger(numero) || numero < 1) return null;

  return { typeMachine, numero };
}

// "PROBAR" + 1 → "PROBAR-01" (code affiché des 8 machines initiales).
function formatMachineCode(typeMachine, numero) {
  return `${typeMachine}-${String(numero).padStart(2, "0")}`;
}

module.exports = { MACHINE_TYPES, parseMachineRef, formatMachineCode };
