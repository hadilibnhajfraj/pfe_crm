"use strict";

// Changement d'adresse e-mail des comptes de démonstration d'un lot.
//
// Ne touche QU'À la colonne `email` des comptes inscrits au registre du lot :
// identifiant, rôle, état, empreinte du mot de passe et relations sont
// conservés. Aucun compte n'est supprimé ni recréé. Aucune donnée commerciale
// ou industrielle n'est modifiée (contrôlé avant validation de la transaction).
//
// Sécurité : la base connectée doit être EXACTEMENT cbigestionnairepfe_demo —
// ni la base réelle, ni la copie de test des migrations, ni la base jetable
// des tests. Ce module n'utilise ni le code du CRM ni ses services : aucun
// e-mail, aucune notification, aucune réinitialisation de mot de passe.
// Aucune empreinte de mot de passe n'est lue ni affichée.

const { DEMO_DATABASE } = require("./target");
const { buildPlan } = require("./plan");
const { batchIdOf, EXECUTED_BY } = require("./runner");
const { pad } = require("./random");

// Adresse d'origine des comptes (format du premier lot) : tirets, domaine .invalid.
const legacyEmail = (role, index) => `demo.${role.replace(/_/g, "-")}${pad(index, 2)}@demo.invalid`;

// Correspondance ancienne adresse → nouvelle adresse. Fonction pure : la
// nouvelle adresse est celle que produit désormais le plan du générateur.
function buildEmailMapping(config, refs = { stageByName: new Map(), actionTypeByName: new Map(), machines: [] }) {
  const stub = { ...refs, machines: refs.machines.length ? refs.machines : ["PROBAR", "PROMESH"].map((t) => ({ id: t, code: t, typeMachine: t, numero: 1, statut: "ACTIVE" })) };
  const users = buildPlan(config, stub).entries.filter((e) => e.table === "users");
  return users.map((e) => {
    const [role, index] = [e.key.slice(0, e.key.lastIndexOf("-")), Number(e.key.slice(e.key.lastIndexOf("-") + 1))];
    return { id: e.id, role, oldEmail: legacyEmail(role, index), newEmail: e.values.email };
  });
}

function assertMappingIsSafe(mapping, config) {
  const domain = `@${config.identity.accountEmailDomain}`;
  const news = mapping.map((m) => m.newEmail.toLowerCase());
  if (new Set(news).size !== news.length) throw new Error("nouvelles adresses en double");
  if (new Set(mapping.map((m) => m.id)).size !== mapping.length) throw new Error("identifiants en double");
  for (const m of mapping) {
    if (!m.newEmail.endsWith(domain)) throw new Error(`adresse hors du domaine attendu : ${m.newEmail}`);
    if (m.newEmail === m.oldEmail) throw new Error(`adresse inchangée : ${m.newEmail}`);
    // Même règle de format que POST /auth/signin.
    if (m.newEmail.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.newEmail)) throw new Error(`adresse refusée par la connexion : ${m.newEmail}`);
  }
}

// Empreinte du contenu d'une table. Pour `users`, l'adresse est exclue : tout
// le reste (rôle, état, empreinte du mot de passe, dates…) doit rester identique.
// Seul le résultat md5 sort de la base, jamais une valeur de colonne.
async function fingerprint(client, table) {
  const expr = table === "users" ? `to_jsonb(t) - 'email'` : `to_jsonb(t)`;
  const { rows } = await client.query(`SELECT COUNT(*)::int AS n, md5(COALESCE(string_agg(md5((${expr})::text), '' ORDER BY t.id::text), '')) AS h FROM "${table}" t`);
  return `${rows[0].n}:${rows[0].h}`;
}

