"use strict";

// Cohérence tableau de bord « Commercial Contacts KPI » ↔ Copilot, sur les
// VRAIES requêtes SQL (base de tests Jest, LECTURE SEULE) : pour un même
// périmètre, le nombre de contacts par statut de la requête du tableau de
// bord (getCommercialContactKPI → statusDistribution) est celui que renvoie
// la requête du Copilot (listCommercialContacts filtrée sur le statut).

const { sequelize } = require("../src/db");
const kpi = require("../src/modules/commercial-contacts/services/commercialContactKpi.service");

const q = (sql, replacements = {}) => sequelize.query(sql, { type: "SELECT", replacements });
const STATUSES = ["ok", "user_injoignable", "rappeler_plus_tard", "client_refuse"];
let logSpy;

beforeAll(async () => {
  const [{ db }] = await q("select current_database() as db");
  if (!/_test$/.test(db)) throw new Error(`base inattendue : ${db}`);
  logSpy = jest.spyOn(console, "log").mockImplementation(() => {});
});
afterAll(async () => {
  logSpy.mockRestore();
  await sequelize.close();
});

const dashboardCounts = (distribution) => Object.fromEntries(distribution.map((r) => [r.status, r.count]));

test("le statut est une colonne ENUM de commercial_contacts, à 4 valeurs — celles que le Copilot utilise", async () => {
  const rows = await q(`select e.enumlabel as v from pg_type t join pg_enum e on e.enumtypid = t.oid where t.typname = 'enum_commercial_contacts_statut' order by 1`);
  expect(rows.map((r) => r.v).sort()).toEqual([...STATUSES].sort());
});

test("périmètre global (administrateur) : chaque statut donne le même nombre des deux côtés", async () => {
  const dashboard = dashboardCounts((await kpi.getCommercialContactKPI(null)).statusDistribution);
  for (const status of STATUSES) {
    const copilot = await kpi.listCommercialContacts(null, { status, limit: 1 });
    expect(copilot.total).toBe(dashboard[status] || 0);
  }
  const [{ n }] = await q(`select count(*)::int n from commercial_contacts`);
  expect(Object.values(dashboard).reduce((a, b) => a + b, 0)).toBe(n);
});

test("périmètre d'un créateur (commercial sédentaire) : mêmes nombres des deux côtés, et contacts tous au statut demandé", async () => {
  const [creator] = await q(`select "createdBy" as id from commercial_contacts where "createdBy" is not null group by 1 order by count(*) desc limit 1`);
  if (!creator) return console.warn("aucun contact avec créateur dans la base de tests : cas ignoré");
  const dashboard = dashboardCounts((await kpi.getCommercialContactKPI(creator.id)).statusDistribution);
  for (const status of STATUSES) {
    const copilot = await kpi.listCommercialContacts(creator.id, { status, limit: 100 });
    expect(copilot.total).toBe(dashboard[status] || 0);
    for (const c of copilot.contacts) expect(c.statut).toBe(status);
  }
});

test("périmètre « assigned » d'un commercial : sous-ensemble du global, jamais davantage ; utilisateur sans contact → 0", async () => {
  const global = await kpi.listCommercialContacts(null, { status: "client_refuse", limit: 1 });
  const [any] = await q(`select "commercialId" as id from commercial_contacts where "commercialId" is not null group by 1 order by count(*) desc limit 1`);
  if (any) {
    const scoped = await kpi.listCommercialContacts(any.id, { status: "client_refuse", limit: 1 }, { scope: "assigned" });
    const [{ n }] = await q(
      `select count(*)::int n from commercial_contacts c where c.statut = 'client_refuse' and (c."createdBy" = :u or c."commercialId" = :u or c.id in (select r."commercialContactId" from commercial_contact_relances r where r."commercialId" = :u))`,
      { u: any.id }
    );
    expect(scoped.total).toBe(n);
    expect(scoped.total).toBeLessThanOrEqual(global.total);
  }
  const nobody = await kpi.listCommercialContacts("00000000-0000-4000-8000-00000000dead", { status: "client_refuse", limit: 1 }, { scope: "assigned" });
  expect(nobody.total).toBe(0);
});

test("aucune relation contact → projet n'existe dans le schéma (ni colonne, ni clé étrangère)", async () => {
  const columns = await q(`select column_name from information_schema.columns where table_name = 'projects' and (column_name ilike '%contact%')`);
  const fks = await q(
    `select conname from pg_constraint where contype = 'f' and ((conrelid = 'projects'::regclass and confrelid = 'commercial_contacts'::regclass) or (conrelid = 'commercial_contacts'::regclass and confrelid = 'projects'::regclass))`
  );
  expect(columns).toEqual([]);
  expect(fks).toEqual([]);
});
