"use strict";

// Fiche ingénieur / société — VRAIES requêtes SQL de crmEntityDirectory, sur la
// base de tests Jest (setupTestEnv.js), en LECTURE SEULE. Les fiches utilisées
// sont choisies dans les données présentes ; un cas sans donnée adéquate est
// ignoré (et le dit) plutôt que d'échouer.

const { sequelize } = require("../src/db");
const crm = require("../src/modules/projects/services/crmEntityDirectory.service");

const q = (sql, replacements = {}) => sequelize.query(sql, { type: "SELECT", replacements });
const ALL = { ownerId: null, contacts: { mode: "all", userId: null }, engineerCoordinates: "all" };
const scoped = (ownerId) => ({ ownerId, contacts: { mode: "none", userId: ownerId }, engineerCoordinates: "linked" });

let owner;
let outsider; // ingénieur dont aucun projet n'appartient à `owner`
let company;

beforeAll(async () => {
  const [{ db }] = await q("select current_database() as db");
  if (!/_test$/.test(db)) throw new Error(`base inattendue : ${db}`);
  [owner] = await q(`select p."ownerId" as id, count(*)::int n from projects p where p."ownerId" is not null group by 1 order by n desc limit 1`);
  if (owner) {
    [outsider] = await q(
      `select e.id, trim(e.name) as name, count(p.id)::int n
         from engineers e join projects p on p."engineerId" = e.id
        group by e.id having count(*) filter (where p."ownerId" = :o) = 0 order by n desc limit 1`,
      { o: owner.id }
    );
  }
  [company] = await q(`select c.id, trim(c.name) as name, count(p.id)::int n from companies c join projects p on p."companyId" = c.id group by c.id having count(p.id) > 1 order by n desc limit 1`);
});

afterAll(() => sequelize.close());

describe("crmEntityDirectory — périmètre réel", () => {
  test("ingénieur lu par un administrateur : tous ses projets, rien de masqué", async () => {
    if (!outsider) return console.warn("aucun ingénieur adéquat dans la base de tests : cas ignoré");
    const { matches } = await crm.findEntity("engineer", { name: outsider.id }, ALL);
    expect(matches).toHaveLength(1);
    expect(matches[0].projects.total).toBe(outsider.n);
    expect(matches[0].projects.outOfScope).toBe(0);
    expect(matches[0].restricted).toEqual([]);
  });

  test("même ingénieur lu par un utilisateur qui ne possède aucun de ses projets : 0 visible, N hors périmètre, rien n'est divulgué", async () => {
    if (!outsider) return console.warn("aucun ingénieur adéquat dans la base de tests : cas ignoré");
    const { matches } = await crm.findEntity("engineer", { name: outsider.id }, scoped(owner.id));
    const [m] = matches;
    expect(m.projects.total).toBe(0);
    expect(m.projects.items).toEqual([]);
    expect(m.projects.outOfScope).toBe(outsider.n);
    // Ni coordonnées, ni société, ni bureau d'études tirés de projets qu'il ne voit pas.
    expect(m.fields.phone).toBeNull();
    expect(m.fields.email).toBeNull();
    expect(m.fields.company).toBeNull();
    expect(m.fields.designOffice).toBeNull();
    expect(m.restricted).toEqual(expect.arrayContaining(["phone", "email"]));
  });

  test("société ayant plusieurs projets : projets par la clé companyId, ingénieurs de ces projets", async () => {
    if (!company) return console.warn("aucune société à plusieurs projets dans la base de tests : cas ignoré");
    const { matches } = await crm.findEntity("company", { name: company.id }, ALL);
    const [m] = matches;
    expect(m.projects.total).toBe(company.n);
    expect(m.projects.outOfScope).toBe(0);
    const [{ n }] = await q(
      `select count(distinct lower(coalesce(trim(e.name), trim(p."ingenieurResponsable"))))::int n
         from projects p left join engineers e on e.id = p."engineerId"
        where p."companyId" = :c and coalesce(nullif(trim(e.name), ''), nullif(trim(p."ingenieurResponsable"), '')) is not null`,
      { c: company.id }
    );
    const listed = m.fields.engineers ? m.fields.engineers.split(", ").length : 0;
    expect(listed).toBe(Math.min(n, 15));
  });

  test("société lue dans un périmètre restreint : visibles + hors périmètre = total", async () => {
    if (!company || !owner) return console.warn("données insuffisantes dans la base de tests : cas ignoré");
    const { matches } = await crm.findEntity("company", { name: company.id }, scoped(owner.id));
    expect(matches[0].projects.total + matches[0].projects.outOfScope).toBe(company.n);
  });

  test("architecte : projets par la clé architectId, même règle de périmètre", async () => {
    const [architect] = await q(`select a.id, count(p.id)::int n from architects a join projects p on p."architectId" = a.id group by a.id order by n desc limit 1`);
    if (!architect) return console.warn("aucun architecte lié à un projet dans la base de tests : cas ignoré");
    const all = await crm.findEntity("architect", { name: architect.id }, ALL);
    expect(all.matches[0].entityType).toBe("architect");
    expect(all.matches[0].projects.total).toBe(architect.n);
    const mine = await crm.findEntity("architect", { name: architect.id }, scoped(owner.id));
    expect(mine.matches[0].projects.total + mine.matches[0].projects.outOfScope).toBe(architect.n);
  });

  test("liste des sociétés : total réel de la table, noms triés, sans doublon entre deux pages", async () => {
    const [{ n }] = await q(`select count(*)::int n from companies where name is not null and trim(name) <> ''`);
    const first = await crm.listCompanies({ limit: 20, offset: 0 }, ALL);
    const second = await crm.listCompanies({ limit: 20, offset: 20 }, ALL);
    expect(first.total).toBe(n);
    expect(first.view).toBe("names");
    const ids = [...first.items, ...second.items].map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("avec / sans projet : les deux filtres se partagent exactement le total", async () => {
    const all = await crm.listCompanies({ limit: 1 }, ALL);
    const withP = await crm.listCompanies({ limit: 1, filter: "with_projects" }, ALL);
    const without = await crm.listCompanies({ limit: 1, filter: "without_projects" }, ALL);
    expect(withP.total + without.total).toBe(all.total);
    expect(withP.totalAll).toBe(all.total);
  });

  test("sociétés avec leurs projets : projets regroupés par la clé companyId, sans doublon, périmètre respecté", async () => {
    if (!company || !owner) return console.warn("données insuffisantes dans la base de tests : cas ignoré");
    const all = await crm.listCompanies({ limit: 200, view: "projects" }, ALL);
    expect(all.projectsLoaded).toBe(true);
    const item = all.items.find((i) => i.id === company.id);
    expect(item.projects).toBe(company.n);
    expect(new Set(item.projectItems.map((p) => p.id)).size).toBe(item.projectItems.length);
    expect(item.outOfScope).toBe(0);
    const mine = await crm.listCompanies({ limit: 200, view: "projects" }, scoped(owner.id));
    const scopedItem = mine.items.find((i) => i.id === company.id);
    expect(scopedItem.projects + scopedItem.outOfScope).toBe(company.n);
    const [{ n }] = await q(`select count(*)::int n from projects where "companyId" = :c and "ownerId" = :o`, { c: company.id, o: owner.id });
    expect(scopedItem.projects).toBe(n);
  });

  test("nom inconnu : aucun résultat, aucune fiche", async () => {
    const r = await crm.findEntity("engineer", { name: "Zzqx Inexistant Wvk" }, ALL);
    expect(r.matches).toEqual([]);
    expect(r.matchType).toBeNull();
  });
});
