"use strict";

// Migrations du vocabulaire des rôles v2, testées sur un queryInterface
// simulé (aucune base) : ordre exact des requêtes, idempotence, refus d'un
// état inattendu, absence de tout UPDATE sur les données.

const renameRoles = require("../src/migrations/20260929090000-rename-user-roles");
const assignedBy = require("../src/migrations/20260929090100-add-assigned-by-to-commercial-contacts");

function fakeQueryInterface({ enumLabels = [], columns = {} } = {}) {
  const calls = [];
  const sequelize = {
    QueryTypes: { SELECT: "SELECT" },
    transaction: async (fn) => fn("tx"),
    query: jest.fn(async (sql) => {
      calls.push(sql.replace(/\s+/g, " ").trim());
      if (/FROM pg_type/.test(sql)) return enumLabels.map((enumlabel) => ({ enumlabel }));
      return [[], 0];
    }),
  };
  return {
    sequelize,
    calls,
    describeTable: jest.fn(async () => columns),
    addColumn: jest.fn(async (t, c) => calls.push(`ADD COLUMN ${t}.${c}`)),
    removeColumn: jest.fn(async (t, c) => calls.push(`REMOVE COLUMN ${t}.${c}`)),
  };
}

const V1 = ["user", "commercial", "accueil", "admin", "superadmin", "responsable_logistique_achat", "superadmin2"];
const V2 = ["commercial", "commercial_sedentaire", "accueil", "admin", "superadmin", "responsable_logistique_achat", "superadmin2"];

describe("20260929090000-rename-user-roles", () => {
  test("up : RENAME VALUE commercial → commercial_sedentaire PUIS user → commercial, puis DEFAULT — aucun UPDATE", async () => {
    const qi = fakeQueryInterface({ enumLabels: V1 });
    await renameRoles.up(qi);
    const ddl = qi.calls.filter((c) => !/FROM pg_type/.test(c));
    expect(ddl).toEqual([
      "ALTER TYPE public.enum_users_role RENAME VALUE 'commercial' TO 'commercial_sedentaire'",
      "ALTER TYPE public.enum_users_role RENAME VALUE 'user' TO 'commercial'",
      "ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'commercial'::public.enum_users_role",
    ]);
    expect(qi.calls.some((c) => /^UPDATE/i.test(c))).toBe(false);
  });

  test("up idempotent : ENUM déjà en v2 → aucune modification", async () => {
    const qi = fakeQueryInterface({ enumLabels: V2 });
    await renameRoles.up(qi);
    expect(qi.calls.filter((c) => !/FROM pg_type/.test(c))).toEqual([]);
  });

  test("up refuse un état inattendu (ex. user + commercial_sedentaire) sans rien modifier", async () => {
    const qi = fakeQueryInterface({ enumLabels: ["user", "commercial", "commercial_sedentaire"] });
    await expect(renameRoles.up(qi)).rejects.toThrow(/État inattendu/);
    expect(qi.calls.filter((c) => !/FROM pg_type/.test(c))).toEqual([]);
  });

  test("down : renommages inverses dans l'ordre inverse, DEFAULT 'user'", async () => {
    const qi = fakeQueryInterface({ enumLabels: V2 });
    await renameRoles.down(qi);
    expect(qi.calls.filter((c) => !/FROM pg_type/.test(c))).toEqual([
      "ALTER TYPE public.enum_users_role RENAME VALUE 'commercial' TO 'user'",
      "ALTER TYPE public.enum_users_role RENAME VALUE 'commercial_sedentaire' TO 'commercial'",
      "ALTER TABLE public.users ALTER COLUMN role SET DEFAULT 'user'::public.enum_users_role",
    ]);
  });

  test("down idempotent : ENUM déjà en v1 → aucune modification", async () => {
    const qi = fakeQueryInterface({ enumLabels: V1 });
    await renameRoles.down(qi);
    expect(qi.calls.filter((c) => !/FROM pg_type/.test(c))).toEqual([]);
  });
});

describe("20260929090100-add-assigned-by-to-commercial-contacts", () => {
  const Sequelize = { UUID: "UUID", DATE: "DATE" };

  test("up : ajoute assignedBy (FK users, SET NULL) + assignedAt, nullable, SANS backfill", async () => {
    const qi = fakeQueryInterface({ columns: { id: {}, commercialId: {} } });
    await assignedBy.up(qi, Sequelize);
    expect(qi.addColumn).toHaveBeenCalledWith(
      "commercial_contacts",
      "assignedBy",
      expect.objectContaining({ allowNull: true, references: { model: "users", key: "id" }, onDelete: "SET NULL" }),
      expect.anything()
    );
    expect(qi.addColumn).toHaveBeenCalledWith("commercial_contacts", "assignedAt", expect.objectContaining({ allowNull: true }), expect.anything());
    // Les 485 affectations existantes ne sont jamais touchées.
    expect(qi.calls.some((c) => /UPDATE/i.test(c))).toBe(false);
    expect(qi.calls.some((c) => /commercialId/.test(c))).toBe(false);
  });

  test("up idempotent : colonnes déjà présentes → aucun addColumn", async () => {
    const qi = fakeQueryInterface({ columns: { assignedBy: {}, assignedAt: {} } });
    await assignedBy.up(qi, Sequelize);
    expect(qi.addColumn).not.toHaveBeenCalled();
  });

  test("down : retire les deux colonnes et l'index", async () => {
    const qi = fakeQueryInterface({ columns: { assignedBy: {}, assignedAt: {} } });
    await assignedBy.down(qi);
    expect(qi.removeColumn).toHaveBeenCalledWith("commercial_contacts", "assignedAt", expect.anything());
    expect(qi.removeColumn).toHaveBeenCalledWith("commercial_contacts", "assignedBy", expect.anything());
    expect(qi.calls).toContain("DROP INDEX IF EXISTS commercial_contacts_assigned_by");
  });
});
