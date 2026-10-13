"use strict";

// Garde-fou du lancement de démonstration (scripts/demo/demo-guard.js).
//
// Le serveur n'est jamais démarré : chaque cas lance un processus Node qui
// précharge le garde-fou, puis un petit script d'inspection à la place du CRM.
// Les cas de refus n'ouvrent aucune connexion (configuration ou sonde simulées).
// Les cas nominaux lisent la base de démonstration : une sonde et une requête
// SELECT current_database() dans une transaction READ ONLY. Aucune écriture,
// aucune connexion à la base réelle.

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.join(__dirname, "..");
const GUARD = path.join(ROOT, "scripts", "demo", "demo-guard.js");
const FIXTURES = path.join(__dirname, "fixtures", "demoGuard");
const INSPECT = path.join(FIXTURES, "inspect.js");
const JEST_ONLY = ["JEST_WORKER_ID", "NODE_ENV", "DB_NAME", "DB_NAME_TEST", "DATABASE_URL", "AUTO_EMAIL_JOBS_ENABLED", "EMAIL_HOST", "EMAIL_PORT"];

function launch({ preload = [], env = {} } = {}) {
  // Réglages posés par Jest retirés : le garde-fou doit se suffire à lui-même.
  const childEnv = { ...process.env, ...env };
  for (const key of JEST_ONLY) if (!(key in env)) delete childEnv[key];
  const args = [...preload.flatMap((f) => ["-r", path.join(FIXTURES, f)]), "-r", GUARD, INSPECT];
  const run = spawnSync(process.execPath, args, { cwd: ROOT, env: childEnv, encoding: "utf8", timeout: 120000 });
  const marker = (run.stdout || "").split("@@RESULT@@")[1];
  return { status: run.status, stdout: run.stdout || "", stderr: run.stderr || "", result: marker ? JSON.parse(marker.trim()) : null };
}

jest.setTimeout(180000);

describe("refus de démarrage — aucune connexion ouverte", () => {
  test("configuration visant la base réelle", () => {
    const run = launch({ preload: ["stub-real-database-config.js"] });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/DÉMARRAGE REFUSÉ : la configuration vise « cbigestionnairepfe », pas « cbigestionnairepfe_demo »/);
    expect(run.result).toBeNull();
  });

  test("hôte distant", () => {
    const run = launch({ preload: ["stub-remote-host.js"] });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/seule une base locale est acceptée/);
    expect(run.result).toBeNull();
  });

  test("NODE_ENV=production", () => {
    const run = launch({ env: { NODE_ENV: "production" } });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/NODE_ENV=production/);
    expect(run.result).toBeNull();
  });

  test.each(["cbigestionnairepfe", "cbigestionnairepfe_demo_test", "cbigestionnairepfe_test", "CBIGESTIONNAIREPFE_DEMO", "cbigestionnairepfe_demo2"])(
    "la connexion de contrôle aboutit à « %s »",
    (database) => {
      const run = launch({ preload: ["stub-probe-other-database.js"], env: { FAKE_CONNECTED_DATABASE: database } });
      expect(run.status).toBe(1);
      expect(run.stderr).toContain(`la connexion aboutit à « ${database} », pas à « cbigestionnairepfe_demo »`);
      expect(run.result).toBeNull();
    }
  );

  test("connexion de contrôle impossible", () => {
    const run = launch({ preload: ["stub-probe-unreachable.js"] });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/connexion de contrôle impossible \(ECONNREFUSED\)/);
    expect(run.result).toBeNull();
  });

  test("le refus intervient avant le chargement du CRM", () => {
    const run = launch({ preload: ["stub-probe-other-database.js"] });
    expect(run.stdout).not.toMatch(/CRM Scheduler started|PROACTIVE AI MONITOR|DB connected/);
  });
});

