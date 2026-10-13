"use strict";
// Simule une configuration visant un hôte distant. Aucune connexion n'est ouverte.
const path = require("path");
const target = require(path.resolve("scripts/demo-seeder/lib/target"));
const loadConfig = target.loadConfig;
target.loadConfig = () => {
  const config = loadConfig();
  config.target.host = "db.exemple.tn";
  return config;
};
