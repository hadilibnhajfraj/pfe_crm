"use strict";

// Règle partagée de validation des identifiants UUID du MCP (src/ai/mcp/uuidSchema.js).
// AUCUNE base n'est ouverte : schémas Joi, serveur MCP en mémoire, lecture du
// code source en texte.

const fs = require("fs");
const path = require("path");
const Joi = require("joi");
const { uuidString, UUID_VERSIONS } = require("../src/ai/mcp/uuidSchema");
const { ValidationManager } = require("../src/ai/mcp/validationManager");
const { PermissionManager } = require("../src/ai/mcp/permissionManager");
const { ErrorHandler } = require("../src/ai/mcp/errorHandler");
const { McpServer } = require("../src/ai/mcp/server/mcpServer");
const { McpError } = require("../src/ai/mcp/errors");
const { ErrorCodes } = require("../src/ai/mcp/jsonRpc");
const { ToolRegistry, ServiceBackedTool } = require("../src/ai/tools");
const { stableUuid } = require("../scripts/demo-seeder/lib/random");

const V4 = "792595bb-5a94-4e63-ada6-96658c792c3e";
// Identifiant tel que le générateur du lot de démonstration les produit (version 5).
const V5 = stableUuid("demo-powerbi-v1", "users", "commercial-01");
const MCP_DIR = path.join(__dirname, "..", "src", "ai", "mcp");
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));
const accepts = (value) => !uuidString().validate(value).error;

