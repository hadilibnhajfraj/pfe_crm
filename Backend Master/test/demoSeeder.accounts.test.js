"use strict";

// Changement d'adresse des comptes de démonstration (scripts/demo-seeder).
// AUCUNE base n'est ouverte par ces tests : la correspondance est une fonction
// pure, et l'opération est exercée contre une base simulée en mémoire qui
// enregistre chaque requête émise.

const fs = require("fs");
const path = require("path");
const target = require("../scripts/demo-seeder/lib/target");
const { buildPlan } = require("../scripts/demo-seeder/lib/plan");
const { batchIdOf } = require("../scripts/demo-seeder/lib/runner");
const { buildEmailMapping, assertMappingIsSafe, renameAccountEmails, legacyEmail } = require("../scripts/demo-seeder/lib/accounts");

const REFS = {
  stageByName: new Map(["Prospect", "Contacté", "Site Visit", "Plan technique", "Echantillonnage", "Quote Sent", "Negotiation", "Won", "Lost", "Loyalty"].map((n, i) => [n, `stage-${i}`])),
  actionTypeByName: new Map(["Visite", "Relance", "Plan technique", "Devis envoyé", "Echantillonnage", "Negociation", "Commande gagnée", "Commande perdue"].map((n, i) => [n, `type-${i}`])),
  machines: ["PROBAR", "PROMESH"].flatMap((t) => [1, 2, 3, 4].map((n) => ({ id: `${t}-${n}`, code: `${t}-0${n}`, typeMachine: t, numero: n, statut: "ACTIVE" }))),
};
const config = () => target.loadConfig();
const legacyConfig = () => {
  const c = config();
  delete c.identity.accountEmailDomain;
  return c;
};
const BUSINESS_TABLES = ["projects", "project_actions", "commercial_contacts", "commercial_contact_relances", "por_promesh", "industrial_records", "recuperable_fiches", "user_profiles", "machines"];

