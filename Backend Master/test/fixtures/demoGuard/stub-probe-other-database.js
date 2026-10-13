"use strict";
// Simule une connexion de contrôle qui aboutit à une autre base. Aucune connexion n'est ouverte.
require("child_process").spawnSync = () => ({ status: 0, stdout: process.env.FAKE_CONNECTED_DATABASE || "cbigestionnairepfe", stderr: "" });
