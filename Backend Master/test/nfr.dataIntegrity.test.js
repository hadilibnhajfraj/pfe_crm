"use strict";
// Audit non fonctionnel — FIABILITÉ DES DONNÉES.
// Vérifie les contraintes réellement portées par PostgreSQL (unicité, clés
// étrangères, NOT NULL, ENUM), les transactions (commit / rollback /
// atomicité), les validations Sequelize et la cohérence des données.
// Chaque écriture se fait dans une transaction annulée : aucune donnée
// n'est conservée.
const { sequelize, assertTestDatabase } = require("./nfr.helpers");

const NIL = "00000000-0000-0000-0000-000000000000";
const UNIQUE_VIOLATION = "23505";
const FK_VIOLATION = "23503";
const NOT_NULL_VIOLATION = "23502";
const INVALID_ENUM = "22P02";

// Exécute `sql` dans une transaction toujours annulée ; renvoie le code
// d'erreur PostgreSQL (SQLSTATE) ou null si l'instruction a été acceptée.
async function pgCode(sql, replacements = {}) {
  const t = await sequelize.transaction();
  try {
    await sequelize.query(sql, { transaction: t, replacements });
    return null;
  } catch (e) {
    return (e.original && e.original.code) || e.name;
  } finally {
    await t.rollback();
  }
}

async function scalar(sql) {
  const [rows] = await sequelize.query(sql);
  return Number(Object.values(rows[0])[0]);
}

beforeAll(() => assertTestDatabase());
afterAll(async () => {
  await sequelize.close();
});

describe("Contraintes d'unicité", () => {
  test("users.email : deux comptes ne peuvent pas partager le même e-mail", async () => {
    const code = await pgCode(
      `UPDATE users SET email = 'qa.admin@qa-probar.com' WHERE email = 'qa.accueil@qa-probar.com'`
    );
    expect(code).toBe(UNIQUE_VIOLATION);
  });

  test("machines.code : unique", async () => {
    const code = await pgCode(
      `UPDATE machines SET code = (SELECT code FROM machines ORDER BY code LIMIT 1)
       WHERE id = (SELECT id FROM machines ORDER BY code DESC LIMIT 1)`
    );
    expect(code).toBe(UNIQUE_VIOLATION);
  });

  test("machines (typeMachine, numero) : un seul numéro par famille", async () => {
    const code = await pgCode(
      `INSERT INTO machines (id, code, nom, "typeMachine", numero, statut, "createdAt", "updatedAt")
       SELECT gen_random_uuid(), 'NFR-DOUBLON', 'Doublon', "typeMachine", numero, 'ACTIVE', now(), now()
       FROM machines ORDER BY code LIMIT 1`
    );
    expect(code).toBe(UNIQUE_VIOLATION);
  });

  test("por_promesh.sequenceNumber : unique", async () => {
    const code = await pgCode(
      `UPDATE por_promesh SET "sequenceNumber" = (SELECT min("sequenceNumber") FROM por_promesh)
       WHERE "sequenceNumber" = (SELECT max("sequenceNumber") FROM por_promesh)`
    );
    expect(code).toBe(UNIQUE_VIOLATION);
  });

  test("user_profiles.userId : un seul profil par utilisateur", async () => {
    const code = await pgCode(
      `INSERT INTO user_profiles (id, "userId", "createdAt", "updatedAt")
       SELECT gen_random_uuid(), "userId", now(), now() FROM user_profiles LIMIT 1`
    );
    expect(code).toBe(UNIQUE_VIOLATION);
  });

  test("user_projects (userId, projectId) : un seul lien par couple", async () => {
    const code = await pgCode(
      `INSERT INTO user_projects (id, "userId", "projectId", permission, "createdAt", "updatedAt")
       SELECT gen_random_uuid(), "userId", "projectId", permission, now(), now() FROM user_projects LIMIT 1`
    );
    expect(code).toBe(UNIQUE_VIOLATION);
  });
});