// Base simulée : comptes tels que le premier lot les a créés.
function fakeDatabase({ database = "cbigestionnairepfe_demo", corruptOnUpdate = false } = {}) {
  const c = config();
  const mapping = buildEmailMapping(c);
  const state = {
    users: mapping.map((m, i) => ({ id: m.id, email: m.oldEmail, role: m.role, isActive: true, passwordHash: `EMPREINTE-SECRETE-${i}` })),
    log: mapping.map((m) => ({ batch_id: batchIdOf(c), table_name: "users", record_id: m.id, column_name: "id", operation: "INSERT" })),
    tableVersion: Object.fromEntries(BUSINESS_TABLES.map((t) => [t, 1])),
  };
  const statements = [];
  let saved = null;
  const clone = (s) => JSON.parse(JSON.stringify(s));
  const client = {
    state,
    statements,
    query: async (sql, params = []) => {
      const text = sql.replace(/\s+/g, " ").trim();
      statements.push(text);
      if (/^SELECT current_database\(\)/.test(text)) return { rows: [{ database }] };
      if (text === "BEGIN") return (saved = clone(state)), { rows: [] };
      if (text === "COMMIT") return (saved = null), { rows: [] };
      if (text === "ROLLBACK") {
        if (saved) Object.assign(state, saved);
        return { rows: [] };
      }
      if (/^SELECT DISTINCT l\.record_id AS id FROM data_change_log l/.test(text)) return { rows: state.log.filter((l) => l.table_name === "users" && l.operation === "INSERT").map((l) => ({ id: l.record_id })) };
      if (/^SELECT id::text AS id, email, role::text AS role, "isActive" AS active FROM users/.test(text)) return { rows: state.users.filter((u) => params[0].includes(u.id)).map((u) => ({ id: u.id, email: u.email, role: u.role, active: u.isActive })) };
      if (/^SELECT id::text AS id FROM users WHERE lower\(email\) = ANY/.test(text)) return { rows: state.users.filter((u) => params[0].includes(u.email.toLowerCase()) && !params[1].includes(u.id)).map((u) => ({ id: u.id })) };
      if (/^SELECT DISTINCT table_name AS t FROM data_change_log/.test(text)) return { rows: ["users", ...BUSINESS_TABLES.filter((t) => t !== "machines")].map((t) => ({ t })) };
      if (/^SELECT COUNT\(\*\)::int AS n, md5\(/.test(text)) {
        const table = text.match(/FROM "([^"]+)" t$/)[1];
        if (table === "users") return { rows: [{ n: state.users.length, h: JSON.stringify(state.users.map(({ email, ...rest }) => rest)) }] };
        return { rows: [{ n: 1, h: `v${state.tableVersion[table] || 0}` }] };
      }
      if (/^UPDATE users SET email = \$1 WHERE id::text = \$2 AND email = \$3 RETURNING id$/.test(text)) {
        const user = state.users.find((u) => u.id === params[1] && u.email === params[2]);
        if (!user) return { rows: [] };
        user.email = params[0];
        if (corruptOnUpdate) state.tableVersion.projects += 1; // une donnée métier bouge : doit tout annuler
        return { rows: [{ id: user.id }] };
      }
      if (/^INSERT INTO data_change_log/.test(text)) {
        state.log.push({ batch_id: params[0], table_name: "users", record_id: params[1], column_name: "email", old_value: params[2], new_value: params[3], source: params[4], reason: params[5], operation: "UPDATE", executed_by: params[6] });
        return { rows: [] };
      }
      if (/COUNT\(\*\) FILTER \(WHERE email LIKE '%@demo\.invalid'\)/.test(text)) {
        const rows = state.users.filter((u) => params[0].includes(u.id));
        const suffix = params[1].slice(1);
        return { rows: [{ old: rows.filter((u) => u.email.endsWith("@demo.invalid")).length, new: rows.filter((u) => u.email.endsWith(suffix)).length, distinct_emails: new Set(rows.map((u) => u.email.toLowerCase())).size, active: rows.filter((u) => u.isActive).length }] };
      }
      if (/^SELECT COUNT\(\*\)::int AS n FROM data_change_log WHERE batch_id = \$1 AND table_name = 'users' AND column_name = 'email'/.test(text)) return { rows: [{ n: state.log.filter((l) => l.column_name === "email" && l.operation === "UPDATE").length }] };
      throw new Error(`requête non prévue par la base simulée : ${text.slice(0, 90)}`);
    },
  };
  return client;
}
const writes = (client) => client.statements.filter((s) => !/^(SELECT|BEGIN$|COMMIT$|ROLLBACK$)/.test(s));

