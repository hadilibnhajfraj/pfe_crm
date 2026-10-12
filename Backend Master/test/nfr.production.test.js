"use strict";
// Audit non fonctionnel — production industrielle : fiches POR/PROMESH
// (validation et verrouillage), fiches de production, machines, récupérables.
const { sequelize, login, as, assertTestDatabase } = require("./nfr.helpers");

const RLA = "responsable_logistique_achat";
const NIL = "00000000-0000-0000-0000-000000000000";
const created = { por: [], records: [], fiches: [], machines: [] };
let porId;

beforeAll(async () => {
  assertTestDatabase();
  for (const r of [RLA, "superadmin", "commercial"]) await login(r);
}, 120000);

afterAll(async () => {
  const del = (table, ids) =>
    ids.length ? sequelize.query(`DELETE FROM ${table} WHERE id IN (:ids)`, { replacements: { ids } }) : null;
  await del("por_promesh", created.por);
  await del("industrial_records", created.records);
  await del("recuperable_fiches", created.fiches);
  await del("machines", created.machines);
  await sequelize.close();
});

describe("Fiche POR / PROMESH — cycle brouillon → validée → verrouillée", () => {
  test("création sans poste → 400", async () => {
    const res = await as(RLA, "post", "/por-promesh/new", { machine: "1" });
    expect(res.status).toBe(400);
  });

  test("poste hors valeurs autorisées → 400", async () => {
    const res = await as(RLA, "post", "/por-promesh/new", { machine: "1", poste: "midi" });
    expect(res.status).toBe(400);
  });

  test("nouvelle fiche → statut BROUILLON", async () => {
    const res = await as(RLA, "post", "/por-promesh/new", { machine: "1", poste: "nuit" });
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.status).toBe("BROUILLON");
    porId = res.body.data.id;
    if (res.status === 201) created.por.push(porId);
  });

  test("un brouillon est modifiable → 200, non verrouillé", async () => {
    const res = await as(RLA, "put", `/por-promesh/${porId}`, { operateur: "Opérateur NFR" });
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "BROUILLON", isLocked: false, operateur: "Opérateur NFR" });
  });

  test("le client ne peut pas forcer status / isLocked par le corps de la requête", async () => {
    await as(RLA, "put", `/por-promesh/${porId}`, { status: "VALIDE", isLocked: true, operateur: "Opérateur NFR" });
    const [rows] = await sequelize.query(`SELECT status, "isLocked", "validatedAt" FROM por_promesh WHERE id = :id`, {
      replacements: { id: porId },
    });
    expect(rows[0]).toMatchObject({ status: "BROUILLON", isLocked: false, validatedAt: null });
  });

  test("validation d'un brouillon dont l'heure de fin n'a pas été saisie → 400, la fiche reste un brouillon", async () => {
    // Un brouillon naît avec heure de fin = heure de début : il doit être
    // complété avant de pouvoir être validé.
    const res = await as(RLA, "post", `/por-promesh/${porId}/validate`);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/heure de fin/);
    const [rows] = await sequelize.query(`SELECT status, "isLocked" FROM por_promesh WHERE id = :id`, { replacements: { id: porId } });
    expect(rows[0]).toMatchObject({ status: "BROUILLON", isLocked: false });
  });

  test("heures d'un poste de nuit qui passe minuit → enregistrées sur le brouillon", async () => {
    const res = await as(RLA, "put", `/por-promesh/${porId}`, { heureDebut: "22:00", heureFin: "06:00" });
    expect(res.status).toBe(200);
  });

  test("validation → statut VALIDE, isLocked = true, validatedAt renseigné", async () => {
    const res = await as(RLA, "post", `/por-promesh/${porId}/validate`);
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ status: "VALIDE", isLocked: true });
    expect(res.body.data.validatedAt).toBeTruthy();
  });

  test("modification d'une fiche validée → 403 (verrouillage)", async () => {
    const res = await as(RLA, "put", `/por-promesh/${porId}`, { operateur: "Modification interdite" });
    expect(res.status).toBe(403);
  });

  test("même un superadmin ne peut pas modifier une fiche validée → 403", async () => {
    const res = await as("superadmin", "put", `/por-promesh/${porId}`, { operateur: "Admin" });
    expect(res.status).toBe(403);
  });

  test("seconde validation d'une fiche déjà validée → 403", async () => {
    const res = await as(RLA, "post", `/por-promesh/${porId}/validate`);
    expect(res.status).toBe(403);
  });

  test("la fiche verrouillée est inchangée en base", async () => {
    const [rows] = await sequelize.query(`SELECT operateur, status, "isLocked" FROM por_promesh WHERE id = :id`, {
      replacements: { id: porId },
    });
    expect(rows[0]).toMatchObject({ operateur: "Opérateur NFR", status: "VALIDE", isLocked: true });
  });

  test("fiche inexistante → 404", async () => {
    const res = await as(RLA, "get", `/por-promesh/${NIL}`);
    expect(res.status).toBe(404);
  });

  test("le numéro de fiche suit le format PROMESH-AAAA-NNNNNN", async () => {
    const res = await as(RLA, "get", `/por-promesh/${porId}`);
    expect(res.status).toBe(200);
    expect(res.body.data.numero).toMatch(/^PROMESH-\d{4}-\d{6}$/);
  });
});

