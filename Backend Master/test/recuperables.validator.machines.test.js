"use strict";

// Récupérables : le numéro de machine n'est plus limité à 1..4 (référentiel
// Machines). L'existence et le statut ACTIVE sont vérifiés à l'écriture par
// le hook linkMachine (test/models.machineLink.test.js).

const { validateSaveFiche } = require("../src/modules/recuperables/validators/recuperable.validator");

function run(body) {
  const req = { body };
  const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(p) { this.body = p; return this; } };
  let passed = false;
  validateSaveFiche(req, res, () => { passed = true; });
  return { passed, res, req };
}

const base = { module: "PROBAR", ligne: "L1", poste: "matin", date: "2026-09-28", recuperables: [] };

test.each(["1", "4", "5", "12"])("machine %p acceptée (PROBAR-05 et au-delà)", (machine) => {
  expect(run({ ...base, machine }).passed).toBe(true);
});

test.each(["0", "abc", "", "1a", "-1"])("machine %p refusée (400)", (machine) => {
  const { passed, res } = run({ ...base, machine });
  expect(passed).toBe(false);
  expect(res.statusCode).toBe(400);
});
