"use strict";

const { parseMachineRef, formatMachineCode } = require("../src/utils/machineRef");

describe("parseMachineRef — valeur texte `machine` des fiches → (typeMachine, numero)", () => {
  test.each([
    ["1", "PROBAR", { typeMachine: "PROBAR", numero: 1 }],
    [" 3 ", "PROMESH", { typeMachine: "PROMESH", numero: 3 }],
    ["04", "PROBAR", { typeMachine: "PROBAR", numero: 4 }],
    [2, "PROMESH", { typeMachine: "PROMESH", numero: 2 }],
    // Préfixe explicite : prime sur le type par défaut du module.
    ["PROBAR-01", null, { typeMachine: "PROBAR", numero: 1 }],
    ["PROMESH — Machine 1", null, { typeMachine: "PROMESH", numero: 1 }],
    ["promesh 2", "PROBAR", { typeMachine: "PROMESH", numero: 2 }],
  ])("%p (défaut %p) → %p", (value, defaultType, expected) => {
    expect(parseMachineRef(value, defaultType)).toEqual(expected);
  });

  test.each([
    [null, "PROBAR"],
    ["", "PROBAR"],
    ["   ", "PROBAR"],
    ["1", null], // numéro seul sans type (Mélange / maintenance)
    ["Compresseur 2", null], // équipement libre de maintenance
    ["Compresseur 2", "PROBAR"], // texte non numérique : jamais interprété comme une machine PROBAR
    ["PROBAR", null], // type sans numéro
    ["0", "PROBAR"], // numérotation à partir de 1
  ])("%p (défaut %p) → null", (value, defaultType) => {
    expect(parseMachineRef(value, defaultType)).toBeNull();
  });
});

describe("formatMachineCode", () => {
  test("code des machines initiales sur 2 chiffres", () => {
    expect(formatMachineCode("PROBAR", 1)).toBe("PROBAR-01");
    expect(formatMachineCode("PROMESH", 4)).toBe("PROMESH-04");
    expect(formatMachineCode("PROBAR", 12)).toBe("PROBAR-12");
  });
});