describe("uuidString — forme acceptée", () => {
  test("le générateur de démonstration produit bien des UUID de version 5", () => {
    expect(V5).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  test.each([
    ["version 4 (gen_random_uuid, Sequelize.UUIDV4)", V4],
    ["version 5 (lot de démonstration)", V5],
    ["version 1", "c232ab00-9414-11ec-b3c8-9f6bdeced846"],
    ["version 7", "018f4e5a-7b3c-7a1e-8f2d-3c4b5a697887"],
    ["majuscules", V5.toUpperCase()],
  ])("accepte un UUID %s", (_label, value) => {
    expect(accepts(value)).toBe(true);
  });

  test.each([
    ["une chaîne quelconque", "not-a-uuid"],
    ["une tentative d'injection", "1 OR 1=1"],
    ["un UUID sans tirets", V4.replace(/-/g, "")],
    ["un UUID entre accolades", `{${V4}}`],
    ["un UUID entouré d'espaces", ` ${V4} `],
    ["un UUID tronqué", V4.slice(0, 35)],
    ["une version 0", "792595bb-5a94-0e63-ada6-96658c792c3e"],
    ["une variante hors RFC 4122", "792595bb-5a94-4e63-0da6-96658c792c3e"],
    ["un caractère non hexadécimal", "792595bb-5a94-4e63-ada6-96658c792c3z"],
    ["une chaîne vide", ""],
    ["un nombre", 42],
    ["un objet", { id: V4 }],
  ])("refuse %s", (_label, value) => {
    expect(accepts(value)).toBe(false);
  });

  test("garde le type d'erreur Joi d'origine (string.guid)", () => {
    expect(uuidString().validate("abc").error.details[0].type).toBe("string.guid");
  });

  test("couvre les versions 4 et 5 utilisées par le schéma", () => {
    expect(UUID_VERSIONS).toEqual(expect.arrayContaining(["uuidv4", "uuidv5"]));
  });
});

describe("ValidationManager.validateActingUser — identifiant", () => {
  const vm = new ValidationManager();

  test("accepte un compte dont l'identifiant est un UUID de version 5", () => {
    expect(() => vm.validateActingUser({ id: V5, role: "commercial", email: "demo.commercial01@cbi_tunisia.com" })).not.toThrow();
  });

  test("accepte toujours un compte en version 4", () => {
    expect(() => vm.validateActingUser({ id: V4, role: "superadmin2" })).not.toThrow();
  });

  test.each([["non-UUID", "not-a-uuid"], ["vide", ""], ["numérique", 12]])("refuse toujours un identifiant %s", (_label, id) => {
    expect(() => vm.validateActingUser({ id, role: "admin" })).toThrow(McpError);
  });

  test("refuse toujours un utilisateur sans identifiant ou sans rôle", () => {
    expect(() => vm.validateActingUser({ role: "admin" })).toThrow(McpError);
    expect(() => vm.validateActingUser({ id: V5 })).toThrow(McpError);
  });
});

describe("contrôle d'accès — inchangé pour un identifiant de version 5", () => {
  const ran = jest.fn(async (input) => ({ echoed: input.targetId }));
  const server = () => {
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      new ServiceBackedTool({
        name: "admin_only_tool",
        description: "Outil factice réservé au rôle admin.",
        inputSchema: Joi.object({ targetId: uuidString().required() }),
        requiredRoles: ["admin"],
        run: ran,
      })
    );
    return new McpServer({ name: "test", version: "0.0.0", toolRegistry, permissionManager: new PermissionManager(), validationManager: new ValidationManager(), errorHandler: new ErrorHandler() });
  };
  const call = (actingUser, args = { targetId: V5 }) =>
    server().handleMessage({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "admin_only_tool", arguments: args, ...(actingUser ? { actingUser } : {}) } });

  beforeEach(() => ran.mockClear());

  test("rôle insuffisant : PERMISSION_DENIED, l'outil ne s'exécute pas", async () => {
    const response = await call({ id: V5, role: "commercial" });
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect(ran).not.toHaveBeenCalled();
  });

  test("aucun utilisateur : PERMISSION_DENIED", async () => {
    const response = await call(null);
    expect(response.error.code).toBe(ErrorCodes.PERMISSION_DENIED);
    expect(ran).not.toHaveBeenCalled();
  });

  test("identifiant d'utilisateur invalide : INVALID_PARAMS, l'outil ne s'exécute pas", async () => {
    const response = await call({ id: "not-a-uuid", role: "admin" });
    expect(response.error.code).toBe(ErrorCodes.INVALID_PARAMS);
    expect(ran).not.toHaveBeenCalled();
  });

  test("rôle autorisé et identifiants de version 5 : l'outil s'exécute", async () => {
    const response = await call({ id: V5, role: "admin" });
    expect(response.error).toBeUndefined();
    expect(ran).toHaveBeenCalledTimes(1);
  });

  test("rôle autorisé mais identifiant d'entité invalide : refus de validation, l'outil ne s'exécute pas", async () => {
    const response = await call({ id: V5, role: "admin" }, { targetId: "abc" });
    expect(response.error.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(ran).not.toHaveBeenCalled();
  });
});

describe("outils du MCP — tous sur la règle partagée", () => {
  const sources = walk(MCP_DIR).filter((f) => f.endsWith(".js"));
  const toolSources = sources.filter((f) => f.includes(`${path.sep}tools${path.sep}`));
  const usingShared = toolSources.filter((f) => /require\("\.\.\/\.\.\/uuidSchema"\)/.test(fs.readFileSync(f, "utf8")));

  test("plus aucune contrainte « version 4 seulement » dans src/ai/mcp", () => {
    const offenders = sources.filter((f) => !f.endsWith("uuidSchema.js") && /guid\(\{\s*version:\s*"uuidv4"\s*\}\)/.test(fs.readFileSync(f, "utf8")));
    expect(offenders.map((f) => path.relative(MCP_DIR, f))).toEqual([]);
  });

  test("les 40 outils concernés importent la règle partagée et l'utilisent", () => {
    expect(usingShared).toHaveLength(40);
    for (const file of usingShared) expect(fs.readFileSync(file, "utf8")).toMatch(/uuidString\(\)/);
  });

  test("le validateur de l'utilisateur agissant utilise la même règle", () => {
    expect(fs.readFileSync(path.join(MCP_DIR, "validationManager.js"), "utf8")).toMatch(/id:\s*uuidString\(\)\.required\(\)/);
  });

  test("aucun de ces outils n'a perdu sa déclaration de contrôle d'accès", () => {
    for (const file of usingShared) expect(fs.readFileSync(file, "utf8")).toMatch(/requiredRoles\s*:/);
  });
});
