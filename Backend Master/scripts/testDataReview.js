"use strict";

// Recense les données de TEST présentes dans la base et propose une action
// pour chacune. Aucune n'est appliquée.
//
//   npm run data:test-review
//
// LECTURE SEULE : transaction PostgreSQL READ ONLY. Écrit un seul fichier,
// reports/data-quality/TEST_DATA_REVIEW.md.
//
// Une ligne est signalée quand elle porte un marqueur explicite (« test »,
// « azerty », « QA »…) ou, pour les modules industriels et internes, quand
// elle appartient à la période d'essai sans marqueur (action REVIEW).
// Actions : KEEP_TEST (garder, marquée TEST, exclue des indicateurs),
// ARCHIVE, DELETE_AFTER_VALIDATION, REVIEW (un humain doit trancher).

require("dotenv").config({ quiet: true });

const fs = require("fs");
const path = require("path");
const { sequelize } = require("../src/db");

const OUT = path.join(__dirname, "..", "reports", "data-quality", "TEST_DATA_REVIEW.md");
// Marqueur explicite : mot « test » et ses fautes de frappe, claviers, QA.
const MARK = "(^|[^a-zà-ÿ])(te[sr]t+[a-z0-9]*|tes[ty]|testt+|est+t+|azert[a-z0-9]*|qwert[a-z0-9]*|demo|essai|qa|ttt+[a-z]*|yesy|tert|zee|rr)([^a-zà-ÿ]|$)";