describe("Fiches de production (PROBAR / Mélange)", () => {
  test("module absent → 400", async () => {
    const res = await as(RLA, "post", "/industrial-records", { dateFiche: "2026-10-03" });
    expect(res.status).toBe(400);
  });

  test("module inconnu → 400", async () => {
    const res = await as(RLA, "post", "/industrial-records", { module: "inconnu", dateFiche: "2026-10-03" });
    expect(res.status).toBe(400);
  });

  test("date absente → 400", async () => {
    const res = await as(RLA, "post", "/industrial-records", { module: "probar" });
    expect(res.status).toBe(400);
  });

  test("fiche Mélange sans machine → 201, machineId nul (machine facultative)", async () => {
    const { id } = await login(RLA);
    const res = await as(RLA, "post", "/industrial-records", { module: "melange", dateFiche: "2026-10-03" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ module: "melange", machineId: null, createdBy: id });
    created.records.push(res.body.data.id);
  });

  test("fiche PROBAR rattachée à une machine active → 201, machineId renseigné", async () => {
    const res = await as(RLA, "post", "/industrial-records", {
      module: "probar",
      dateFiche: "2026-10-03",
      machine: "1",
      poste: "matin",
      quantiteProduite: 120,
    });
    expect(res.status).toBe(201);
    expect(res.body.data.machineId).toBeTruthy();
    created.records.push(res.body.data.id);
  });

  test("statut qualité hors valeurs autorisées → 400", async () => {
    const res = await as(RLA, "post", "/industrial-records", {
      module: "probar",
      dateFiche: "2026-10-03",
      statutQualite: "moyen",
    });
    expect(res.status).toBe(400);
  });
});

describe("Référentiel des machines", () => {
  const numero = 60 + Math.floor(Math.random() * 39); // le validateur limite le numéro à 1..99

  test("liste → 200, uniquement des types PROBAR ou PROMESH", async () => {
    const res = await as(RLA, "get", "/machines");
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    for (const m of res.body.data) expect(["PROBAR", "PROMESH"]).toContain(m.typeMachine);
  });

  test("création sans numéro → 400", async () => {
    const res = await as(RLA, "post", "/machines", { typeMachine: "PROBAR" });
    expect(res.status).toBe(400);
  });

  test("type de machine inconnu → 400", async () => {
    const res = await as(RLA, "post", "/machines", { typeMachine: "AUTRE", numero });
    expect(res.status).toBe(400);
  });

  test("création valide → 201, statut ACTIVE", async () => {
    const res = await as(RLA, "post", "/machines", { typeMachine: "PROBAR", numero });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ typeMachine: "PROBAR", numero, statut: "ACTIVE" });
    created.machines.push(res.body.data.id);
  });

  test("doublon (même type et même numéro) → 409", async () => {
    const res = await as(RLA, "post", "/machines", { typeMachine: "PROBAR", numero });
    expect(res.status).toBe(409);
  });

  test("désactivation → 200, statut INACTIVE", async () => {
    const res = await as(RLA, "put", `/machines/${created.machines[0]}/statut`, { statut: "INACTIVE" });
    expect(res.status).toBe(200);
    expect(res.body.data.statut).toBe("INACTIVE");
  });

  test("statut hors valeurs autorisées → 400", async () => {
    const res = await as(RLA, "put", `/machines/${created.machines[0]}/statut`, { statut: "EN_PANNE" });
    expect(res.status).toBe(400);
  });
});

describe("Fiches de récupérables", () => {
  const base = { module: "PROBAR", machine: "1", ligne: "L2", poste: "soir", date: "2026-10-02" };

  test("ligne hors valeurs autorisées → 400", async () => {
    const res = await as(RLA, "post", "/recuperables", { ...base, ligne: "L9" });
    expect(res.status).toBe(400);
  });

  test("quantité de déchets négative → 400", async () => {
    const res = await as(RLA, "post", "/recuperables", { ...base, recuperables: [{ diametre: "8", dechetKg: -5 }] });
    expect(res.status).toBe(400);
  });

  test("fiche valide → enregistrée et rattachée à la machine", async () => {
    const res = await as(RLA, "post", "/recuperables", base);
    expect([200, 201]).toContain(res.status);
    expect(res.body.data.machineId).toBeTruthy();
    created.fiches.push(res.body.data.id);
  });
});