describe("démarrage nominal — base de démonstration, lecture seule", () => {
  let run;
  beforeAll(() => {
    run = launch();
  });

  test("le garde-fou laisse passer et annonce la base vérifiée", () => {
    expect(run.status).toBe(0);
    expect(run.stdout).toMatch(/\[demo-guard\] Base vérifiée : cbigestionnairepfe_demo sur 127\.0\.0\.1:5432\./);
  });

  test("la connexion du CRM vise la base de démonstration", () => {
    expect(run.result.connectedDatabase).toBe("cbigestionnairepfe_demo");
  });

  test("le .env, rechargé comme le fait src/app.js, ne reprend pas la main", () => {
    expect(run.result.env).toEqual({
      DB_NAME: "cbigestionnairepfe_demo",
      DATABASE_URL_database: "cbigestionnairepfe_demo",
      AUTO_EMAIL_JOBS_ENABLED: "false",
      AUTO_ARCHIVE_ENABLED: "false",
      AI_PROACTIVE_MONITORING_ENABLED: "false",
      DEMO_MODE: "true",
    });
  });

  test("aucune tâche planifiée n'est créée, même interrupteurs remis à true", () => {
    expect(run.result.cron.requested).toBe(6);
    expect(run.result.cron.announced).toBe(6);
    expect([0, null]).toContain(run.result.cron.registered);
  });

  test("aucun e-mail ne sort : le transport écrit en mémoire", () => {
    expect(run.result.mail).toEqual({ transport: "JSONTransport", deliveredInMemory: true });
  });

  // Cause de « 0 projet » pour un compte autorisé : un jeton émis par un
  // backend branché sur une autre base était accepté ici, alors que son
  // utilisateur n'existe pas dans la base de démonstration.
  test("sessions isolées : un jeton signé avec le secret du .env est refusé", () => {
    expect(run.result.sessions.accessSecretDiffersFromEnvFile).toBe(true);
    expect(run.result.sessions.refreshSecretDiffersFromEnvFile).toBe(true);
    expect(run.result.sessions.foreignTokenAccepted).toBe(false);
  });

  test("sessions isolées : un jeton émis en mode démonstration y est accepté, et refusé ailleurs", () => {
    expect(run.result.sessions.demoTokenAccepted).toBe(true);
    expect(run.result.sessions.demoTokenAcceptedElsewhere).toBe(false);
    expect(run.result.sessions.secretLength).toBe(64);
  });

  test("sessions isolées : le secret dérivé est stable d'un lancement à l'autre", () => {
    const again = launch();
    expect(again.result.sessions.fingerprint).toBe(run.result.sessions.fingerprint);
    expect(again.stdout).toMatch(/Sessions isolées/);
  });

  test("aucun secret dans les traces", () => {
    const out = run.stdout + run.stderr;
    expect(out).not.toMatch(/postgres:\/\//);
    expect(out).not.toMatch(/password\s*[:=]/i);
    if (process.env.DB_PASSWORD) expect(out).not.toContain(process.env.DB_PASSWORD);
  });
});

describe("pendant l'exécution", () => {
  test("une connexion du CRM vers une autre base arrête le processus", () => {
    const run = launch({ env: { SCENARIO: "foreign-connection" } });
    expect(run.status).toBe(1);
    expect(run.stderr).toMatch(/DÉMARRAGE REFUSÉ : une connexion du CRM vise « cbigestionnairepfe »/);
    expect(run.result).toBeNull();
  });
});

describe("séparation d'avec le lancement normal", () => {
  const scripts = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8")).scripts;
  const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

  test("npm start et npm run dev sont inchangés", () => {
    expect(scripts.start).toBe("node src/app.js");
    expect(scripts.dev).toBe("nodemon src/app.js");
  });

  test("le mode démonstration est un script distinct qui précharge le garde-fou", () => {
    expect(scripts["demo:start"]).toBe("node -r ./scripts/demo/demo-guard.js src/app.js");
  });

  test("aucun fichier du CRM ne charge le garde-fou", () => {
    const users = walk(path.join(ROOT, "src")).filter((f) => f.endsWith(".js") && /demo-guard/.test(fs.readFileSync(f, "utf8")));
    expect(users).toEqual([]);
  });

  test("le garde-fou n'écrit dans aucun fichier", () => {
    expect(fs.readFileSync(GUARD, "utf8")).not.toMatch(/writeFile|appendFile|createWriteStream/);
  });
});