async function main() {
  const t = await sequelize.transaction();
  await sequelize.query("SET TRANSACTION READ ONLY", { transaction: t });
  const q = (sql) => sequelize.query(sql, { type: "SELECT", transaction: t, replacements: { mark: MARK } });
  const sections = [];
  const add = (title, note, rows) => sections.push({ title, note, rows });
  const cell = (v) => String(v == null ? "" : v).replace(/\|/g, "/").replace(/\s+/g, " ").slice(0, 70);

  add(
    "users",
    "Comptes dont l'adresse contient « test », « qa », « demo » ou « example ». Les mots de passe et jetons ne sont pas lus.",
    (
      await q(
        `SELECT u.id, u.email AS label, u.role, u."isActive",
                (SELECT COUNT(*)::int FROM projects p WHERE p."ownerId" = u.id) AS projects,
                (SELECT COUNT(*)::int FROM commercial_contacts c WHERE c."createdBy" = u.id OR c."commercialId" = u.id) AS contacts
           FROM users u WHERE u.email ~* 'test|qa[._-]|example|demo' ORDER BY u.email`
      )
    ).map((r) => ({
      record: r.id,
      label: r.label,
      reason: `adresse de test ; rôle ${r.role} ; ${r.isActive ? "ACTIF" : "inactif"} ; ${r.projects} projet(s), ${r.contacts} contact(s) rattachés`,
      action: r.projects + r.contacts > 0 || r.isActive ? "REVIEW" : "DELETE_AFTER_VALIDATION",
    }))
  );

  const marked = async (table, labelSql, textSql, reason, action) =>
    (await q(`SELECT id::text AS id, ${labelSql} AS label FROM "${table}" WHERE (${textSql}) ~* :mark ORDER BY 2`)).map((r) => ({ record: r.id, label: r.label, reason, action }));

  add("projects", "Nom de projet portant un marqueur de test.", await marked("projects", `"nomProjet"`, `"nomProjet"`, "nom de projet de test", "DELETE_AFTER_VALIDATION"));
  add("commercial_contacts", "Nom, prénom ou société portant un marqueur de test.", await marked("commercial_contacts", `TRIM(COALESCE(prenom,'') || ' ' || nom)`, `nom || ' ' || COALESCE(prenom,'') || ' ' || COALESCE("nomSociete",'')`, "contact de test", "DELETE_AFTER_VALIDATION"));
  add("companies", "Nom de société portant un marqueur de test.", await marked("companies", "name", "name", "société de test", "REVIEW"));
  add("engineers", "Nom d'ingénieur portant un marqueur de test ou une valeur de remplissage.", [
    ...(await marked("engineers", "name", "name", "ingénieur de test", "REVIEW")),
    ...(await q(`SELECT id::text AS id, name AS label FROM engineers WHERE LOWER(TRIM(name)) IN ('pas encore', 'd', 'rs', 'none', '-') ORDER BY 2`)).map((r) => ({ record: r.id, label: r.label, reason: "valeur de remplissage à la place d'un nom", action: "REVIEW" })),
  ]);
  add("tasks", "Événements d'agenda dont le titre contient « test ».", await marked("tasks", "title", "title", "événement de test", "DELETE_AFTER_VALIDATION"));
  add("project_actions", "Actions dont le commentaire porte un marqueur de test.", await marked("project_actions", `LEFT(commentaire, 60)`, "commentaire", "commentaire de test", "REVIEW"));

  const production = async (table, where, labelSql, textSql) =>
    (await q(`SELECT id::text AS id, ${labelSql} AS label, ((${textSql}) ~* :mark) AS marked FROM "${table}" ${where} ORDER BY 2`)).map((r) => ({
      record: r.id,
      label: r.label,
      reason: r.marked ? "valeurs de test dans la fiche" : "aucun marqueur explicite, mais saisie au milieu des essais du module",
      action: r.marked ? "KEEP_TEST" : "REVIEW",
    }));
  add(
    "por_promesh",
    "Fiches de production PROMESH. Toutes datent de la période d'essai.",
    await production("por_promesh", "", `'n° ' || "sequenceNumber" || ' — ' || "dateProduction" || ' — machine ' || machine || ' — ' || status`, `COALESCE(responsable1,'') || ' ' || COALESCE(responsable2,'') || ' ' || COALESCE(operateur1,'') || ' ' || COALESCE(operateur2,'') || ' ' || COALESCE("observationsGenerales",'') || ' ' || COALESCE("descriptionNonConformite",'') || ' ' || COALESCE("justificationControleMachine",'') || ' ' || COALESCE("justificationControleProcess",'')`)
  );
  add(
    "industrial_records",
    "Fiches PROBAR, rapports de mélange et anciennes copies de demandes de maintenance.",
    await production("industrial_records", "", `module || ' — ' || "dateFiche" || ' — machine ' || COALESCE(machine, '(aucune)') || ' — ' || statut`, `COALESCE(operateur,'') || ' ' || COALESCE(observations,'') || ' ' || COALESCE("typePanne",'')`)
  );
  add("recuperable_fiches", "Fiches de déchets récupérables.", await production("recuperable_fiches", "", `module || ' — ' || date || ' — machine ' || machine`, `COALESCE(operateur,'')`));
  add("maintenance_requests", "Demandes de maintenance.", await production("maintenance_requests", "", `'ticket ' || "ticketNo" || ' — ' || equipement || ' — ' || statut`, `"typePanne" || ' ' || COALESCE(description,'')`));
  add("hr_requests", "Demandes RH.", await production("hr_requests", "", `'ticket ' || "ticketNo" || ' — ' || type || ' — ' || COALESCE("employeePrenom",'') || ' ' || COALESCE("employeeNom",'') || ' — ' || statut`, `COALESCE("employeeNom",'') || ' ' || COALESCE("employeePrenom",'') || ' ' || COALESCE("employeeMatricule",'') || ' ' || COALESCE(motif,'') || ' ' || COALESCE("employeeDepartement",'') || ' ' || COALESCE("reviewComment",'')`));
  add("archive_requests", "Demandes d'archivage de projets.", await production("archive_requests", "", `type || ' — ' || status || ' — ' || LEFT(subject, 40)`, `message || ' ' || subject`));

  await t.rollback();

  const total = sections.reduce((s, x) => s + x.rows.length, 0);
  const byAction = {};
  for (const s of sections) for (const r of s.rows) byAction[r.action] = (byAction[r.action] || 0) + 1;
  const lines = [
    "# Revue des données de test",
    "",
    `Générée le ${new Date().toISOString().slice(0, 10)} par \`npm run data:test-review\`, en lecture seule. **Aucune action n'est appliquée** : chaque ligne attend une décision.`,
    "",
    "Actions proposées :",
    "- `KEEP_TEST` : garder la ligne, la marquer TEST et l'exclure des indicateurs ;",
    "- `ARCHIVE` : sortir la ligne de l'usage courant sans la supprimer ;",
    "- `DELETE_AFTER_VALIDATION` : suppression possible, après accord et sauvegarde ;",
    "- `REVIEW` : un humain doit dire si la ligne est réelle.",
    "",
    "## Synthèse",
    "",
    "| Table | Lignes signalées | " + ["KEEP_TEST", "REVIEW", "DELETE_AFTER_VALIDATION", "ARCHIVE"].join(" | ") + " |",
    "|---|---|---|---|---|---|",
    ...sections.map((s) => `| \`${s.title}\` | ${s.rows.length} | ${["KEEP_TEST", "REVIEW", "DELETE_AFTER_VALIDATION", "ARCHIVE"].map((a) => s.rows.filter((r) => r.action === a).length).join(" | ")} |`),
    `| **Total** | **${total}** | ${["KEEP_TEST", "REVIEW", "DELETE_AFTER_VALIDATION", "ARCHIVE"].map((a) => `**${byAction[a] || 0}**`).join(" | ")} |`,
    "",
  ];
  for (const s of sections) {
    lines.push(`## ${s.title} (${s.rows.length})`, "", s.note, "");
    if (!s.rows.length) {
      lines.push("Aucune ligne signalée.", "");
      continue;
    }
    lines.push("| Enregistrement | Identifiant | Raison | Action recommandée |", "|---|---|---|---|");
    for (const r of s.rows) lines.push(`| ${cell(r.label)} | \`${r.record}\` | ${cell(r.reason).length < 70 ? r.reason : cell(r.reason)} | ${r.action} |`);
    lines.push("");
  }
  fs.writeFileSync(OUT, lines.join("\n"));
  // Liste figée, lue par scripts/restructureDataApply.js et scripts/futureDeletionReport.js.
  const rows = sections.flatMap((s) => s.rows.map((r) => ({ table: s.title, ...r })));
  fs.writeFileSync(path.join(path.dirname(OUT), "test-data-review.json"), JSON.stringify({ generatedAt: new Date().toISOString(), total, byAction, rows }, null, 2));
  console.log(`Revue des données de test (lecture seule) : ${total} ligne(s) signalée(s) ${JSON.stringify(byAction)}`);
  for (const s of sections) console.log(`  ${s.title} : ${s.rows.length}`);
  await sequelize.close();
}

main().catch(async (err) => {
  console.error("Revue interrompue :", err.message);
  try {
    await sequelize.close();
  } catch (_e) {
    /* connexion déjà fermée */
  }
  process.exit(1);
});
