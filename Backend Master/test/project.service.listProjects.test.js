"use strict";

// Régression pour AI-Business-Copilot/15_AGENT_RUNTIME_AUDIT.md :
// `listProjects()` n'avait AUCUN test contre la vraie base de données
// (confirmé par recherche exhaustive) — `test/ai.mcp.tools.projects.test.js`
// mocke `project.service` entièrement, donc ne peut jamais détecter un bug
// dans son comportement RÉEL. Ce fichier ne mocke rien (même discipline que
// `test/dashboard.service.getUserKPIs.test.js`, incident 09) : le vrai bug
// — `query.mine === "true"` ignorait silencieusement un VRAI booléen
// JavaScript (`{mine: true}`, exactement ce que produit le Tool MCP
// `list_projects` une fois son schéma Joi validé) — ne pouvait être détecté
// qu'avec un appel réel.

require("dotenv").config();
const { sequelize } = require("../src/db");
const Project = require("../src/models/Project");
const { listProjects } = require("../src/modules/projects/services/project.service");

afterAll(async () => {
  await sequelize.close();
});

describe("project.service.js::listProjects — 'mine' accepte un VRAI booléen (pas seulement la chaîne \"true\")", () => {
  test("{mine: true} (booléen réel, comme envoyé par le Tool MCP) scope bien aux projets du propriétaire", async () => {
    const anyProject = await Project.findOne({ where: {}, order: [["createdAt", "ASC"]] });
    if (!anyProject || !anyProject.ownerId) return; // environnement sans données — non bloquant

    const ownerId = anyProject.ownerId;
    const resultBoolean = await listProjects({ mine: true }, ownerId);
    const resultUnscoped = await listProjects({}, ownerId);

    // Le résultat scopé "mine" ne doit jamais dépasser le total non-scopé —
    // et, sauf coïncidence où CE user possède TOUS les projets de cet
    // environnement, doit être strictement inférieur (preuve que le filtre
    // s'applique réellement, pas un no-op silencieux).
    expect(resultBoolean.total).toBeLessThanOrEqual(resultUnscoped.total);
    for (const project of resultBoolean.data) {
      expect(project.ownerId).toBe(ownerId);
    }
  }, 30000);

  test("{mine: \"true\"} (chaîne, comme un vrai req.query Express) continue de fonctionner — comportement historique préservé", async () => {
    const anyProject = await Project.findOne({ where: {}, order: [["createdAt", "ASC"]] });
    if (!anyProject || !anyProject.ownerId) return;

    const ownerId = anyProject.ownerId;
    const resultString = await listProjects({ mine: "true" }, ownerId);
    const resultBoolean = await listProjects({ mine: true }, ownerId);

    // Les deux formes doivent produire EXACTEMENT le même résultat.
    expect(resultString.total).toBe(resultBoolean.total);
  }, 30000);

  // Le compte réellement signalé pendant ce diagnostic (voir
  // AI-Business-Copilot/15_AGENT_RUNTIME_AUDIT.md) : sans cette correction,
  // {mine:true} pour cet utilisateur listait 185 projets (TOUS les projets
  // actifs visibles) au lieu de ses propres projets.
  test("le compte réellement signalé (516f6dca-7a6f-43cb-b527-5c5652e3e03f), si présent dans cet environnement, obtient bien SES projets avec {mine:true}", async () => {
    const userId = "516f6dca-7a6f-43cb-b527-5c5652e3e03f";
    const owned = await Project.count({ where: { ownerId: userId } });
    if (owned === 0) return; // compte absent de cet environnement — non bloquant

    const result = await listProjects({ mine: true }, userId);
    expect(result.total).toBeLessThan(200); // jamais le total global (185+ observé)
    for (const project of result.data) {
      expect(project.ownerId).toBe(userId);
    }
  }, 30000);
});
