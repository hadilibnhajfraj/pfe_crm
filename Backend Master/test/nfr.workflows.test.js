"use strict";
// Audit non fonctionnel — workflows des services internes :
// demandes de maintenance, demandes RH, demandes d'archivage.
const { sequelize, login, as, ROLES, emailOf, assertTestDatabase } = require("./nfr.helpers");

const RLA = "responsable_logistique_achat";
const NIL = "00000000-0000-0000-0000-000000000000";
const created = { maintenance: [], hr: [], archive: [] };
let maintenanceId;
let hrId;
let projectId;

beforeAll(async () => {
  assertTestDatabase();
  for (const r of ROLES) await login(r);
  // Les demandes RH exigent un profil employé complet : on le garantit pour le compte QA commercial.
  const { id } = await login("commercial");
  await sequelize.query(
    `INSERT INTO user_profiles (id, "userId", nom, prenom, matricule, qualification, departement, service, "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), :id, 'QA', 'Commercial', 'QA-0001', 'Commercial', 'Commercial', 'Ventes', now(), now())
     ON CONFLICT ("userId") DO UPDATE SET nom='QA', prenom='Commercial', matricule='QA-0001',
       qualification='Commercial', departement='Commercial', service='Ventes'`,
    { replacements: { id } }
  );
  const [rows] = await sequelize.query(`SELECT id FROM projects WHERE "isArchived" = false ORDER BY "createdAt" LIMIT 1`);
  projectId = rows[0].id;
}, 120000);

afterAll(async () => {
  const del = (table, ids) =>
    ids.length ? sequelize.query(`DELETE FROM ${table} WHERE id IN (:ids)`, { replacements: { ids } }) : null;
  await del("maintenance_requests", created.maintenance);
  await del("hr_requests", created.hr);
  await sequelize.query(
    `DELETE FROM archive_requests WHERE "userId" IN (SELECT id FROM users WHERE email LIKE 'qa.%@qa-probar.com')`
  );
  await sequelize.close();
});

describe("Demande de maintenance", () => {
  test("champs obligatoires manquants → 400", async () => {
    const res = await as("commercial", "post", "/maintenance-requests", { equipement: "", typePanne: "" });
    expect(res.status).toBe(400);
  });

  test.each(["commercial", "accueil", RLA])("%s peut soumettre une demande → 201, statut en_attente", async (role) => {
    const res = await as(role, "post", "/maintenance-requests", {
      equipement: `Équipement NFR ${role}`,
      typePanne: "Panne électrique",
      urgence: "moyenne",
      description: "Demande créée par les tests d'audit",
    });
    expect(res.status).toBe(201);
    expect(res.body.data.statut).toBe("en_attente");
    created.maintenance.push(res.body.data.id);
    if (role === "commercial") maintenanceId = res.body.data.id;
  });

  test("le demandeur retrouve sa demande dans « mes demandes »", async () => {
    const res = await as("commercial", "get", "/maintenance-requests/my");
    expect(res.status).toBe(200);
    const list = res.body.data || res.body;
    expect(list.some((r) => r.id === maintenanceId)).toBe(true);
  });

  test("un autre utilisateur ne voit pas cette demande dans « mes demandes »", async () => {
    const res = await as("accueil", "get", "/maintenance-requests/my");
    const list = res.body.data || res.body;
    expect(list.some((r) => r.id === maintenanceId)).toBe(false);
  });

  test("le demandeur ne peut pas accepter sa propre demande → 403", async () => {
    const res = await as("commercial", "put", `/maintenance-requests/${maintenanceId}/accept`);
    expect(res.status).toBe(403);
  });

  test("le RLA accepte la demande → 200, statut acceptee", async () => {
    const res = await as(RLA, "put", `/maintenance-requests/${maintenanceId}/accept`);
    expect(res.status).toBe(200);
    expect(res.body.statut).toBe("acceptee");
  });

  test("démarrage sans technicien affecté → 400", async () => {
    const res = await as(RLA, "put", `/maintenance-requests/${maintenanceId}/start`);
    expect(res.status).toBe(400);
  });

  test("clôture d'une demande qui n'est pas en cours → 400", async () => {
    const res = await as(RLA, "put", `/maintenance-requests/${maintenanceId}/complete`);
    expect(res.status).toBe(400);
  });

  test("affectation sans technicien → 400", async () => {
    const res = await as(RLA, "put", `/maintenance-requests/${maintenanceId}/assign`, {});
    expect(res.status).toBe(400);
  });

  test("l'historique trace la création et l'acceptation", async () => {
    const res = await as(RLA, "get", `/maintenance-requests/${maintenanceId}/history`);
    expect(res.status).toBe(200);
    const types = res.body.data.map((h) => h.type);
    expect(types).toContain("created");
    expect(types.length).toBeGreaterThanOrEqual(2);
  });

  test("refus par le RLA d'une autre demande → 200, statut refusee", async () => {
    const other = created.maintenance.find((id) => id !== maintenanceId);
    const res = await as(RLA, "put", `/maintenance-requests/${other}/reject`, { reason: "Hors périmètre" });
    expect(res.status).toBe(200);
    const [rows] = await sequelize.query(`SELECT statut, "rejectionReason" FROM maintenance_requests WHERE id = :id`, {
      replacements: { id: other },
    });
    expect(rows[0]).toMatchObject({ statut: "refusee", rejectionReason: "Hors périmètre" });
  });
});

