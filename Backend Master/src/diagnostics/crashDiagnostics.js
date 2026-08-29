"use strict";

// ⚠️ TEMPORAIRE — Mission "CAPTURER L'EXCEPTION EXACTE DU CRASH NODE.JS".
// N'ajoute AUCUN comportement métier : capture uniquement, pour diagnostic,
// l'exception réelle qu'un crash `[nodemon] app crashed` laissait jusqu'ici
// invisible (aucun `process.on("uncaughtException"/"unhandledRejection")`
// n'existait nulle part dans `src/` avant ce fichier — vérifié par grep lors
// de la mission précédente). Les deux handlers loggent puis laissent le
// process mourir exactement comme avant (`process.exit(1)`, même code de
// sortie qu'un crash Node non intercepté) — jamais un `try/catch` qui
// transformerait le crash en réponse dégradée normale. À retirer une fois la
// cause réelle identifiée (voir `install()` ci-dessous, appelé une seule
// fois depuis `app.js`).

let lastCronContext = null;

// Appelé par chaque cron instrumenté (voir followup.job.js/scheduler.js/...)
// juste avant/après son log "CRON START"/"CRON END" existant — ne remplace
// ni ne modifie ces logs, ne change aucune condition métier.
function setCronContext(name, phase) {
  lastCronContext = {
    name,
    phase, // "start" | "end"
    timestamp: new Date().toISOString(),
  };
}

function getLastCronContext() {
  return lastCronContext;
}

function logDiagnosticContext() {
  console.error("timestamp:", new Date().toISOString());
  console.error("pid:", process.pid);
  console.error("NODE_ENV:", process.env.NODE_ENV || "(non défini)");
  console.error("lastCronContext:", lastCronContext);
}

let installed = false;

function install() {
  if (installed) return; // idempotent — évite un double enregistrement si require() est appelé deux fois
  installed = true;

  process.on("uncaughtException", (error) => {
    console.error("========== UNCAUGHT EXCEPTION ==========");
    console.error("name:", error?.name);
    console.error("message:", error?.message);
    console.error("stack:", error?.stack);
    logDiagnosticContext();
    console.error("========================================");
    process.exit(1);
  });

  process.on("unhandledRejection", (reason) => {
    console.error("========== UNHANDLED REJECTION ==========");
    console.error("reason:", reason);
    if (reason instanceof Error) {
      console.error("name:", reason.name);
      console.error("message:", reason.message);
      console.error("stack:", reason.stack);
    }
    logDiagnosticContext();
    console.error("=========================================");
    process.exit(1);
  });
}

module.exports = { install, setCronContext, getLastCronContext };