async function renameAccountEmails({ client, config, apply = false }) {
  const batchId = batchIdOf(config);
  const report = { batchId, mode: apply ? "apply" : "dry-run", accounts: [], updated: 0, alreadyDone: 0, controls: [], error: null };
  const control = (label, ok, detail) => {
    report.controls.push({ label, ok: Boolean(ok), detail: String(detail) });
    if (!ok) throw new Error(`${label} : ${detail}`);
  };

  // 1. La base connectée doit être exactement la base de démonstration.
  const where = (await client.query("SELECT current_database() AS database")).rows[0];
  report.database = where.database;
  if (where.database !== DEMO_DATABASE) throw new Error(`OPÉRATION REFUSÉE : la connexion vise « ${where.database} », pas « ${DEMO_DATABASE} ».`);

  // 2. Correspondance, puis confrontation aux comptes réellement inscrits au registre du lot.
  const mapping = buildEmailMapping(config);
  assertMappingIsSafe(mapping, config);
  const registry = (await client.query(
    `SELECT DISTINCT l.record_id AS id FROM data_change_log l
      WHERE l.batch_id = $1 AND l.table_name = 'users' AND l.operation = 'INSERT'
        AND NOT EXISTS (SELECT 1 FROM data_change_log d WHERE d.batch_id = l.batch_id AND d.table_name = 'users' AND d.record_id = l.record_id AND d.operation = 'DELETE' AND d.id > l.id)`,
    [batchId]
  )).rows.map((r) => r.id);
  control("comptes au registre du lot", registry.length === mapping.length && mapping.every((m) => registry.includes(m.id)), `${registry.length} au registre, ${mapping.length} attendus`);

  // Colonnes lues : jamais l'empreinte du mot de passe.
  const current = (await client.query(`SELECT id::text AS id, email, role::text AS role, "isActive" AS active FROM users WHERE id::text = ANY($1)`, [mapping.map((m) => m.id)])).rows;
  control("comptes présents", current.length === mapping.length, `${current.length} sur ${mapping.length}`);
  for (const m of mapping) {
    const row = current.find((r) => r.id === m.id);
    const state = row.email === m.newEmail ? "déjà à jour" : row.email === m.oldEmail ? "à modifier" : "INATTENDU";
    report.accounts.push({ id: m.id, role: m.role, oldEmail: m.oldEmail, newEmail: m.newEmail, currentEmail: row.email, active: row.active, state });
    control(`rôle du compte ${m.newEmail}`, row.role === m.role, `${row.role} en base, ${m.role} attendu`);
    control(`adresse actuelle du compte ${m.id}`, state !== "INATTENDU", row.email);
    control(`compte actif ${m.newEmail}`, row.active === true, row.active);
  }
  const taken = (await client.query(`SELECT id::text AS id FROM users WHERE lower(email) = ANY($1) AND id::text <> ALL($2)`, [mapping.map((m) => m.newEmail.toLowerCase()), mapping.map((m) => m.id)])).rows;
  control("nouvelles adresses libres", taken.length === 0, `${taken.length} déjà utilisée(s) par un autre compte`);

  const todo = report.accounts.filter((a) => a.state === "à modifier");
  report.alreadyDone = report.accounts.length - todo.length;
  if (!apply || !todo.length) return report;

  // 3. Écriture : une seule transaction, uniquement users.email.
  const tables = (await client.query(`SELECT DISTINCT table_name AS t FROM data_change_log WHERE batch_id = $1 AND operation = 'INSERT'`, [batchId])).rows.map((r) => r.t);
  const watched = [...new Set([...tables, "machines", "pipeline_stages", "project_action_types", "product_families"])].sort();
  await client.query("BEGIN");
  try {
    const again = (await client.query("SELECT current_database() AS database")).rows[0];
    if (again.database !== DEMO_DATABASE) throw new Error(`OPÉRATION REFUSÉE : la transaction vise « ${again.database} ».`);
    const before = {};
    for (const table of watched) before[table] = await fingerprint(client, table);

    for (const a of todo) {
      const res = await client.query(`UPDATE users SET email = $1 WHERE id::text = $2 AND email = $3 RETURNING id`, [a.newEmail, a.id, a.oldEmail]);
      if (res.rows.length !== 1) throw new Error(`compte ${a.id} : ${res.rows.length} ligne(s) modifiée(s) au lieu de 1`);
      await client.query(
        `INSERT INTO data_change_log (batch_id, table_name, record_id, column_name, old_value, new_value, source, reason, confidence, operation, executed_by)
         VALUES ($1, 'users', $2, 'email', $3, $4, $5::jsonb, $6, 'HIGH', 'UPDATE', $7)`,
        [batchId, a.id, a.oldEmail, a.newEmail, JSON.stringify({ generator: "scripts/demo-seeder", action: "rename-account-emails", role: a.role }), "Changement d'adresse d'un compte de démonstration (présentation) — adresse fictive, aucune boîte aux lettres", EXECUTED_BY]
      );
      report.updated += 1;
    }

    // Contrôles AVANT validation : le moindre écart annule tout.
    const after = {};
    for (const table of watched) after[table] = await fingerprint(client, table);
    const changed = watched.filter((t) => before[t] !== after[t]);
    control("aucune autre donnée modifiée (comptes hors adresse, données commerciales et industrielles, référentiels)", changed.length === 0, changed.length ? `tables modifiées : ${changed.join(", ")}` : `${watched.length} tables identiques`);
    const check = (await client.query(
      `SELECT COUNT(*) FILTER (WHERE email LIKE '%@demo.invalid')::int AS old, COUNT(*) FILTER (WHERE email LIKE $2)::int AS new, COUNT(DISTINCT lower(email))::int AS distinct_emails, COUNT(*) FILTER (WHERE "isActive")::int AS active
         FROM users WHERE id::text = ANY($1)`,
      [mapping.map((m) => m.id), `%@${config.identity.accountEmailDomain}`]
    )).rows[0];
    control("plus aucune adresse @demo.invalid parmi les comptes", check.old === 0, `${check.old}`);
    control("comptes sur le nouveau domaine", check.new === mapping.length, `${check.new} sur ${mapping.length}`);
    control("adresses uniques", check.distinct_emails === mapping.length, `${check.distinct_emails}`);
    control("comptes toujours actifs", check.active === mapping.length, `${check.active} sur ${mapping.length}`);
    const logged = (await client.query(`SELECT COUNT(*)::int AS n FROM data_change_log WHERE batch_id = $1 AND table_name = 'users' AND column_name = 'email' AND operation = 'UPDATE'`, [batchId])).rows[0].n;
    control("journal", logged === report.updated + report.alreadyDone, `${logged} entrée(s) pour ${report.updated + report.alreadyDone} compte(s) modifié(s)`);
    await client.query("COMMIT");
    report.committed = true;
  } catch (err) {
    await client.query("ROLLBACK");
    report.committed = false;
    report.updated = 0;
    report.error = err.message;
  }
  return report;
}

module.exports = { buildEmailMapping, assertMappingIsSafe, renameAccountEmails, legacyEmail };