// ═══════════════════════════════════════════════════════════════════════════
describe("Correspondance des adresses", () => {
  const mapping = buildEmailMapping(config());

  test("10 comptes, aux rôles existants", () => {
    expect(mapping).toHaveLength(10);
    const byRole = mapping.reduce((acc, m) => ((acc[m.role] = (acc[m.role] || 0) + 1), acc), {});
    expect(byRole).toEqual({ commercial: 6, commercial_sedentaire: 2, responsable_logistique_achat: 1, admin: 1 });
  });

  test("les 10 nouvelles adresses sont uniques, au format demandé", () => {
    const emails = mapping.map((m) => m.newEmail);
    expect(new Set(emails.map((e) => e.toLowerCase())).size).toBe(10);
    expect(emails).toEqual(expect.arrayContaining([
      "demo.admin01@cbi_tunisia.com",
      "demo.commercial01@cbi_tunisia.com",
      "demo.commercial02@cbi_tunisia.com",
      "demo.commercial06@cbi_tunisia.com",
      "demo.commercial_sedentaire01@cbi_tunisia.com",
      "demo.commercial_sedentaire02@cbi_tunisia.com",
      "demo.responsable_logistique_achat01@cbi_tunisia.com",
    ]));
    expect(emails.every((e) => e.endsWith("@cbi_tunisia.com"))).toBe(true);
  });

  test("aucune adresse @demo.invalid ne subsiste parmi les 10 nouvelles", () => {
    expect(mapping.filter((m) => /@demo\.invalid$/.test(m.newEmail))).toEqual([]);
  });

  test("chaque ancienne adresse est celle du premier lot, et chacune a une seule nouvelle adresse", () => {
    expect(mapping.every((m) => m.oldEmail.endsWith("@demo.invalid"))).toBe(true);
    expect(new Set(mapping.map((m) => m.oldEmail)).size).toBe(10);
    expect(mapping.find((m) => m.newEmail === "demo.commercial_sedentaire01@cbi_tunisia.com").oldEmail).toBe("demo.commercial-sedentaire01@demo.invalid");
    expect(legacyEmail("responsable_logistique_achat", 1)).toBe("demo.responsable-logistique-achat01@demo.invalid");
  });

  test("les comptes conservent leurs identifiants et leurs rôles : seul l'e-mail change dans le plan", () => {
    const before = buildPlan(legacyConfig(), REFS).entries.filter((e) => e.table === "users");
    const after = buildPlan(config(), REFS).entries.filter((e) => e.table === "users");
    expect(after.map((e) => e.id)).toEqual(before.map((e) => e.id));
    expect(after.map((e) => e.values.role)).toEqual(before.map((e) => e.values.role));
    expect(after.map((e) => e.values.isActive)).toEqual(before.map((e) => e.values.isActive));
    expect(mapping.map((m) => m.id).sort()).toEqual(after.map((e) => e.id).sort());
    for (let i = 0; i < before.length; i++) {
      const { email: a, ...restBefore } = before[i].values;
      const { email: b, ...restAfter } = after[i].values;
      expect(restAfter).toEqual(restBefore);
      expect(b).not.toBe(a);
    }
  });

  test("le contrôle de la correspondance refuse un doublon, une adresse hors domaine ou mal formée", () => {
    const c = config();
    const dup = buildEmailMapping(c);
    dup[1] = { ...dup[1], newEmail: dup[0].newEmail };
    expect(() => assertMappingIsSafe(dup, c)).toThrow(/double/);
    const out = buildEmailMapping(c);
    out[0] = { ...out[0], newEmail: "demo.admin01@gmail.com" };
    expect(() => assertMappingIsSafe(out, c)).toThrow(/hors du domaine/);
    const bad = buildEmailMapping(c);
    bad[0] = { ...bad[0], newEmail: "demo admin01@cbi_tunisia.com" };
    expect(() => assertMappingIsSafe(bad, c)).toThrow(/refusée par la connexion/);
  });
});

describe("Plan du générateur avec le nouveau domaine", () => {
  test("une nouvelle simulation reste déterministe", () => {
    expect(JSON.stringify(buildPlan(config(), REFS).entries)).toBe(JSON.stringify(buildPlan(config(), REFS).entries));
  });

  test("seules les adresses des comptes changent : aucune donnée commerciale ou industrielle du plan ne bouge", () => {
    const before = buildPlan(legacyConfig(), REFS).entries;
    const after = buildPlan(config(), REFS).entries;
    expect(after).toHaveLength(before.length);
    const changed = new Set();
    for (let i = 0; i < before.length; i++) {
      expect(after[i].id).toBe(before[i].id);
      if (JSON.stringify(after[i].values) !== JSON.stringify(before[i].values)) changed.add(before[i].table);
    }
    // users : l'adresse ; relances : l'adresse du commercial, recopiée du compte.
    expect([...changed].sort()).toEqual(["commercial_contact_relances", "users"]);
    const relancesBefore = before.filter((e) => e.table === "commercial_contact_relances");
    const relancesAfter = after.filter((e) => e.table === "commercial_contact_relances");
    for (let i = 0; i < relancesBefore.length; i++) {
      const { commercialEmail: a, ...restBefore } = relancesBefore[i].values;
      const { commercialEmail: b, ...restAfter } = relancesAfter[i].values;
      expect(restAfter).toEqual(restBefore);
      expect(b.endsWith("@cbi_tunisia.com")).toBe(true);
    }
  });

  test("les autres adresses (ingénieurs, architectes, contacts) restent en @demo.invalid", () => {
    const plan = buildPlan(config(), REFS).entries;
    for (const table of ["engineers", "architects", "commercial_contacts"]) {
      const emails = plan.filter((e) => e.table === table).map((e) => e.values.email).filter(Boolean);
      expect(emails.length).toBeGreaterThan(0);
      expect(emails.every((e) => e.endsWith("@demo.invalid"))).toBe(true);
    }
  });
});

