"use strict";

// Réinitialisation des mots de passe de démonstration (scripts/demo/reset-demo-passwords.js).
// AUCUNE base n'est ouverte : l'opération est exercée contre un client simulé
// en mémoire, qui enregistre chaque requête émise. bcrypt est réel pour les
// contrôles de coût, simulé ailleurs pour la vitesse.

const realBcrypt = require("bcrypt");
const { resetDemoPasswords, TARGET_ACCOUNTS, DEMO_DATABASE, BCRYPT_COST, EXECUTED_BY, isAcceptablePassword } = require("../scripts/demo/reset-demo-passwords");

const BATCH = "DEMO-demo-powerbi-v1-s20261010";
const PASSWORD = "Mot-De-Passe-De-Test-42!";
const PLACEHOLDER = "VALEUR_INVALIDE";
const roleOf = (email) => email.slice("demo.".length, email.indexOf("@")).replace(/\d+$/, "");

// bcrypt simulé : rapide, déterministe, de la forme d'une vraie empreinte.
const fakeBcrypt = () => {
  const calls = [];
  return {
    calls,
    hash: async (password, cost) => {
      calls.push({ cost });
      return `$2b$${String(cost).padStart(2, "0")}$${Buffer.from(password).toString("hex").padEnd(53, "0").slice(0, 53)}`;
    },
    compare: async (password, hash) => hash === `$2b$12$${Buffer.from(password).toString("hex").padEnd(53, "0").slice(0, 53)}`,
  };
};
const looksBcrypt = (hash) => /^\$2[aby]\$\d{2}\$.{53}$/.test(hash);

function fakeDatabase({ database = DEMO_DATABASE, unregistered = [], inactive = [], absent = [], alreadyValid = [], touchOtherColumn = false } = {}) {
  const users = [...TARGET_ACCOUNTS, "demo.commercial01@cbi_tunisia.com", "issam@gmail.com"]
    .filter((email) => !absent.includes(email))
    .map((email, i) => ({
      id: `00000000-0000-5000-8000-${String(i).padStart(12, "0")}`,
      email,
      role: email.startsWith("demo.") ? roleOf(email) : "superadmin2",
      isActive: !inactive.includes(email),
      passwordHash: TARGET_ACCOUNTS.includes(email) && !alreadyValid.includes(email) ? PLACEHOLDER : `$2b$12$${"x".repeat(53)}`,
      other: "inchangé",
    }));
  const registry = new Set(users.filter((u) => u.email.startsWith("demo.") && !unregistered.includes(u.email)).map((u) => u.id));
  const state = { users, log: [] };
  const statements = [];
  let snapshot = null;
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const client = {
    statements,
    state,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, " ").trim();
      statements.push({ text, params });
      if (text.startsWith("SELECT current_database()")) return { rows: [{ d: database }] };
      if (text === "BEGIN" || text === "BEGIN READ ONLY") { snapshot = clone(state); return { rows: [] }; }
      if (text === "COMMIT") { snapshot = null; return { rows: [] }; }
      if (text === "ROLLBACK") { if (snapshot) { state.users = snapshot.users; state.log = snapshot.log; snapshot = null; } return { rows: [] }; }
      if (text.startsWith("SELECT u.id::text AS id, u.email")) {
        return { rows: state.users.filter((u) => params[0].includes(u.email)).map((u) => ({ id: u.id, email: u.email, role: u.role, active: u.isActive, valid: looksBcrypt(u.passwordHash), registered: registry.has(u.id) })).sort((a, b) => (a.role + a.email).localeCompare(b.role + b.email)) };
      }
      if (text.startsWith("SELECT COUNT(*)::int AS n, md5(")) {
        return { rows: [{ n: state.users.length, h: JSON.stringify(state.users.map((u) => [u.id, u.email, u.role, u.isActive, u.other])) }] };
      }
      if (text.startsWith("UPDATE users SET")) {
        const user = state.users.find((u) => u.id === params[1] && u.email === params[2] && !looksBcrypt(u.passwordHash));
        if (!user) return { rowCount: 0 };
        user.passwordHash = params[0];
        if (touchOtherColumn) user.other = "MODIFIÉ";
        return { rowCount: 1 };
      }
      if (text.startsWith("INSERT INTO data_change_log")) { state.log.push({ batch: params[0], id: params[1], old: params[2], new: params[3], by: params[6] }); return { rowCount: 1 }; }
      if (text.startsWith('SELECT "passwordHash" AS hash')) return { rows: state.users.filter((u) => params[0].includes(u.id)).map((u) => ({ hash: u.passwordHash })) };
      if (text.startsWith("SELECT COUNT(*)::int AS n FROM users WHERE email = ANY")) return { rows: [{ n: state.users.filter((u) => params[0].includes(u.email) && !looksBcrypt(u.passwordHash)).length }] };
      throw new Error(`requête inattendue : ${text}`);
    },
  };
  return client;
}

