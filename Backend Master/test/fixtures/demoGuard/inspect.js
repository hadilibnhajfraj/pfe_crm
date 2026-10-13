"use strict";
// Exécuté APRÈS le garde-fou, à la place du CRM : décrit l'état du processus en JSON.
// Lecture seule : une seule requête, SELECT current_database(), dans une transaction READ ONLY.
const path = require("path");
const root = process.cwd();
const guard = require(path.join(root, "scripts", "demo", "demo-guard.js"));
const out = {};

(async () => {
  require(path.join(root, "node_modules", "dotenv")).config({ quiet: true }); // comme src/app.js
  out.env = {
    DB_NAME: process.env.DB_NAME,
    DATABASE_URL_database: String(process.env.DATABASE_URL).split("/").pop(),
    AUTO_EMAIL_JOBS_ENABLED: process.env.AUTO_EMAIL_JOBS_ENABLED,
    AUTO_ARCHIVE_ENABLED: process.env.AUTO_ARCHIVE_ENABLED,
    AI_PROACTIVE_MONITORING_ENABLED: process.env.AI_PROACTIVE_MONITORING_ENABLED,
    DEMO_MODE: process.env.DEMO_MODE,
  };

  // Sessions : les secrets du processus diffèrent de ceux du .env (comparaison
  // seulement, aucune valeur n'est écrite). Un jeton signé avec le secret du
  // .env — celui qu'émettrait un backend lancé sans le garde-fou — est refusé.
  {
    const fs = require("fs");
    const jwt = require(path.join(root, "node_modules", "jsonwebtoken"));
    const original = require(path.join(root, "node_modules", "dotenv")).parse(fs.readFileSync(path.join(root, ".env")));
    const { signAccessToken, verifyAccessToken } = require(path.join(root, "src", "utils", "tokens"));
    const { ROLE_VOCABULARY_VERSION } = require(path.join(root, "src", "constants", "roles"));
    const payload = { sub: "516f6dca-7a6f-43cb-b527-5c5652e3e03f", email: "x@exemple.invalid", role: "admin" };
    const foreign = jwt.sign({ ...payload, rv: ROLE_VOCABULARY_VERSION }, original.JWT_ACCESS_SECRET, { expiresIn: "5m", issuer: "my-api", audience: "my-client" });
    const accepts = (token) => { try { verifyAccessToken(token); return true; } catch (_) { return false; } };
    out.sessions = {
      accessSecretDiffersFromEnvFile: process.env.JWT_ACCESS_SECRET !== original.JWT_ACCESS_SECRET,
      refreshSecretDiffersFromEnvFile: process.env.JWT_REFRESH_SECRET !== original.JWT_REFRESH_SECRET,
      secretLength: process.env.JWT_ACCESS_SECRET.length,
      // Empreinte tronquée du secret dérivé (non réversible) : sert seulement à comparer deux lancements.
      fingerprint: require("crypto").createHash("sha256").update(process.env.JWT_ACCESS_SECRET).digest("hex").slice(0, 8),
      foreignTokenAccepted: accepts(foreign),
      demoTokenAccepted: accepts(signAccessToken(payload)),
      demoTokenAcceptedElsewhere: (() => { try { jwt.verify(signAccessToken(payload), original.JWT_ACCESS_SECRET, { issuer: "my-api", audience: "my-client" }); return true; } catch (_) { return false; } })(),
    };
  }

  const { sequelize } = require(path.join(root, "src", "db"));
  if (process.env.SCENARIO === "foreign-connection") {
    // Le crochet réel reçoit une connexion qui répond un autre nom de base.
    await sequelize.runHooks("afterConnect", { query: async () => ({ rows: [{ d: "cbigestionnairepfe" }] }) }, {});
    out.survived = true;
  } else {
    const rows = await sequelize.transaction({ readOnly: true }, (transaction) => sequelize.query("SELECT current_database() AS d", { type: "SELECT", transaction }));
    out.connectedDatabase = rows[0].d;
  }

  // Tâches planifiées : interrupteurs remis à true pour prouver que le blocage ne dépend pas d'eux.
  Object.assign(process.env, { AUTO_EMAIL_JOBS_ENABLED: "true", AUTO_ARCHIVE_ENABLED: "true", AI_PROACTIVE_MONITORING_ENABLED: "true" });
  const log = console.log;
  const lines = [];
  console.log = (...args) => lines.push(args.join(" "));
  for (const file of ["src/services/scheduler", "src/cron/checkProjects", "src/cron/projectCron", "src/cron/followup.job", "src/cron/googleCalendarChannelRenewal.job", "src/cron/proactiveAiMonitor.job"]) require(path.join(root, file));
  console.log = log;
  const cron = require(path.join(root, "node_modules", "node-cron"));
  out.cron = {
    requested: guard.ignoredJobs.length,
    registered: typeof cron.getTasks === "function" ? cron.getTasks().size : null,
    announced: lines.filter((l) => l.includes("Tâche planifiée ignorée")).length,
  };

  // E-mails : un transport demandé avec un vrai serveur SMTP n'ouvre aucune connexion.
  const nodemailer = require(path.join(root, "node_modules", "nodemailer"));
  const transporter = nodemailer.createTransport({ host: "smtp.exemple.tn", port: 587, auth: { user: "u", pass: "p" } });
  const info = await transporter.sendMail({ from: "crm@exemple.tn", to: "client@exemple.tn", subject: "test", text: "test" });
  out.mail = { transport: transporter.transporter.name, deliveredInMemory: typeof info.message === "string" };

  await sequelize.close();
  process.stdout.write(`\n@@RESULT@@${JSON.stringify(out)}\n`);
  process.exit(0);
})().catch((err) => {
  process.stdout.write(`\n@@ERROR@@${err.message}\n`);
  process.exit(3);
});
