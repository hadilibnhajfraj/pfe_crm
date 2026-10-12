"use strict";

// Analytique CRM — services statistiques (SQL simulé) et Tools MCP (VRAI
// McpServer : PermissionManager + validation Joi + périmètre décidé par le
// Tool). Vérifie : périmètre par rôle, aucune valeur utilisateur dans le SQL,
// archivés inclus par défaut, erreurs PostgreSQL propagées, repli machine.

jest.mock("../src/db", () => ({ sequelize: { query: jest.fn() } }));
jest.mock("../src/modules/projects/services/project.service", () => ({ listProjects: jest.fn() }));

const Joi = require("joi");
const { sequelize } = require("../src/db");
const projectStats = require("../src/modules/projects/services/projectStatistics.service");
const contactStats = require("../src/modules/commercial-contacts/services/commercialContactStatistics.service");
const industrialStats = require("../src/modules/industrial-records/services/industrialStatistics.service");

const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { ToolRegistry } = require("../src/ai/tools");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { createMcpToolAdapters } = require("../src/ai/langchain/tools");
const { createGetProjectStatisticsTool } = require("../src/ai/mcp/tools/projects/getProjectStatisticsTool");
const { createGetCommercialContactStatisticsTool } = require("../src/ai/mcp/tools/commercialContacts/getCommercialContactStatisticsTool");
const { createGetIndustrialStatisticsTool } = require("../src/ai/mcp/tools/industrial/getIndustrialStatisticsTool");

const ADMIN = { id: "11111111-1111-4111-8111-111111111111", role: "admin" };
const COMMERCIAL = { id: "22222222-2222-4222-8222-222222222222", role: "commercial" };
const SEDENTAIRE = { id: "33333333-3333-4333-8333-333333333333", role: "commercial_sedentaire" };
const LOGISTIQUE = { id: "44444444-4444-4444-8444-444444444444", role: "responsable_logistique_achat" };

// Réponses SQL simulées : totaux, puis groupes (dans l'ordre des appels).
function queueSql(...responses) {
  sequelize.query.mockReset();
  for (const r of responses) sequelize.query.mockResolvedValueOnce(r);
}
const sqlCall = (i) => sequelize.query.mock.calls[i];

describe("projectStatistics.service", () => {
  test("par ingénieur, périmètre complet : lien engineerId + repli sur le nom saisi, archivés INCLUS par défaut", async () => {
    queueSql([{ total: 253, withDimension: 200, groupCount: 120 }], [{ key: "e1", label: "Hamza", count: 8 }], [{ n: 23 }]);
    const r = await projectStats.getProjectStatistics({ groupBy: "engineer" }, { ownerId: null });

    expect(r).toMatchObject({ scope: "all", includeArchived: true, totalProjects: 253, withDimension: 200, withoutDimension: 53, groupCount: 120, truncated: true, engineersWithoutProjects: 23 });
    const [sql, opts] = sqlCall(1);
    expect(sql).toMatch(/COALESCE\(p\."engineerId"::text, 'name:' \|\| LOWER\(TRIM\(p\."ingenieurResponsable"\)\)\)/);
    expect(sql).toMatch(/LEFT JOIN engineers e ON e\.id = p\."engineerId"/);
    expect(sql).not.toMatch(/isArchived/);
    expect(opts.replacements.limit).toBe(10);
  });

  test("périmètre « mes projets » : ownerId en paramètre, pas de décompte global des ingénieurs sans projet", async () => {
    queueSql([{ total: 78, withDimension: 70, groupCount: 30 }], []);
    const r = await projectStats.getProjectStatistics({ groupBy: "engineer", includeArchived: false }, { ownerId: "u-1" });
    expect(r.scope).toBe("mine");
    expect(r.engineersWithoutProjects).toBeUndefined();
    expect(sequelize.query).toHaveBeenCalledTimes(2);
    const [sql, opts] = sqlCall(0);
    expect(sql).toMatch(/p\."ownerId" = :scopeOwnerId/);
    expect(sql).toMatch(/COALESCE\(p\."isArchived", false\) = false/);
    expect(opts.replacements.scopeOwnerId).toBe("u-1");
  });

  test("aucune valeur de l'utilisateur n'est concaténée au SQL (injection)", async () => {
    queueSql([{ total: 0, withDimension: 0, groupCount: 0 }], []);
    const evil = "x'); DROP TABLE projects; --";
    await projectStats.getProjectStatistics({ groupBy: "status", statut: evil, productFamily: "probar" }, { ownerId: null });
    for (const [sql, opts] of sequelize.query.mock.calls) {
      expect(sql).not.toContain("DROP TABLE");
      expect(opts.replacements.statut).toBe(evil);
    }
    expect(sqlCall(0)[1].replacements.productFamily).toBe("PROBAR");
  });

  test("dimension inconnue refusée ; limite bornée à 50 (données volumineuses) ; tri ascendant pour « le moins »", async () => {
    await expect(projectStats.getProjectStatistics({ groupBy: "password" })).rejects.toMatchObject({ status: 400 });
    queueSql([{ total: 1000, withDimension: 1000, groupCount: 400 }], []);
    await projectStats.getProjectStatistics({ groupBy: "client", limit: 5000, order: "asc" }, { ownerId: null });
    expect(sqlCall(1)[0]).toMatch(/ORDER BY count ASC/);
    expect(sqlCall(1)[1].replacements.limit).toBe(50);
  });

  test("total seul (sans dimension) : nombre de projets et d'archivés", async () => {
    queueSql([{ total: 253, archived: 68 }]);
    await expect(projectStats.getProjectStatistics({}, { ownerId: null })).resolves.toMatchObject({ totalProjects: 253, archivedProjects: 68, groups: [] });
  });

  test("erreur PostgreSQL : propagée telle quelle (jamais un résultat vide présenté comme réel)", async () => {
    sequelize.query.mockReset();
    sequelize.query.mockRejectedValueOnce(new Error('relation "engineers" does not exist'));
    await expect(projectStats.getProjectStatistics({ groupBy: "engineer" }, { ownerId: null })).rejects.toThrow(/does not exist/);
  });
});