const writes = (client) => client.statements.filter((s) => /^(UPDATE|INSERT|DELETE|ALTER|DROP|TRUNCATE|CREATE)\b/i.test(s.text));
const run = (client, extra = {}) => {
  const lines = [];
  const bcrypt = extra.bcrypt || fakeBcrypt();
  return resetDemoPasswords({ client, bcrypt, batchId: BATCH, password: PASSWORD, log: (l) => lines.push(l), ...extra }).then(
    (report) => ({ report, lines, bcrypt }),
    (error) => ({ error, lines, bcrypt })
  );
};

describe("périmètre", () => {
  test("exactement neuf comptes, tous demo.*, sans demo.commercial01 ni compte hors lot", () => {
    expect(TARGET_ACCOUNTS).toHaveLength(9);
    expect(new Set(TARGET_ACCOUNTS).size).toBe(9);
    for (const email of TARGET_ACCOUNTS) expect(email).toMatch(/^demo\.[a-z_]+\d{2}@cbi_tunisia\.com$/);
    expect(TARGET_ACCOUNTS).not.toContain("demo.commercial01@cbi_tunisia.com");
    expect(TARGET_ACCOUNTS).not.toContain("issam@gmail.com");
  });

  test("la liste est figée", () => {
    expect(Object.isFrozen(TARGET_ACCOUNTS)).toBe(true);
  });

  test("même règle de longueur que la connexion (8 à 72 caractères)", () => {
    expect(isAcceptablePassword("1234567")).toBe(false);
    expect(isAcceptablePassword("12345678")).toBe(true);
    expect(isAcceptablePassword("x".repeat(73))).toBe(false);
    expect(isAcceptablePassword(undefined)).toBe(false);
  });
});

describe("simulation (mode par défaut)", () => {
  test("ouvre une transaction en lecture seule et n'émet aucune écriture", async () => {
    const client = fakeDatabase();
    const { report, bcrypt } = await run(client);
    expect(report.mode).toBe("dry-run");
    expect(client.statements.map((s) => s.text)).toContain("BEGIN READ ONLY");
    expect(client.statements.map((s) => s.text)).not.toContain("BEGIN");
    expect(client.statements.map((s) => s.text)).not.toContain("COMMIT");
    expect(writes(client)).toEqual([]);
    expect(bcrypt.calls).toEqual([]);
    expect(report.updated).toBe(0);
    expect(report.committed).toBe(false);
    expect(client.state.users.filter((u) => u.passwordHash === PLACEHOLDER)).toHaveLength(9);
  });

  test("fonctionne sans mot de passe fourni", async () => {
    const { report, error } = await run(fakeDatabase(), { password: undefined });
    expect(error).toBeUndefined();
    expect(report.accounts).toHaveLength(9);
  });

  test("liste les neuf comptes à réinitialiser", async () => {
    const { report } = await run(fakeDatabase());
    expect(report.accounts.map((a) => a.email).sort()).toEqual([...TARGET_ACCOUNTS].sort());
    expect(report.accounts.every((a) => a.state === "à réinitialiser")).toBe(true);
  });
});

describe("refus", () => {
  test.each(["cbigestionnairepfe", "cbigestionnairepfe_demo_test", "cbigestionnairepfe_test", "postgres"])("base « %s » : arrêt avant toute transaction", async (database) => {
    const client = fakeDatabase({ database });
    const { error } = await run(client, { apply: true });
    expect(error.message).toMatch(/OPÉRATION REFUSÉE/);
    expect(client.statements).toHaveLength(1);
    expect(writes(client)).toEqual([]);
  });

  test("écriture sans mot de passe : arrêt avant toute requête", async () => {
    const client = fakeDatabase();
    const { error } = await run(client, { apply: true, password: undefined });
    expect(error.message).toMatch(/DEMO_ACCOUNT_PASSWORD/);
    expect(client.statements).toEqual([]);
  });

  test("mot de passe trop court : arrêt avant toute requête", async () => {
    const client = fakeDatabase();
    const { error } = await run(client, { apply: true, password: "court" });
    expect(error.message).toMatch(/8 à 72/);
    expect(client.statements).toEqual([]);
  });

  test("un compte hors du registre du lot : annulation, rien d'écrit", async () => {
    const client = fakeDatabase({ unregistered: ["demo.admin01@cbi_tunisia.com"] });
    const { error } = await run(client, { apply: true });
    expect(error.message).toMatch(/hors du registre/);
    expect(writes(client)).toEqual([]);
    expect(client.statements[client.statements.length - 1].text).toBe("ROLLBACK");
  });

  test("un compte introuvable : annulation", async () => {
    const client = fakeDatabase({ absent: ["demo.commercial04@cbi_tunisia.com"] });
    const { error } = await run(client, { apply: true });
    expect(error.message).toMatch(/introuvable/);
    expect(writes(client)).toEqual([]);
  });

  test("un compte inactif : annulation", async () => {
    const client = fakeDatabase({ inactive: ["demo.commercial02@cbi_tunisia.com"] });
    const { error } = await run(client, { apply: true });
    expect(error.message).toMatch(/inactif/);
    expect(writes(client)).toEqual([]);
  });

  test("une autre colonne modifiée en cours de route : tout est annulé", async () => {
    const client = fakeDatabase({ touchOtherColumn: true });
    const { error } = await run(client, { apply: true });
    expect(error.message).toMatch(/autre colonne/);
    expect(client.statements.map((s) => s.text)).not.toContain("COMMIT");
    expect(client.state.users.filter((u) => u.passwordHash === PLACEHOLDER)).toHaveLength(9);
    expect(client.state.log).toEqual([]);
  });

  test("vérification bcrypt en échec : tout est annulé", async () => {
    const client = fakeDatabase();
    const bcrypt = { ...fakeBcrypt(), compare: async () => false };
    const { error } = await run(client, { apply: true, bcrypt });
    expect(error.message).toMatch(/bcrypt/);
    expect(client.state.users.filter((u) => u.passwordHash === PLACEHOLDER)).toHaveLength(9);
  });
});

