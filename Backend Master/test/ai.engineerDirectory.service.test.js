"use strict";

// engineerDirectory.service (SQL simulé) : même requête que GET /engineers/all
// (noms nettoyés, vides exclus, tri alphabétique, { id, name }), total réel,
// périmètre des projets pour « l'ingénieur du projet X », aucune valeur
// utilisateur concaténée au SQL.

jest.mock("../src/db", () => ({ sequelize: { query: jest.fn() } }));

const { sequelize } = require("../src/db");
const engineerDirectory = require("../src/modules/projects/services/engineerDirectory.service");

beforeEach(() => sequelize.query.mockReset());

test("liste : { id, name } seulement, noms vides exclus, tri alphabétique, total réel", async () => {
  sequelize.query.mockResolvedValueOnce([{ total: 118 }]).mockResolvedValueOnce([{ id: "e1", name: "Amine" }]);
  const r = await engineerDirectory.listEngineers({});
  expect(r).toEqual({ items: [{ id: "e1", name: "Amine" }], total: 118, offset: 0, truncated: true });
  const [sql, opts] = sequelize.query.mock.calls[1];
  expect(sql).toMatch(/SELECT id, TRIM\(name\) AS name FROM engineers/);
  expect(sql).toMatch(/TRIM\(name\) <> ''/);
  expect(sql).toMatch(/ORDER BY LOWER\(TRIM\(name\)\) ASC/);
  expect(sql).not.toMatch(/email|phone/);
  expect(opts.replacements.limit).toBe(200);
});

test("limite bornée à 1000 ; recherche passée en paramètre, jamais dans le SQL", async () => {
  sequelize.query.mockResolvedValue([{ total: 0 }]);
  const evil = "x'; DROP TABLE engineers; --";
  await engineerDirectory.listEngineers({ search: evil, limit: 99999 });
  for (const [sql, opts] of sequelize.query.mock.calls) {
    expect(sql).not.toContain("DROP TABLE");
    expect(opts.replacements.search).toBe(`%${evil.toLowerCase()}%`);
  }
  expect(sequelize.query.mock.calls[1][1].replacements.limit).toBe(1000);
});

test("ingénieur d'un projet : périmètre ownerId appliqué, lien engineerId puis repli sur le nom saisi", async () => {
  sequelize.query.mockResolvedValueOnce([
    { projectId: "p1", projectName: "Sfax Port", engineerId: "e3", engineerName: "Hamza Zahrouni" },
    { projectId: "p2", projectName: "Sfax Port 2", engineerId: null, engineerName: null },
  ]);
  const r = await engineerDirectory.findProjectEngineers({ projectName: "Sfax Port" }, { ownerId: "u-1" });
  expect(r).toEqual({
    projectName: "Sfax Port",
    scope: "mine",
    matches: [
      { projectId: "p1", projectName: "Sfax Port", engineer: { id: "e3", name: "Hamza Zahrouni" } },
      { projectId: "p2", projectName: "Sfax Port 2", engineer: null },
    ],
  });
  const [sql, opts] = sequelize.query.mock.calls[0];
  expect(sql).toMatch(/p\."ownerId" = :scopeOwnerId/);
  expect(sql).toMatch(/COALESCE\(TRIM\(e\.name\), NULLIF\(TRIM\(p\."ingenieurResponsable"\), ''\)\)/);
  expect(opts.replacements).toMatchObject({ scopeOwnerId: "u-1", projectName: "%sfax port%" });
});

test("nom de projet manquant : refusé ; erreur PostgreSQL propagée", async () => {
  await expect(engineerDirectory.findProjectEngineers({ projectName: " " })).rejects.toMatchObject({ status: 400 });
  sequelize.query.mockRejectedValueOnce(new Error("connection refused"));
  await expect(engineerDirectory.listEngineers({})).rejects.toThrow(/connection refused/);
});