describe("Clés étrangères : une référence vers un enregistrement inexistant est refusée", () => {
  const cases = [
    ["project_actions", "projectId"],
    ["project_actions", "createdBy"],
    ["project_reminders", "projectId"],
    ["project_reminders", "actionId"],
    ["projects", "ownerId"],
    ["projects", "engineerId"],
    ["projects", "architectId"],
    ["commercial_contacts", "createdBy"],
    ["commercial_contacts", "commercialId"],
    ["commercial_contacts", "assignedBy"],
    ["commercial_contact_actions", "commercialContactId"],
    ["commercial_contact_actions", "createdBy"],
    ["commercial_contact_relances", "commercialContactId"],
    ["commercial_contact_relances", "createdBy"],
    ["industrial_records", "machineId"],
    ["industrial_records", "createdBy"],
    ["por_promesh", "machineId"],
    ["por_promesh", "createdBy"],
    ["recuperable_fiches", "machineId"],
    ["recuperable_fiches", "createdBy"],
    ["maintenance_requests", "userId"],
    ["maintenance_requests", "technicianId"],
    ["hr_requests", "requestedBy"],
    ["archive_requests", "projectId"],
    ["archive_requests", "userId"],
    ["user_projects", "userId"],
    ["user_projects", "projectId"],
    ["user_profiles", "userId"],
  ];

  test.each(cases)("%s.%s → violation de clé étrangère", async (table, column) => {
    const rows = await scalar(`SELECT count(*) FROM ${table}`);
    expect(rows).toBeGreaterThan(0); // le test n'a de sens que si la table contient au moins une ligne
    const code = await pgCode(
      `UPDATE ${table} SET "${column}" = :nil WHERE id = (SELECT id FROM ${table} LIMIT 1)`,
      { nil: NIL }
    );
    expect(code).toBe(FK_VIOLATION);
  });
});

describe("Intégrité référentielle à la suppression", () => {
  test("une machine référencée par une fiche ne peut pas être supprimée (RESTRICT)", async () => {
    const code = await pgCode(
      `DELETE FROM machines WHERE id = (SELECT "machineId" FROM por_promesh WHERE "machineId" IS NOT NULL LIMIT 1)`
    );
    expect(code).toBe(FK_VIOLATION);
  });

  test("supprimer un contact supprime ses actions et relances (CASCADE)", async () => {
    const t = await sequelize.transaction();
    try {
      const [[c]] = await sequelize.query(
        `SELECT "commercialContactId" AS id FROM commercial_contact_actions LIMIT 1`,
        { transaction: t }
      );
      await sequelize.query(`DELETE FROM commercial_contacts WHERE id = :id`, { transaction: t, replacements: { id: c.id } });
      const [[r]] = await sequelize.query(
        `SELECT count(*)::int AS n FROM commercial_contact_actions WHERE "commercialContactId" = :id`,
        { transaction: t, replacements: { id: c.id } }
      );
      expect(r.n).toBe(0);
    } finally {
      await t.rollback();
    }
  });

  test("supprimer un projet supprime ses actions (CASCADE)", async () => {
    const t = await sequelize.transaction();
    try {
      const [[p]] = await sequelize.query(`SELECT "projectId" AS id FROM project_actions LIMIT 1`, { transaction: t });
      await sequelize.query(`DELETE FROM projects WHERE id = :id`, { transaction: t, replacements: { id: p.id } });
      const [[r]] = await sequelize.query(`SELECT count(*)::int AS n FROM project_actions WHERE "projectId" = :id`, {
        transaction: t,
        replacements: { id: p.id },
      });
      expect(r.n).toBe(0);
    } finally {
      await t.rollback();
    }
  });
});

