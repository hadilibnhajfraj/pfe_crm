"use strict";

// Parité de périmètre entre `list_projects` et `get_project_statistics` :
// pour un même utilisateur, les deux outils doivent voir exactement les mêmes
// propriétaires de projets. AUCUNE base : les services sont simulés pour les
// outils, et la base est simulée pour le service de statistiques (les requêtes
// SQL émises sont inspectées, jamais exécutées).

jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn(async () => ({ data: [] })) }));

const mockQuery = jest.fn();
jest.mock("../src/db", () => ({ sequelize: { query: (...args) => mockQuery(...args) } }));

const projectService = require("../src/modules/projects/services/project.service");
const statistics = require("../src/modules/projects/services/projectStatistics.service");
const { createListProjectsTool } = require("../src/ai/mcp/tools/projects/listProjectsTool");
const { createGetProjectStatisticsTool } = require("../src/ai/mcp/tools/projects/getProjectStatisticsTool");

const ME = "ee815d2c-3a83-57fa-9570-76693b29bf69";
const SOMEONE_ELSE = "68d9ded1-f1e5-566e-8a8e-e9e202e0066e";
const NON_ADMIN_ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat"];
const ADMIN_ROLES = ["admin", "superadmin", "superadmin2"];

// Propriétaire imposé par chaque outil, tel qu'il arrive au service.
async function ownerSeenBy(role, listInput = {}, statsInput = {}) {
  projectService.listProjects.mockClear();
  const spy = jest.spyOn(statistics, "getProjectStatistics").mockResolvedValue({});
  const actingUser = { id: ME, role, email: "x@exemple.tn" };
  await createListProjectsTool().execute(listInput, { actingUser });
  await createGetProjectStatisticsTool().execute(statsInput, { actingUser });
  const [query, userId] = projectService.listProjects.mock.calls[0];
  const [, scope] = spy.mock.calls[0];
  spy.mockRestore();
  // list_projects : filtre effectif = userId si mine, sinon ownerId/userId demandé, sinon aucun.
  const listOwner = query.mine ? userId : query.ownerId || query.userId || null;
  return { listOwner, statsOwner: scope.ownerId };
}

describe("rôles non administrateurs — les deux outils sont limités au même propriétaire", () => {
  test.each(NON_ADMIN_ROLES)("%s : ses propres projets, pour les deux outils", async (role) => {
    expect(await ownerSeenBy(role)).toEqual({ listOwner: ME, statsOwner: ME });
  });

  test.each(NON_ADMIN_ROLES)("%s : un périmètre plus large demandé en entrée est ignoré", async (role) => {
    const widened = await ownerSeenBy(role, { mine: false, ownerId: SOMEONE_ELSE, userId: SOMEONE_ELSE }, { mine: false });
    expect(widened).toEqual({ listOwner: ME, statsOwner: ME });
  });

  test("get_project_statistics n'accepte aucun champ de propriétaire en entrée", () => {
    const { error } = createGetProjectStatisticsTool().inputSchema.validate({ ownerId: SOMEONE_ELSE });
    expect(error).toBeDefined();
  });
});

describe("rôles administrateurs — même vue transverse pour les deux outils", () => {
  test.each(ADMIN_ROLES)("%s : aucun filtre de propriétaire par défaut", async (role) => {
    expect(await ownerSeenBy(role)).toEqual({ listOwner: null, statsOwner: null });
  });

  test.each(ADMIN_ROLES)("%s : « mes projets » restreint les deux outils à l'administrateur", async (role) => {
    expect(await ownerSeenBy(role, { mine: true }, { mine: true })).toEqual({ listOwner: ME, statsOwner: ME });
  });
});

describe("service de statistiques — aucune agrégation hors périmètre", () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue([{ total: 0, archived: 0, withDimension: 0, groupCount: 0, n: 0 }]);
  });

  const issued = () => mockQuery.mock.calls.map(([sql, options]) => ({ sql: String(sql), replacements: (options && options.replacements) || {} }));

  test.each([null, ...statistics.GROUP_BY_VALUES])("groupBy=%s : chaque requête porte le filtre de propriétaire", async (groupBy) => {
    await statistics.getProjectStatistics({ groupBy }, { ownerId: ME });
    const queries = issued();
    expect(queries.length).toBeGreaterThan(0);
    for (const q of queries) {
      expect(q.sql).toContain('p."ownerId" = :scopeOwnerId');
      expect(q.replacements.scopeOwnerId).toBe(ME);
    }
  });

  test("les filtres libres (famille, statut, période) s'ajoutent au périmètre, ils ne le remplacent pas", async () => {
    await statistics.getProjectStatistics({ groupBy: "status", productFamily: "PROBAR", statut: "Gagné", from: "2026-04-01", to: "2026-09-30" }, { ownerId: ME });
    for (const q of issued()) {
      expect(q.sql).toContain('p."ownerId" = :scopeOwnerId');
      expect(q.sql).toMatch(/\bAND\b/);
      expect(q.sql).not.toMatch(/\bOR\b/);
    }
  });

  test("périmètre restreint : pas de décompte des ingénieurs sans projet (réservé à la vue complète)", async () => {
    const scoped = await statistics.getProjectStatistics({ groupBy: "engineer" }, { ownerId: ME });
    expect(scoped.engineersWithoutProjects).toBeUndefined();
    expect(scoped.scope).toBe("mine");
    expect(issued().some((q) => /FROM engineers/.test(q.sql))).toBe(false);
  });

  test("vue complète (administrateur) : aucun filtre de propriétaire", async () => {
    const all = await statistics.getProjectStatistics({ groupBy: "status" }, { ownerId: null });
    expect(all.scope).toBe("all");
    for (const q of issued()) expect(q.sql).not.toContain(":scopeOwnerId");
  });

  test("différence connue entre les deux outils : les statistiques incluent les projets archivés par défaut", async () => {
    const result = await statistics.getProjectStatistics({}, { ownerId: ME });
    expect(result.includeArchived).toBe(true);
    expect(issued()[0].sql).not.toMatch(/"isArchived", false\) = false\s*$/);
  });
});