describe("Demande RH", () => {
  test("type inconnu → 400", async () => {
    const res = await as("commercial", "post", "/hr-requests", { type: "vacances" });
    expect(res.status).toBe(400);
  });

  test("congé dont la date de fin précède la date de début → 400", async () => {
    const res = await as("commercial", "post", "/hr-requests", {
      type: "conge",
      typeConge: "ordinaire",
      dateDebut: "2027-03-10",
      dateFin: "2027-03-01",
      adresse: "Tunis",
      telephone: "20000001",
    });
    expect(res.status).toBe(400);
  });

  test("profil employé incomplet → 422", async () => {
    const res = await as("accueil", "post", "/hr-requests", {
      type: "sortie",
      dateSortie: "2027-02-01",
      heureSortie: "10:00",
      heureRetour: "11:00",
      motif: "Rendez-vous",
    });
    expect(res.status).toBe(422);
  });

  test("autorisation de sortie valide → 201, statut en_attente", async () => {
    const res = await as("commercial", "post", "/hr-requests", {
      type: "sortie",
      dateSortie: "2027-02-01",
      heureSortie: "10:00",
      heureRetour: "11:00",
      motif: "Rendez-vous",
    });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ type: "sortie", statut: "en_attente" });
    hrId = res.body.data.id;
    created.hr.push(hrId);
  });

  test("le demandeur ne peut pas accepter sa propre demande → 403", async () => {
    const res = await as("commercial", "put", `/hr-requests/${hrId}/accept`);
    expect(res.status).toBe(403);
  });

  test("un autre collaborateur ne peut pas lire cette demande → 403 ou 404", async () => {
    const res = await as("accueil", "get", `/hr-requests/${hrId}`);
    expect([403, 404]).toContain(res.status);
  });

  test("demande inexistante → 404", async () => {
    const res = await as("commercial", "get", `/hr-requests/${NIL}`);
    expect(res.status).toBe(404);
  });
});

describe("Demande d'archivage", () => {
  test("champs obligatoires manquants → 400", async () => {
    const res = await as("commercial", "post", "/archive-requests", {});
    expect(res.status).toBe(400);
  });

  test("un Commercial ne peut pas demander l'archivage d'un projet qui n'est pas le sien → 403", async () => {
    const res = await as("commercial", "post", "/archive-requests", {
      projectId,
      subject: "Archivage NFR",
      message: "Test",
      type: "ARCHIVAGE",
    });
    expect(res.status).toBe(403);
  });

  test("projet inexistant → 404", async () => {
    const res = await as("commercial", "post", "/archive-requests", {
      projectId: NIL,
      subject: "Archivage NFR",
      message: "Test",
      type: "ARCHIVAGE",
    });
    expect(res.status).toBe(404);
  });

  test("le traitement des demandes est réservé à l'administrateur racine : un Commercial reçoit 403", async () => {
    const res = await as("commercial", "put", `/archive-requests/${NIL}/approve`);
    expect(res.status).toBe(403);
  });

  test("« mes demandes d'archivage » → 200", async () => {
    const res = await as("commercial", "get", "/archive-requests/my");
    expect(res.status).toBe(200);
  });
});

describe("Comptes QA", () => {
  test("les 7 rôles disposent d'un compte actif dans la base de test", async () => {
    const [rows] = await sequelize.query(
      `SELECT count(*)::int AS n FROM users WHERE email IN (:emails) AND "isActive" = true`,
      { replacements: { emails: ROLES.map(emailOf) } }
    );
    expect(rows[0].n).toBe(7);
  });
});
