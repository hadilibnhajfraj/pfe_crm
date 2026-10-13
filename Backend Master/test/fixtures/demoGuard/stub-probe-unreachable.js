"use strict";
// Simule une connexion de contrôle impossible. Aucune connexion n'est ouverte.
require("child_process").spawnSync = () => ({ status: 2, stdout: "", stderr: "ECONNREFUSED" });
