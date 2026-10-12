"use strict";
// Audit non fonctionnel — isole TOUTE la suite Jest de la base applicative.
// Chargé par Jest (package.json > jest.setupFiles) avant chaque fichier de
// test : force la base `<DB_NAME>_test` (ou DB_NAME_TEST) et neutralise les
// intégrations sortantes (SMTP, crons d'e-mails) pour qu'aucun test ne
// puisse écrire dans la base réelle ni envoyer de message réel.
require("dotenv").config();

const baseName = process.env.DB_NAME || "";
const testName = process.env.DB_NAME_TEST || (baseName.endsWith("_test") ? baseName : `${baseName}_test`);

process.env.NODE_ENV = "test";
process.env.DB_NAME = testName;
if (process.env.DATABASE_URL) {
  process.env.DATABASE_URL = process.env.DATABASE_URL.replace(/\/[^/?]+(\?|$)/, `/${testName}$1`);
}
process.env.AUTO_EMAIL_JOBS_ENABLED = "false";
process.env.EMAIL_HOST = "127.0.0.1";
process.env.EMAIL_PORT = "2525";