describe("commercialContactStatistics.service", () => {
  test("contacts par commercial ASSIGNÉ, périmètre createdBy pour un non-admin", async () => {
    queueSql([{ total: 40, withDimension: 40, groupCount: 2 }], [{ key: "c1", label: "Sara", count: 30 }]);
    const r = await contactStats.getCommercialContactStatistics({ metric: "contacts", groupBy: "commercial" }, { userId: "u-2" });
    expect(r).toMatchObject({ metric: "contacts", scope: "mine", total: 40 });
    expect(sqlCall(0)[0]).toMatch(/cc\."createdBy" = :scopeUserId/);
    expect(sqlCall(1)[0]).toMatch(/cc\."commercialId"::text/);
  });

  test("relances sur une période : jointure au contact (périmètre du contact), dates en paramètres", async () => {
    queueSql([{ total: 12 }]);
    await contactStats.getCommercialContactStatistics({ metric: "relances", from: "2026-09-01T00:00:00Z", to: "2026-09-30T00:00:00Z" }, { userId: "u-2" });
    const [sql, opts] = sqlCall(0);
    expect(sql).toMatch(/JOIN commercial_contacts cc ON cc\.id = r\."commercialContactId"/);
    expect(sql).toMatch(/r\."createdAt" >= :fromDate/);
    expect(opts.replacements.fromDate).toBeInstanceOf(Date);
  });

  test("contacts jamais relancés : NOT EXISTS + liste bornée", async () => {
    queueSql([{ total: 307 }], [{ id: "1", prenom: "Ali", nom: "Ben" }]);
    const r = await contactStats.getCommercialContactStatistics({ metric: "contacts_without_relance", limit: 1 }, { userId: null });
    expect(r).toMatchObject({ total: 307, truncated: true });
    expect(sqlCall(0)[0]).toMatch(/NOT EXISTS \(SELECT 1 FROM commercial_contact_relances r/);
  });

  test("métrique ou dimension inconnue refusée", async () => {
    await expect(contactStats.getCommercialContactStatistics({ metric: "passwords" })).rejects.toMatchObject({ status: 400 });
    await expect(contactStats.getCommercialContactStatistics({ metric: "contacts", groupBy: "engineer" })).rejects.toMatchObject({ status: 400 });
  });
});

describe("industrialStatistics.service", () => {
  beforeEach(() => industrialStats._resetMachineIdColumnCache());

  test("par machine : lien machineId → machines + repli libellé ; périmètre createdBy", async () => {
    queueSql([{ exists: 1 }], [{ total: 24, withDimension: 21, groupCount: 3 }], [{ key: "m1", label: "PROBAR-01 Machine PROBAR 1", count: 13, quantity: 11000 }]);
    const r = await industrialStats.getIndustrialStatistics({ groupBy: "machine", module: "probar" }, { createdBy: "u-4" });
    expect(r).toMatchObject({ scope: "mine", totalRecords: 24, withoutDimension: 3 });
    expect(sqlCall(2)[0]).toMatch(/LEFT JOIN machines m ON m\.id = ir\."machineId"/);
    expect(sqlCall(1)[0]).toMatch(/ir\."createdBy" = :scopeCreatedBy/);
    expect(sqlCall(1)[1].replacements.module).toBe("probar");
  });

  test("colonne machineId absente (migration non appliquée) : repli sur le libellé saisi, sans erreur", async () => {
    queueSql([], [{ total: 5, withDimension: 5, groupCount: 1 }], [{ key: "name:m1", label: "M1", count: 5, quantity: 0 }]);
    await industrialStats.getIndustrialStatistics({ groupBy: "machine" }, { createdBy: null });
    expect(sqlCall(2)[0]).not.toMatch(/machineId/);
  });
});

// ── Tools MCP : périmètre et droits décidés côté serveur ────────────────────
jest.spyOn(projectStats, "getProjectStatistics");
jest.spyOn(contactStats, "getCommercialContactStatistics");
jest.spyOn(industrialStats, "getIndustrialStatistics");

function adaptersFor(user) {
  const registry = new ToolRegistry();
  [createGetProjectStatisticsTool(), createGetCommercialContactStatisticsTool(), createGetIndustrialStatisticsTool()].forEach((t) => registry.register(t));
  const server = new McpServer({ name: "t", version: "0", toolRegistry: registry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  return Object.fromEntries(createMcpToolAdapters({ mcpServer: server, actingUser: user }).map((a) => [a.name, a]));
}

describe("get_project_statistics — même périmètre que list_projects", () => {
  beforeEach(() => projectStats.getProjectStatistics.mockReset().mockResolvedValue({ totalProjects: 1, groups: [] }));

  test("admin : tous les projets ; admin + mine : ses projets", async () => {
    const tools = adaptersFor(ADMIN);
    await tools.get_project_statistics.invoke({ groupBy: "engineer" });
    await tools.get_project_statistics.invoke({ groupBy: "engineer", mine: true });
    expect(projectStats.getProjectStatistics.mock.calls[0][1]).toEqual({ ownerId: null });
    expect(projectStats.getProjectStatistics.mock.calls[1][1]).toEqual({ ownerId: ADMIN.id });
  });

  test("commercial : TOUJOURS ses projets, même en demandant « mine: false » ou un ownerId arbitraire (champ écarté par la validation)", async () => {
    const tools = adaptersFor(COMMERCIAL);
    await tools.get_project_statistics.invoke({ groupBy: "engineer", mine: false });
    await tools.get_project_statistics.invoke({ groupBy: "engineer", ownerId: ADMIN.id });
    expect(projectStats.getProjectStatistics.mock.calls[0][1]).toEqual({ ownerId: COMMERCIAL.id });
    expect(projectStats.getProjectStatistics.mock.calls[1][1]).toEqual({ ownerId: COMMERCIAL.id });
    expect(projectStats.getProjectStatistics.mock.calls[1][0]).not.toHaveProperty("ownerId");
  });

  test("dimension hors liste refusée par la validation", async () => {
    await expect(adaptersFor(ADMIN).get_project_statistics.invoke({ groupBy: "users" })).rejects.toThrow(/Invalid input/);
  });
});

describe("get_commercial_contact_statistics — mêmes rôles que get_my_commercial_contacts", () => {
  beforeEach(() => contactStats.getCommercialContactStatistics.mockReset().mockResolvedValue({ total: 0, groups: [] }));

  test("commercial terrain : refusé par le PermissionManager (code PERMISSION_DENIED)", async () => {
    await expect(adaptersFor(COMMERCIAL).get_commercial_contact_statistics.invoke({ metric: "contacts" })).rejects.toMatchObject({ code: -32002 });
    expect(contactStats.getCommercialContactStatistics).not.toHaveBeenCalled();
  });

  test("commercial sédentaire : ses contacts ; admin : tous", async () => {
    await adaptersFor(SEDENTAIRE).get_commercial_contact_statistics.invoke({ metric: "relances" });
    await adaptersFor(ADMIN).get_commercial_contact_statistics.invoke({ metric: "relances" });
    expect(contactStats.getCommercialContactStatistics.mock.calls[0][1]).toEqual({ userId: SEDENTAIRE.id });
    expect(contactStats.getCommercialContactStatistics.mock.calls[1][1]).toEqual({ userId: null });
  });
});

describe("get_industrial_statistics — mêmes rôles que list_industrial_records", () => {
  beforeEach(() => industrialStats.getIndustrialStatistics.mockReset().mockResolvedValue({ totalRecords: 0, groups: [] }));

  test("responsable logistique : ses fiches ; admin : toutes ; commercial : refusé", async () => {
    await adaptersFor(LOGISTIQUE).get_industrial_statistics.invoke({ groupBy: "machine" });
    await adaptersFor(ADMIN).get_industrial_statistics.invoke({ groupBy: "machine" });
    expect(industrialStats.getIndustrialStatistics.mock.calls[0][1]).toEqual({ createdBy: LOGISTIQUE.id });
    expect(industrialStats.getIndustrialStatistics.mock.calls[1][1]).toEqual({ createdBy: null });
    await expect(adaptersFor(COMMERCIAL).get_industrial_statistics.invoke({ groupBy: "machine" })).rejects.toMatchObject({ code: -32002 });
  });

  test("schéma d'entrée : seulement des valeurs énumérées", () => {
    const schema = createGetIndustrialStatisticsTool().inputSchema;
    expect(Joi.isSchema(schema)).toBe(true);
    expect(schema.validate({ module: "por_promesh" }).error).toBeTruthy();
  });
});