describe("écriture (mode explicite), contre la base simulée", () => {
  test("une seule transaction, neuf mises à jour, validation à la fin", async () => {
    const client = fakeDatabase();
    const { report } = await run(client, { apply: true });
    const texts = client.statements.map((s) => s.text);
    expect(texts.filter((t) => t === "BEGIN")).toHaveLength(1);
    expect(texts.filter((t) => t === "COMMIT")).toHaveLength(1);
    expect(texts.indexOf("COMMIT")).toBe(texts.length - 1);
    expect(texts.filter((t) => t.startsWith("UPDATE users SET"))).toHaveLength(9);
    expect(report.updated).toBe(9);
    expect(report.committed).toBe(true);
  });

  test("seule la colonne passwordHash (et updatedAt) est écrite, sur les neuf comptes seulement", async () => {
    const client = fakeDatabase();
    await run(client, { apply: true });
    const updates = client.statements.filter((s) => s.text.startsWith("UPDATE"));
    for (const u of updates) expect(u.text).toMatch(/^UPDATE users SET "passwordHash" = \$1, "updatedAt" = now\(\) WHERE id::text = \$2 AND email = \$3 AND NOT \(/);
    expect(updates.map((u) => u.params[2]).sort()).toEqual([...TARGET_ACCOUNTS].sort());
    const untouched = client.state.users.filter((u) => !TARGET_ACCOUNTS.includes(u.email));
    expect(untouched.every((u) => u.passwordHash === `$2b$12$${"x".repeat(53)}`)).toBe(true);
    expect(writes(client).every((s) => /^(UPDATE users|INSERT INTO data_change_log)/.test(s.text))).toBe(true);
  });

  test("bcrypt est appelé avec le coût 12", async () => {
    const { bcrypt } = await run(fakeDatabase(), { apply: true });
    expect(BCRYPT_COST).toBe(12);
    expect(bcrypt.calls).toHaveLength(9);
    expect(bcrypt.calls.every((c) => c.cost === 12)).toBe(true);
  });

  test("un compte déjà valide n'est pas réécrit", async () => {
    const client = fakeDatabase({ alreadyValid: ["demo.admin01@cbi_tunisia.com"] });
    const { report } = await run(client, { apply: true });
    expect(report.updated).toBe(8);
    expect(client.statements.filter((s) => s.text.startsWith("UPDATE")).map((u) => u.params[2])).not.toContain("demo.admin01@cbi_tunisia.com");
  });

  test("le registre reçoit neuf entrées aux valeurs masquées", async () => {
    const client = fakeDatabase();
    await run(client, { apply: true });
    expect(client.state.log).toHaveLength(9);
    for (const entry of client.state.log) expect(entry).toMatchObject({ batch: BATCH, old: "[masqué]", new: "[masqué]", by: EXECUTED_BY });
  });

  test("ni le mot de passe ni une empreinte n'apparaissent dans les traces, le rapport ou le registre", async () => {
    const client = fakeDatabase();
    const { report, lines } = await run(client, { apply: true });
    const hashes = client.state.users.map((u) => u.passwordHash);
    const exposed = JSON.stringify({ report, lines, log: client.state.log, sql: client.statements.map((s) => s.text) });
    expect(exposed).not.toContain(PASSWORD);
    for (const hash of hashes) expect(exposed).not.toContain(hash);
  });

  test("avec le vrai bcrypt : empreinte de coût 12, vérifiable", async () => {
    const client = fakeDatabase({ alreadyValid: TARGET_ACCOUNTS.slice(1) });
    const { report } = await run(client, { apply: true, bcrypt: realBcrypt });
    expect(report.updated).toBe(1);
    const stored = client.state.users.find((u) => u.email === TARGET_ACCOUNTS[0]).passwordHash;
    expect(realBcrypt.getRounds(stored)).toBe(12);
    expect(await realBcrypt.compare(PASSWORD, stored)).toBe(true);
    expect(await realBcrypt.compare("autre", stored)).toBe(false);
  });
});
