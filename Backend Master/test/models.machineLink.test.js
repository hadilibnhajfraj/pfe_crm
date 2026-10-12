"use strict";

// Hook linkMachine (models/helpers/machineLink.js), isolé de la base :
// Machine.findOne est simulé. Le comportement sur la vraie base PostgreSQL
// (migration + backfill + hook) a été vérifié séparément dans une
// transaction annulée.

jest.mock("../src/models/Machine", () => ({ findOne: jest.fn() }));

const Machine = require("../src/models/Machine");
const { attachMachineLink } = require("../src/models/helpers/machineLink");

const MACHINES = {
  "PROBAR-1": { id: "m-probar-1", code: "PROBAR-01", statut: "ACTIVE" },
  "PROMESH-1": { id: "m-promesh-1", code: "PROMESH-01", statut: "ACTIVE" },
  "PROMESH-4": { id: "m-promesh-4", code: "PROMESH-04", statut: "INACTIVE" },
};

function installHook(resolveContext) {
  const Model = { addHook: jest.fn() };
  attachMachineLink(Model, resolveContext);
  const [event, name, fn] = Model.addHook.mock.calls[0];
  expect(event).toBe("beforeSave");
  expect(name).toBe("linkMachine");
  return fn;
}

function fakeInstance(values, { isNewRecord = true, changed = [] } = {}) {
  const data = { machineId: undefined, ...values };
  return {
    isNewRecord,
    changed: (f) => changed.includes(f),
    get: (f) => data[f],
    set: (f, v) => { data[f] = v; },
    data,
  };
}

beforeEach(() => {
  Machine.findOne.mockReset();
  Machine.findOne.mockImplementation(async ({ where }) => MACHINES[`${where.typeMachine}-${where.numero}`] || null);
});

describe("création d'une fiche", () => {
  const hook = installHook(() => ({ defaultType: "PROMESH", strict: true }));

  test("numéro seul → machine du type par défaut, requête dans la transaction de l'appelant", async () => {
    const inst = fakeInstance({ machine: "1" });
    await hook(inst, { transaction: "tx-1" });
    expect(inst.data.machineId).toBe("m-promesh-1");
    expect(Machine.findOne).toHaveBeenCalledWith({ where: { typeMachine: "PROMESH", numero: 1 }, transaction: "tx-1" });
  });

  test("sans machine (brouillon) → machineId null, aucune requête", async () => {
    const inst = fakeInstance({ machine: null });
    await hook(inst, {});
    expect(inst.data.machineId).toBeNull();
    expect(Machine.findOne).not.toHaveBeenCalled();
  });

  test("machine inconnue du référentiel (strict) → 400", async () => {
    await expect(hook(fakeInstance({ machine: "7" }), {})).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("PROMESH-07 inconnue"),
    });
  });

  test("machine désactivée → 400, aucune affectation", async () => {
    const inst = fakeInstance({ machine: "4" });
    await expect(hook(inst, {})).rejects.toMatchObject({
      status: 400,
      message: expect.stringContaining("PROMESH-04 est désactivée"),
    });
    expect(inst.data.machineId).toBeUndefined();
  });

  test("valeur illisible (strict) → 400", async () => {
    await expect(hook(fakeInstance({ machine: "abc" }), {})).rejects.toMatchObject({ status: 400 });
  });
});

describe("mise à jour d'une fiche", () => {
  const hook = installHook(() => ({ defaultType: "PROMESH", strict: true }));

  test("aucun champ machine/module modifié → hook sans effet (lien existant conservé, même si la machine a été désactivée depuis)", async () => {
    const inst = fakeInstance({ machine: "4", machineId: "m-promesh-4" }, { isNewRecord: false, changed: ["observations"] });
    await hook(inst, {});
    expect(inst.data.machineId).toBe("m-promesh-4");
    expect(Machine.findOne).not.toHaveBeenCalled();
  });

  test("changement de machine → nouveau lien", async () => {
    const inst = fakeInstance({ machine: "1", machineId: "old" }, { isNewRecord: false, changed: ["machine"] });
    await hook(inst, {});
    expect(inst.data.machineId).toBe("m-promesh-1");
  });

  test("machineId forcé par le client → recalculé depuis `machine`", async () => {
    const inst = fakeInstance({ machine: "1", machineId: "forged" }, { isNewRecord: false, changed: ["machineId"] });
    await hook(inst, {});
    expect(inst.data.machineId).toBe("m-promesh-1");
  });
});

describe("mode non strict (maintenance / Mélange)", () => {
  const hook = installHook(() => ({ defaultType: null, strict: false }));

  test("préfixe explicite → machine liée", async () => {
    const inst = fakeInstance({ machine: "PROMESH — Machine 1" });
    await hook(inst, {});
    expect(inst.data.machineId).toBe("m-promesh-1");
  });

  test("équipement libre → texte conservé, machineId null", async () => {
    const inst = fakeInstance({ machine: "Compresseur 2" });
    await hook(inst, {});
    expect(inst.data.machineId).toBeNull();
    expect(inst.data.machine).toBe("Compresseur 2");
  });

  test("machine préfixée inconnue → null (pas d'erreur)", async () => {
    const inst = fakeInstance({ machine: "PROBAR 9" });
    await hook(inst, {});
    expect(inst.data.machineId).toBeNull();
  });
});

describe("contexte dépendant de l'instance (RecuperableFiche : type = module)", () => {
  const hook = installHook((fiche) => ({ defaultType: fiche.get("module"), strict: true }));

  test("module PROBAR + '1' → PROBAR-01", async () => {
    const inst = fakeInstance({ module: "PROBAR", machine: "1" });
    // resolveContext reçoit l'instance elle-même
    await hook(inst, {});
    expect(inst.data.machineId).toBe("m-probar-1");
  });
});
