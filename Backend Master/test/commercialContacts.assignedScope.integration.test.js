"use strict";

// Périmètre « assigned » de listCommercialContacts (rôle « commercial ») —
// VRAIE requête SQL, base de tests Jest, LECTURE SEULE. Il doit être
// exactement celui de l'API CRM (contactAccess.policy.js::contactListScope).

const { sequelize } = require("../src/db");
const { listCommercialContacts } = require("../src/modules/commercial-contacts/services/commercialContactKpi.service");
const { contactListScope } = require("../src/modules/commercial-contacts/policies/contactAccess.policy");
const CommercialContact = require("../src/models/CommercialContact");

const q = (sql, replacements = {}) => sequelize.query(sql, { type: "SELECT", replacements });
let userId;

beforeAll(async () => {
  const [{ db }] = await q("select current_database() as db");
  if (!/_test$/.test(db)) throw new Error(`base inattendue : ${db}`);
  // Utilisateur ayant le plus de contacts affectés ou suivis sans les avoir créés.
  const [row] = await q(
    `select u as id from (
       select "commercialId" as u from commercial_contacts where "commercialId" is not null and "commercialId" <> "createdBy"
       union all select "commercialId" from commercial_contact_relances where "commercialId" is not null
     ) s group by u order by count(*) desc limit 1`
  );
  userId = row ? row.id : null;
});

afterAll(() => sequelize.close());

test("« assigned » = contacts créés, affectés ou suivis par relance — même ensemble que la politique de l'API", async () => {
  if (!userId) return console.warn("aucun contact affecté ou suivi dans la base de tests : cas ignoré");
  const scope = await contactListScope({ id: userId, role: "commercial" });
  const expected = await CommercialContact.findAll({ where: scope.where, attributes: ["id"] });
  const got = await listCommercialContacts(userId, { limit: 100 }, { scope: "assigned" });
  expect(got.total).toBe(expected.length);
  const allowed = new Set(expected.map((c) => c.id));
  for (const c of got.contacts) expect(allowed.has(c.id)).toBe(true);
});

test("« assigned » ne renvoie jamais un contact étranger à l'utilisateur ; « created » reste inchangé", async () => {
  if (!userId) return console.warn("aucun contact affecté ou suivi dans la base de tests : cas ignoré");
  const [{ n: all }] = await q(`select count(*)::int n from commercial_contacts`);
  const assigned = await listCommercialContacts(userId, { limit: 1 }, { scope: "assigned" });
  const created = await listCommercialContacts(userId, { limit: 1 });
  const [{ n: createdCount }] = await q(`select count(*)::int n from commercial_contacts where "createdBy" = :u`, { u: userId });
  expect(created.total).toBe(createdCount);
  expect(assigned.total).toBeGreaterThanOrEqual(created.total);
  expect(assigned.total).toBeLessThanOrEqual(all);
  const stranger = "00000000-0000-4000-8000-00000000dead";
  expect((await listCommercialContacts(stranger, { limit: 5 }, { scope: "assigned" })).total).toBe(0);
});