describe("Contraintes de colonnes (NOT NULL, ENUM)", () => {
  test("users.email NOT NULL", async () => {
    expect(await pgCode(`UPDATE users SET email = NULL WHERE email = 'qa.accueil@qa-probar.com'`)).toBe(NOT_NULL_VIOLATION);
  });

  test("users.role : valeur hors ENUM refusée", async () => {
    expect(await pgCode(`UPDATE users SET role = 'pirate' WHERE email = 'qa.accueil@qa-probar.com'`)).toBe(INVALID_ENUM);
  });

  test("users.role : l'ancien rôle 'user' n'existe plus dans l'ENUM", async () => {
    expect(await pgCode(`UPDATE users SET role = 'user' WHERE email = 'qa.accueil@qa-probar.com'`)).toBe(INVALID_ENUM);
  });

  test("commercial_contacts.createdBy NOT NULL", async () => {
    const code = await pgCode(
      `UPDATE commercial_contacts SET "createdBy" = NULL WHERE id = (SELECT id FROM commercial_contacts LIMIT 1)`
    );
    expect(code).toBe(NOT_NULL_VIOLATION);
  });

  test("machines.typeMachine : valeur hors PROBAR / PROMESH refusée", async () => {
    const code = await pgCode(
      `UPDATE machines SET "typeMachine" = 'AUTRE' WHERE id = (SELECT id FROM machines LIMIT 1)`
    );
    expect(code).toBe(INVALID_ENUM);
  });

  test("por_promesh.status : valeur hors BROUILLON / VALIDE refusée", async () => {
    const code = await pgCode(
      `UPDATE por_promesh SET status = 'ANNULE' WHERE id = (SELECT id FROM por_promesh LIMIT 1)`
    );
    expect(code).toBe(INVALID_ENUM);
  });

  test("project_actions.projectId NOT NULL", async () => {
    const code = await pgCode(
      `UPDATE project_actions SET "projectId" = NULL WHERE id = (SELECT id FROM project_actions LIMIT 1)`
    );
    expect(code).toBe(NOT_NULL_VIOLATION);
  });
});

describe("Transactions", () => {
  const insert = `INSERT INTO machines (id, code, nom, "typeMachine", numero, statut, "createdAt", "updatedAt")
                  VALUES (gen_random_uuid(), :code, 'Machine transaction', 'PROBAR', :numero, 'ACTIVE', now(), now())`;

  test("rollback : une écriture annulée n'est pas visible", async () => {
    const t = await sequelize.transaction();
    await sequelize.query(insert, { transaction: t, replacements: { code: "NFR-TX-ROLLBACK", numero: 981 } });
    await t.rollback();
    expect(await scalar(`SELECT count(*) FROM machines WHERE code = 'NFR-TX-ROLLBACK'`)).toBe(0);
  });

  test("commit : une écriture validée est visible", async () => {
    const t = await sequelize.transaction();
    await sequelize.query(insert, { transaction: t, replacements: { code: "NFR-TX-COMMIT", numero: 982 } });
    await t.commit();
    expect(await scalar(`SELECT count(*) FROM machines WHERE code = 'NFR-TX-COMMIT'`)).toBe(1);
    await sequelize.query(`DELETE FROM machines WHERE code = 'NFR-TX-COMMIT'`);
  });

  test("isolation : une écriture non validée est invisible hors de sa transaction", async () => {
    const t = await sequelize.transaction();
    await sequelize.query(insert, { transaction: t, replacements: { code: "NFR-TX-ISOLATION", numero: 983 } });
    const outside = await scalar(`SELECT count(*) FROM machines WHERE code = 'NFR-TX-ISOLATION'`);
    await t.rollback();
    expect(outside).toBe(0);
  });

  test("atomicité : si une instruction échoue, aucune écriture de la transaction n'est conservée", async () => {
    let failed = false;
    try {
      await sequelize.transaction(async (t) => {
        await sequelize.query(insert, { transaction: t, replacements: { code: "NFR-TX-ATOMIC", numero: 984 } });
        await sequelize.query(insert, { transaction: t, replacements: { code: "NFR-TX-ATOMIC", numero: 985 } });
      });
    } catch (e) {
      failed = true;
    }
    expect(failed).toBe(true);
    expect(await scalar(`SELECT count(*) FROM machines WHERE code = 'NFR-TX-ATOMIC'`)).toBe(0);
  });
});

