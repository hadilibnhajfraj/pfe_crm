"use strict";
// Audit non fonctionnel — tests fonctionnels d'API du CRM commercial :
// contacts, affectation, actions, relances, projets, pipeline.
const { sequelize, login, as, assertTestDatabase } = require("./nfr.helpers");

const SED = "commercial_sedentaire";
const NIL = "00000000-0000-0000-0000-000000000000";
const TAG = `NFR-${Date.now()}`;
let contactId;

beforeAll(async () => {
  assertTestDatabase();
  for (const r of ["commercial", SED, "accueil", "superadmin"]) await login(r);
}, 120000);

afterAll(async () => {
  await sequelize.query(`DELETE FROM commercial_contacts WHERE nom = :tag`, { replacements: { tag: TAG } });
  await sequelize.close();
});

describe("Contacts commerciaux", () => {
  test("création sans nom → 400", async () => {
    const res = await as(SED, "post", "/commercial-contacts", { prenom: "Sans", telephone: "20000001" });
    expect(res.status).toBe(400);
  });

  test("le Commercial sédentaire crée un contact → 201, createdBy = son identifiant", async () => {
    const { id } = await login(SED);
    const res = await as(SED, "post", "/commercial-contacts", {
      typeClient: "Tuteur",
      nom: TAG,
      prenom: "Contact",
      telephone: "20000001",
      statut: "ok",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ nom: TAG, statut: "ok", pipelineStage: "Prospect", createdBy: id });
    contactId = res.body.id;
  });

  test("lecture du contact créé → 200", async () => {
    const res = await as(SED, "get", `/commercial-contacts/${contactId}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(contactId);
  });

  test("contact inexistant → 404", async () => {
    const res = await as(SED, "get", `/commercial-contacts/${NIL}`);
    expect(res.status).toBe(404);
  });

  test("liste des contacts → 200 et tableau JSON", async () => {
    const res = await as(SED, "get", "/commercial-contacts");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  test("l'Accueil ne peut pas modifier un contact qu'il n'a pas créé → 403", async () => {
    const res = await as("accueil", "put", `/commercial-contacts/${contactId}`, { nom: "Modifié" });
    expect(res.status).toBe(403);
  });

  test("le créateur modifie son contact → 200", async () => {
    const res = await as(SED, "put", `/commercial-contacts/${contactId}`, {
      nom: TAG,
      prenom: "Contact",
      telephone: "20000002",
      statut: "ok",
    });
    expect(res.status).toBe(200);
  });
});

describe("Affectation d'un contact à un Commercial", () => {
  test("destinataire qui n'a pas le rôle commercial → 400", async () => {
    const { id } = await login("accueil");
    const res = await as(SED, "post", "/commercial-contacts/assign", { contactIds: [contactId], commercialId: id });
    expect(res.status).toBe(400);
  });

  test("destinataire inexistant → 400", async () => {
    const res = await as(SED, "post", "/commercial-contacts/assign", { contactIds: [contactId], commercialId: NIL });
    expect(res.status).toBe(400);
  });

  test("affectation valide → 200, commercialId / assignedBy / assignedAt renseignés en base", async () => {
    const commercial = await login("commercial");
    const sedentaire = await login(SED);
    const res = await as(SED, "post", "/commercial-contacts/assign", { contactIds: [contactId], commercialId: commercial.id });
    expect(res.status).toBe(200);
    expect(res.body.updatedCount).toBe(1);
    const [rows] = await sequelize.query(
      `SELECT "commercialId", "assignedBy", "assignedAt", "createdBy" FROM commercial_contacts WHERE id = :id`,
      { replacements: { id: contactId } }
    );
    expect(rows[0].commercialId).toBe(commercial.id);
    expect(rows[0].assignedBy).toBe(sedentaire.id);
    expect(rows[0].assignedAt).not.toBeNull();
    expect(rows[0].createdBy).toBe(sedentaire.id);
  });

  test("le Commercial destinataire voit le contact qui lui est affecté → 200", async () => {
    const res = await as("commercial", "get", `/commercial-contacts/${contactId}`);
    expect(res.status).toBe(200);
  });

  test("le Commercial destinataire ne peut pas supprimer le contact → 403", async () => {
    const res = await as("commercial", "delete", `/commercial-contacts/${contactId}`);
    expect(res.status).toBe(403);
  });
});

describe("Actions et relances commerciales", () => {
  test("la création du contact a généré une action initiale → liste non vide", async () => {
    const res = await as(SED, "get", `/commercial-contacts/${contactId}/actions`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
    expect(res.body[0].commercialContactId).toBe(contactId);
  });

  test("relance sans date → 400", async () => {
    const res = await as(SED, "post", `/commercial-contacts/${contactId}/relances`, {});
    expect(res.status).toBe(400);
  });

  test("relance valide → 201, statut 'planifiee'", async () => {
    const res = await as(SED, "post", `/commercial-contacts/${contactId}/relances`, {
      dateRelance: "2027-01-15",
      heureRelance: "10:00",
      commentaire: "Relance NFR",
    });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ commercialContactId: contactId, statutRelance: "planifiee" });
  });

  test("relance sur un contact inexistant → 404", async () => {
    const res = await as("superadmin", "post", `/commercial-contacts/${NIL}/relances`, { dateRelance: "2027-01-15" });
    expect(res.status).toBe(404);
  });
});

describe("Projets et pipeline", () => {
  test("liste paginée des projets → 200 avec items / total / page", async () => {
    const res = await as("commercial", "get", "/projects?limit=5");
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.items)).toBe(true);
    expect(res.body.items.length).toBeLessThanOrEqual(5);
    expect(typeof res.body.total).toBe("number");
  });

  test("projet inexistant → 404", async () => {
    const res = await as("commercial", "get", `/projects/${NIL}`);
    expect(res.status).toBe(404);
  });

  test("création de projet invalide → 400 avec la liste des erreurs de validation", async () => {
    const res = await as("commercial", "post", "/projects", {});
    expect(res.status).toBe(400);
    expect(Array.isArray(res.body.errors)).toBe(true);
    expect(res.body.errors.length).toBeGreaterThan(0);
  });

  test("étapes du pipeline → 200 et liste non vide", async () => {
    const res = await as("commercial", "get", "/pipeline-stages");
    expect(res.status).toBe(200);
    const list = Array.isArray(res.body) ? res.body : res.body.data || res.body.items || [];
    expect(list.length).toBeGreaterThan(0);
  });

  test("indicateurs du tableau de bord projets → 200", async () => {
    const res = await as("commercial", "get", "/projects/kpi/dashboard");
    expect(res.status).toBe(200);
  });

  test("suppression du contact par un superadmin → 200 (cascade sur actions et relances)", async () => {
    const res = await as("superadmin", "delete", `/commercial-contacts/${contactId}`);
    expect(res.status).toBe(200);
    const [rows] = await sequelize.query(
      `SELECT (SELECT count(*) FROM commercial_contact_actions WHERE "commercialContactId" = :id)::int AS actions,
              (SELECT count(*) FROM commercial_contact_relances WHERE "commercialContactId" = :id)::int AS relances`,
      { replacements: { id: contactId } }
    );
    expect(rows[0]).toEqual({ actions: 0, relances: 0 });
  });
});
