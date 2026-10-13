"use strict";
// Simule une configuration visant la base réelle. Aucune connexion n'est ouverte.
const path = require("path");
const target = require(path.resolve("scripts/demo-seeder/lib/target"));
target.loadConfig = () => ({ target: { host: "127.0.0.1", port: 5432, user: "postgres", database: "cbigestionnairepfe", passwordEnv: "DEMO_DB_PASSWORD", passwordFallbackEnv: "DB_PASSWORD" } });