describe("Authentification", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "routes", "auth.routes.js"), "utf8");

  test("la règle de format de POST /auth/signin accepte les 10 nouvelles adresses", () => {
    const body = source.match(/function isValidEmail\(email\) \{\s*return ([^;]+);/)[1];
    // eslint-disable-next-line no-new-func
    const isValidEmail = new Function("email", `return ${body};`);
    for (const m of buildEmailMapping(config())) expect([m.newEmail, isValidEmail(m.newEmail)]).toEqual([m.newEmail, true]);
  });

  test("la connexion compare le mot de passe à l'empreinte existante, que l'opération ne touche pas", () => {
    expect(source).toMatch(/bcrypt\.compare\(password, user\.passwordHash\)/);
    expect(fs.readFileSync(path.join(__dirname, "..", "scripts", "demo-seeder", "lib", "accounts.js"), "utf8")).not.toMatch(/passwordHash\s*=|SET\s+"?passwordHash|bcrypt/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe("Opération de changement d'adresse", () => {
  test.each(["cbigestionnairepfe", "cbigestionnairepfe_mig_test", "cbigestionnairepfe_demo_test", "cbigestionnairepfe_test", "postgres"])("refusée sur %s, sans aucune écriture ni autre lecture", async (database) => {
    const client = fakeDatabase({ database });
    await expect(renameAccountEmails({ client, config: config(), apply: true })).rejects.toThrow(/OPÉRATION REFUSÉE/);
    expect(client.statements).toEqual(["SELECT current_database() AS database"]);
  });

  test("simulation : présente les 10 comptes et n'écrit rien", async () => {
    const client = fakeDatabase();
    const report = await renameAccountEmails({ client, config: config(), apply: false });
    expect(report.accounts).toHaveLength(10);
    expect(report.accounts.every((a) => a.state === "à modifier")).toBe(true);
    expect(report.updated).toBe(0);
    expect(writes(client)).toEqual([]);
    expect(client.state.users.every((u) => u.email.endsWith("@demo.invalid"))).toBe(true);
  });

  test("application : 10 adresses changées ; identifiants, rôles, états et empreintes de mot de passe intacts", async () => {
    const client = fakeDatabase();
    const before = JSON.parse(JSON.stringify(client.state.users));
    const report = await renameAccountEmails({ client, config: config(), apply: true });
    expect(report.error).toBeNull();
    expect(report.committed).toBe(true);
    expect(report.updated).toBe(10);
    expect(report.controls.every((c) => c.ok)).toBe(true);
    const after = client.state.users;
    expect(after.map(({ email, ...rest }) => rest)).toEqual(before.map(({ email, ...rest }) => rest));
    expect(after.every((u) => u.email.endsWith("@cbi_tunisia.com"))).toBe(true);
    expect(after.filter((u) => u.email.endsWith("@demo.invalid"))).toEqual([]);
    expect(new Set(after.map((u) => u.email)).size).toBe(10);
    expect(after.every((u) => u.isActive)).toBe(true);
  });

  test("les seules écritures émises : la colonne email des comptes et leur entrée de journal", async () => {
    const client = fakeDatabase();
    await renameAccountEmails({ client, config: config(), apply: true });
    const w = writes(client);
    expect(w.filter((s) => /^UPDATE users SET email = \$1 WHERE id::text = \$2 AND email = \$3 RETURNING id$/.test(s))).toHaveLength(10);
    expect(w.filter((s) => /^INSERT INTO data_change_log/.test(s))).toHaveLength(10);
    expect(w).toHaveLength(20);
    // Aucune requête ne supprime, ne crée de compte, ni ne touche une table métier.
    expect(client.statements.filter((s) => /^(DELETE|TRUNCATE|DROP|ALTER|CREATE|INSERT INTO (?!data_change_log)|UPDATE (?!users SET email))/i.test(s))).toEqual([]);
    expect(client.state.tableVersion).toEqual(Object.fromEntries(BUSINESS_TABLES.map((t) => [t, 1])));
  });

  test("journal : une entrée UPDATE par compte, avec ancienne et nouvelle adresse, sans empreinte", async () => {
    const client = fakeDatabase();
    await renameAccountEmails({ client, config: config(), apply: true });
    const entries = client.state.log.filter((l) => l.column_name === "email");
    expect(entries).toHaveLength(10);
    expect(entries.every((l) => l.operation === "UPDATE" && l.executed_by === "DEMO_SEEDER" && l.old_value.endsWith("@demo.invalid") && l.new_value.endsWith("@cbi_tunisia.com"))).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/EMPREINTE-SECRETE|\$2[aby]\$/);
  });

  test("ni mot de passe ni empreinte dans le rapport, ni dans les requêtes émises", async () => {
    const client = fakeDatabase();
    const report = await renameAccountEmails({ client, config: config(), apply: true });
    expect(JSON.stringify(report)).not.toMatch(/EMPREINTE-SECRETE|passwordHash|\$2[aby]\$/);
    expect(client.statements.filter((s) => /SELECT[^;]*"passwordHash"/.test(s))).toEqual([]);
  });

  test("deuxième exécution : rien à faire, rien n'est écrit", async () => {
    const client = fakeDatabase();
    await renameAccountEmails({ client, config: config(), apply: true });
    client.statements.length = 0;
    const report = await renameAccountEmails({ client, config: config(), apply: true });
    expect(report.updated).toBe(0);
    expect(report.alreadyDone).toBe(10);
    expect(writes(client)).toEqual([]);
  });

  test("si une donnée métier bouge pendant l'opération : tout est annulé", async () => {
    const client = fakeDatabase({ corruptOnUpdate: true });
    const report = await renameAccountEmails({ client, config: config(), apply: true });
    expect(report.committed).toBe(false);
    expect(report.error).toMatch(/aucune autre donnée modifiée/);
    expect(report.updated).toBe(0);
    expect(client.state.users.every((u) => u.email.endsWith("@demo.invalid"))).toBe(true);
    expect(client.state.log.filter((l) => l.column_name === "email")).toEqual([]);
    expect(client.statements).toContain("ROLLBACK");
  });

  test("refusée si un compte porte une adresse inattendue, sans rien écrire", async () => {
    const client = fakeDatabase();
    client.state.users[3].email = "quelquun@example.org";
    await expect(renameAccountEmails({ client, config: config(), apply: true })).rejects.toThrow(/adresse actuelle/);
    expect(writes(client)).toEqual([]);
  });

  test("refusée si une nouvelle adresse est déjà prise par un autre utilisateur", async () => {
    const client = fakeDatabase();
    client.state.users.push({ id: "autre", email: "demo.admin01@cbi_tunisia.com", role: "admin", isActive: true, passwordHash: "x" });
    await expect(renameAccountEmails({ client, config: config(), apply: true })).rejects.toThrow(/nouvelles adresses libres/);
    expect(writes(client)).toEqual([]);
  });

  test("refusée si un compte du lot est inactif ou a changé de rôle", async () => {
    const inactive = fakeDatabase();
    inactive.state.users[0].isActive = false;
    await expect(renameAccountEmails({ client: inactive, config: config(), apply: true })).rejects.toThrow(/compte actif/);
    const role = fakeDatabase();
    role.state.users[0].role = "superadmin";
    await expect(renameAccountEmails({ client: role, config: config(), apply: true })).rejects.toThrow(/rôle du compte/);
    expect(writes(inactive)).toEqual([]);
    expect(writes(role)).toEqual([]);
  });

  test("refusée si le registre du lot ne contient pas exactement ces 10 comptes", async () => {
    const client = fakeDatabase();
    client.state.log.pop();
    await expect(renameAccountEmails({ client, config: config(), apply: true })).rejects.toThrow(/registre du lot/);
    expect(writes(client)).toEqual([]);
  });
});