describe("Validations Sequelize (avant écriture)", () => {
  const User = require("../src/models/User");
  const Machine = require("../src/models/Machine");
  const CommercialContact = require("../src/models/CommercialContact");

  test("User sans e-mail → rejeté", async () => {
    await expect(User.build({ passwordHash: "x", role: "commercial" }).validate()).rejects.toThrow();
  });

  test("User sans hash de mot de passe → rejeté", async () => {
    await expect(User.build({ email: "a@b.tn", role: "commercial" }).validate()).rejects.toThrow();
  });

  test("Machine sans type → rejetée", async () => {
    await expect(Machine.build({ code: "X-1", nom: "X", numero: 1, statut: "ACTIVE" }).validate()).rejects.toThrow();
  });

  test("CommercialContact sans créateur → rejeté", async () => {
    await expect(
      CommercialContact.build({ nom: "A", prenom: "B", telephone: "1", typeClient: "Tuteur" }).validate()
    ).rejects.toThrow();
  });
});

describe("Cohérence des données existantes", () => {
  test("aucune fiche POR validée n'est déverrouillée", async () => {
    expect(await scalar(`SELECT count(*) FROM por_promesh WHERE status = 'VALIDE' AND "isLocked" IS NOT TRUE`)).toBe(0);
  });

  test("aucun brouillon POR n'est verrouillé", async () => {
    expect(await scalar(`SELECT count(*) FROM por_promesh WHERE status = 'BROUILLON' AND "isLocked" IS TRUE`)).toBe(0);
  });

  test("toute fiche POR validée porte une date de validation", async () => {
    expect(await scalar(`SELECT count(*) FROM por_promesh WHERE status = 'VALIDE' AND "validatedAt" IS NULL`)).toBe(0);
  });

  test("aucune action de projet orpheline", async () => {
    expect(
      await scalar(`SELECT count(*) FROM project_actions a LEFT JOIN projects p ON p.id = a."projectId" WHERE p.id IS NULL`)
    ).toBe(0);
  });

  test("tout auteur d'action de projet existe dans les utilisateurs", async () => {
    expect(
      await scalar(`SELECT count(*) FROM project_actions a LEFT JOIN users u ON u.id = a."createdBy" WHERE u.id IS NULL`)
    ).toBe(0);
  });

  test("tout ingénieur référencé par un projet existe", async () => {
    expect(
      await scalar(
        `SELECT count(*) FROM projects p LEFT JOIN engineers e ON e.id = p."engineerId" WHERE p."engineerId" IS NOT NULL AND e.id IS NULL`
      )
    ).toBe(0);
  });

  test("tout architecte référencé par un projet existe", async () => {
    expect(
      await scalar(
        `SELECT count(*) FROM projects p LEFT JOIN architects a ON a.id = p."architectId" WHERE p."architectId" IS NOT NULL AND a.id IS NULL`
      )
    ).toBe(0);
  });

  test("tout contact affecté l'est à un utilisateur de rôle commercial", async () => {
    expect(
      await scalar(
        `SELECT count(*) FROM commercial_contacts c JOIN users u ON u.id = c."commercialId" WHERE u.role <> 'commercial'`
      )
    ).toBe(0);
  });

  test("tout contact affecté porte l'auteur et la date de l'affectation", async () => {
    expect(
      await scalar(
        `SELECT count(*) FROM commercial_contacts WHERE "commercialId" IS NOT NULL AND ("assignedBy" IS NULL OR "assignedAt" IS NULL)`
      )
    ).toBe(0);
  });

  test("toute fiche rattachée à une machine référence une machine de la bonne famille (POR → PROMESH)", async () => {
    expect(
      await scalar(
        `SELECT count(*) FROM por_promesh f JOIN machines m ON m.id = f."machineId" WHERE m."typeMachine" <> 'PROMESH'`
      )
    ).toBe(0);
  });

  test("aucun e-mail d'utilisateur en double (insensible à la casse)", async () => {
    expect(
      await scalar(`SELECT count(*) FROM (SELECT lower(email) FROM users GROUP BY 1 HAVING count(*) > 1) d`)
    ).toBe(0);
  });

  test("la contrainte d'unicité users.email n'est déclarée qu'une seule fois", async () => {
    expect(
      await scalar(`SELECT count(*) FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'u'`)
    ).toBe(1);
  });
});
