"use strict";
// Génère la collection Postman de l'audit (format v2.1) et son environnement.
//   node nfr/postman/build-collection.js
// Sorties : nfr/postman/CRM_PROBAR.postman_collection.json
//           nfr/postman/CRM_PROBAR.test.postman_environment.json
// La collection se décrit ici sous forme de tableau pour rester lisible et
// maintenable ; chaque requête porte ses assertions (pm.test).
const fs = require("fs");
const path = require("path");

const NIL = "00000000-0000-0000-0000-000000000000";
const ROLES = ["commercial", "commercial_sedentaire", "accueil", "responsable_logistique_achat", "admin", "superadmin", "superadmin2"];
const RLA = "responsable_logistique_achat";
const SED = "commercial_sedentaire";

// --- fabrique d'assertions -------------------------------------------------
const status = (...codes) =>
  codes.length === 1
    ? `pm.test("Code HTTP ${codes[0]}", () => pm.response.to.have.status(${codes[0]}));`
    : `pm.test("Code HTTP ${codes.join(" ou ")}", () => pm.expect(pm.response.code).to.be.oneOf([${codes.join(", ")}]));`;
const isJson = `pm.test("Réponse JSON", () => pm.response.to.be.json);`;
const has = (label, expr) => `pm.test(${JSON.stringify(label)}, () => { const b = pm.response.json(); pm.expect(${expr}, ${JSON.stringify(label)}).to.be.ok; });`;
const save = (name, expr) => `{ const b = pm.response.json(); pm.collectionVariables.set(${JSON.stringify(name)}, ${expr}); }`;
const noToken = `pm.test("Aucun jeton émis", () => pm.expect(pm.response.json().accessToken).to.be.undefined);`;

function req(name, method, url, { role, body, tests = [] } = {}) {
  const header = [];
  if (body !== undefined) header.push({ key: "Content-Type", value: "application/json" });
  if (role) header.push({ key: "Authorization", value: role === "INVALID" ? "Bearer jeton.invalide.xyz" : `Bearer {{token_${role}}}` });
  const item = {
    name,
    request: { method, header, url: `{{baseUrl}}${url}` },
    event: [{ listen: "test", script: { type: "text/javascript", exec: tests } }],
  };
  if (body !== undefined) item.request.body = { mode: "raw", raw: JSON.stringify(body, null, 2), options: { raw: { language: "json" } } };
  return item;
}
const folder = (name, item) => ({ name, item });
const login = (role) =>
  req(`Connexion ${role}`, "POST", "/auth/signin", {
    body: { email: `qa.${role}@qa-probar.com`, password: "{{qaPassword}}" },
    tests: [
      status(200),
      isJson,
      has("accessToken présent", "typeof b.accessToken === 'string'"),
      has(`rôle = ${role}`, `b.user.role === '${role}'`),
      `pm.test("Le hash du mot de passe n'est pas exposé", () => pm.expect(pm.response.text()).to.not.include("passwordHash"));`,
      save(`token_${role}`, "b.accessToken"),
      save(`id_${role}`, "b.user.id"),
      ...(role === "commercial" ? [save("refresh_commercial", "b.refreshToken")] : []),
    ],
  });

// --- contenu ---------------------------------------------------------------
const collection = [
  folder("Authentication", [
    req("Sonde de santé", "GET", "/health", { tests: [status(200), isJson, has("status = ok", "b.status === 'ok'"), has("base de données joignable", "b.database === 'up'")] }),
    req("Rafraîchissement — jeton absent", "POST", "/auth/refresh", { body: {}, tests: [status(401)] }),
    ...ROLES.map(login),
    req("Connexion — mot de passe incorrect", "POST", "/auth/signin", { body: { email: "qa.commercial@qa-probar.com", password: "MauvaisMotDePasse1" }, tests: [status(401), noToken] }),
    req("Connexion — e-mail inconnu", "POST", "/auth/signin", { body: { email: "inconnu@qa-probar.com", password: "{{qaPassword}}" }, tests: [status(401), noToken] }),
    req("Connexion — e-mail mal formé", "POST", "/auth/signin", { body: { email: "pas-un-email", password: "{{qaPassword}}" }, tests: [status(400)] }),
    req("Connexion — mot de passe trop court", "POST", "/auth/signin", { body: { email: "qa.commercial@qa-probar.com", password: "abc" }, tests: [status(400)] }),
    req("Connexion — compte désactivé", "POST", "/auth/signin", { body: { email: "qa.inactive@qa-probar.com", password: "{{qaPassword}}" }, tests: [status(403), noToken] }),
    req("Profil courant — JWT valide", "GET", "/me", { role: "commercial", tests: [status(200), has("rôle commercial", "b.user.role === 'commercial'")] }),
    req("Profil courant — JWT absent", "GET", "/me", { tests: [status(401)] }),
    req("Profil courant — JWT invalide", "GET", "/me", { role: "INVALID", tests: [status(401)] }),
    req("Rafraîchissement — jeton valide", "POST", "/auth/refresh", { body: { refreshToken: "{{refresh_commercial}}" }, tests: [status(200), has("nouvel accessToken", "typeof b.accessToken === 'string'")] }),
    req("Métriques — sans jeton", "GET", "/metrics", { tests: [status(401)] }),
  ]),

  folder("Users", [
    req("Liste des utilisateurs — superadmin", "GET", "/admin/users", { role: "superadmin", tests: [status(200), isJson, has("tableau non vide", "Array.isArray(b) ? b.length > 0 : (b.users || b.data || b.items).length > 0"), `pm.test("Aucun hash de mot de passe exposé", () => pm.expect(pm.response.text()).to.not.include("passwordHash"));`] }),
    req("Liste des utilisateurs — admin", "GET", "/admin/users", { role: "admin", tests: [status(200)] }),
    req("Liste des utilisateurs — commercial refusé", "GET", "/admin/users", { role: "commercial", tests: [status(403)] }),
    req("Liste des utilisateurs — accueil refusé", "GET", "/users", { role: "accueil", tests: [status(403)] }),
    req("Liste des utilisateurs — sans jeton", "GET", "/admin/users", { tests: [status(401)] }),
    req("Mon profil", "GET", "/users/me/profile", { role: "commercial", tests: [status(200), isJson] }),
    req("Changer un rôle — rôle inexistant", "PUT", "/admin/users/{{id_accueil}}/role", { role: "superadmin", body: { role: "pirate" }, tests: [status(400)] }),
    req("Changer un rôle — admin simple refusé", "PUT", "/admin/users/{{id_accueil}}/role", { role: "admin", body: { role: "commercial" }, tests: [status(403)] }),
    req("Changer un rôle — commercial refusé", "PUT", "/admin/users/{{id_accueil}}/role", { role: "commercial", body: { role: "superadmin" }, tests: [status(403)] }),
    req("Désactiver un compte — RLA refusé", "PUT", "/admin/users/{{id_accueil}}/active", { role: RLA, body: { isActive: false }, tests: [status(403)] }),
  ]),

  folder("Contacts", [
    req("Créer un contact — nom manquant", "POST", "/commercial-contacts", { role: SED, body: { prenom: "Sans", telephone: "20000001" }, tests: [status(400)] }),
    req("Créer un contact — RLA refusé", "POST", "/commercial-contacts", { role: RLA, body: { nom: "X", prenom: "Y", telephone: "20000001" }, tests: [status(403)] }),
    req("Créer un contact", "POST", "/commercial-contacts", { role: SED, body: { typeClient: "Tuteur", nom: "NEWMAN", prenom: "Contact", telephone: "20000001", statut: "ok" }, tests: [status(201), isJson, has("identifiant présent", "!!b.id"), has("créateur = commercial sédentaire", "b.createdBy === pm.collectionVariables.get('id_commercial_sedentaire')"), has("étape Prospect par défaut", "b.pipelineStage === 'Prospect'"), save("contactId", "b.id")] }),
    req("Lire le contact", "GET", "/commercial-contacts/{{contactId}}", { role: SED, tests: [status(200), has("bon contact", "b.id === pm.collectionVariables.get('contactId')")] }),
    req("Lister les contacts", "GET", "/commercial-contacts", { role: SED, tests: [status(200), has("tableau", "Array.isArray(b)")] }),
    req("Lister les contacts — RLA refusé", "GET", "/commercial-contacts", { role: RLA, tests: [status(403)] }),
    req("Lire un contact inexistant", "GET", `/commercial-contacts/${NIL}`, { role: SED, tests: [status(404)] }),
    req("Modifier — accueil non créateur refusé", "PUT", "/commercial-contacts/{{contactId}}", { role: "accueil", body: { nom: "Modifié" }, tests: [status(403)] }),
    req("Affecter — commercial refusé", "POST", "/commercial-contacts/assign", { role: "commercial", body: { contactIds: ["{{contactId}}"], commercialId: "{{id_commercial}}" }, tests: [status(403)] }),
    req("Affecter — liste vide", "POST", "/commercial-contacts/assign", { role: SED, body: { contactIds: [], commercialId: "{{id_commercial}}" }, tests: [status(400)] }),
    req("Affecter — destinataire non commercial", "POST", "/commercial-contacts/assign", { role: SED, body: { contactIds: ["{{contactId}}"], commercialId: "{{id_accueil}}" }, tests: [status(400)] }),
    req("Affecter à un commercial", "POST", "/commercial-contacts/assign", { role: SED, body: { contactIds: ["{{contactId}}"], commercialId: "{{id_commercial}}" }, tests: [status(200), has("1 contact mis à jour", "b.updatedCount === 1")] }),
    req("Le commercial affecté lit le contact", "GET", "/commercial-contacts/{{contactId}}", { role: "commercial", tests: [status(200), has("commercialId = commercial", "b.commercialId === pm.collectionVariables.get('id_commercial')"), has("assignedBy = commercial sédentaire", "b.assignedBy === pm.collectionVariables.get('id_commercial_sedentaire')")] }),
    req("Supprimer — commercial refusé", "DELETE", "/commercial-contacts/{{contactId}}", { role: "commercial", tests: [status(403)] }),
  ]),

  folder("Projects", [
    req("Lister les projets", "GET", "/projects?limit=5", { role: "commercial", tests: [status(200), isJson, has("items est un tableau", "Array.isArray(b.items)"), has("au plus 5 éléments", "b.items.length <= 5"), has("total numérique", "typeof b.total === 'number'"), save("projectId", "b.items[0].id")] }),
    req("Lister les projets — sans jeton", "GET", "/projects", { tests: [status(401)] }),
    req("Lister les projets — RLA refusé", "GET", "/projects", { role: RLA, tests: [status(403)] }),
    req("Lire un projet", "GET", "/projects/{{projectId}}", { role: "superadmin", tests: [status(200), isJson] }),
    req("Lire un projet inexistant", "GET", `/projects/${NIL}`, { role: "commercial", tests: [status(404)] }),
    req("Créer un projet — données invalides", "POST", "/projects", { role: "commercial", body: {}, tests: [status(400), has("liste d'erreurs", "Array.isArray(b.errors) && b.errors.length > 0")] }),
    req("Créer un projet — RLA refusé", "POST", "/projects", { role: RLA, body: { nomProjet: "X" }, tests: [status(403)] }),
    req("Étapes du pipeline", "GET", "/pipeline-stages", { role: "commercial", tests: [status(200), isJson] }),
    req("Indicateurs projets", "GET", "/projects/kpi/dashboard", { role: "commercial", tests: [status(200), isJson] }),
  ]),

  folder("Actions", [
    req("Actions du contact", "GET", "/commercial-contacts/{{contactId}}/actions", { role: SED, tests: [status(200), has("au moins une action", "Array.isArray(b) && b.length >= 1")] }),
    req("Relance — date manquante", "POST", "/commercial-contacts/{{contactId}}/relances", { role: SED, body: {}, tests: [status(400)] }),
    req("Créer une relance", "POST", "/commercial-contacts/{{contactId}}/relances", { role: SED, body: { dateRelance: "2027-01-15", heureRelance: "10:00", commentaire: "Relance Newman" }, tests: [status(201), has("statut planifiee", "b.statutRelance === 'planifiee'"), has("rattachée au contact", "b.commercialContactId === pm.collectionVariables.get('contactId')")] }),
    req("Relance — contact inexistant", "POST", `/commercial-contacts/${NIL}/relances`, { role: "superadmin", body: { dateRelance: "2027-01-15" }, tests: [status(404)] }),
    req("Relance — sans jeton", "POST", "/commercial-contacts/{{contactId}}/relances", { body: { dateRelance: "2027-01-15" }, tests: [status(401)] }),
    req("Nettoyage — supprimer le contact (superadmin)", "DELETE", "/commercial-contacts/{{contactId}}", { role: "superadmin", tests: [status(200)] }),
    req("Le contact supprimé n'existe plus", "GET", "/commercial-contacts/{{contactId}}", { role: "superadmin", tests: [status(404)] }),
  ]),

  folder("Production", [
    req("Machines — liste", "GET", "/machines", { role: RLA, tests: [status(200), has("liste non vide", "b.data.length > 0"), has("types PROBAR / PROMESH uniquement", "b.data.every(m => ['PROBAR','PROMESH'].includes(m.typeMachine))")] }),
    req("Machines — numéro manquant", "POST", "/machines", { role: RLA, body: { typeMachine: "PROBAR" }, tests: [status(400)] }),
    req("Machines — type inconnu", "POST", "/machines", { role: RLA, body: { typeMachine: "AUTRE", numero: 50 }, tests: [status(400)] }),
    req("Machines — doublon", "POST", "/machines", { role: RLA, body: { typeMachine: "PROBAR", numero: 1 }, tests: [status(409)] }),
    req("Machines — commercial refusé en écriture", "POST", "/machines", { role: "commercial", body: { typeMachine: "PROBAR", numero: 50 }, tests: [status(403)] }),
    req("POR — poste manquant", "POST", "/por-promesh/new", { role: RLA, body: { machine: "1" }, tests: [status(400)] }),
    req("POR — commercial refusé", "POST", "/por-promesh/new", { role: "commercial", body: { machine: "1", poste: "matin" }, tests: [status(403)] }),
    req("POR — nouvelle fiche", "POST", "/por-promesh/new", { role: RLA, body: { machine: "1", poste: "matin" }, tests: [status(200, 201), has("statut BROUILLON", "b.data.status === 'BROUILLON'"), save("porId", "b.data.id")] }),
    req("POR — modifier le brouillon", "PUT", "/por-promesh/{{porId}}", { role: RLA, body: { operateur: "Opérateur Newman" }, tests: [status(200), has("non verrouillée", "b.data.isLocked === false")] }),
    req("POR — valider", "POST", "/por-promesh/{{porId}}/validate", { role: RLA, tests: [status(200), has("statut VALIDE", "b.data.status === 'VALIDE'"), has("verrouillée", "b.data.isLocked === true"), has("date de validation", "!!b.data.validatedAt")] }),
    req("POR — modification après validation refusée", "PUT", "/por-promesh/{{porId}}", { role: RLA, body: { operateur: "Interdit" }, tests: [status(403)] }),
    req("POR — modification par superadmin refusée", "PUT", "/por-promesh/{{porId}}", { role: "superadmin", body: { operateur: "Interdit" }, tests: [status(403)] }),
    req("POR — seconde validation refusée", "POST", "/por-promesh/{{porId}}/validate", { role: RLA, tests: [status(403)] }),
    req("POR — la fiche validée reste inchangée", "GET", "/por-promesh/{{porId}}", { role: RLA, tests: [status(200), has("opérateur inchangé", "b.data.operateur === 'Opérateur Newman'"), has("toujours verrouillée", "b.data.isLocked === true")] }),
    req("POR — liste refusée au commercial", "GET", "/por-promesh", { role: "commercial", tests: [status(403)] }),
    req("POR — fiche inexistante", "GET", `/por-promesh/${NIL}`, { role: RLA, tests: [status(404)] }),
    req("Fiche de production — module inconnu", "POST", "/industrial-records", { role: RLA, body: { module: "inconnu", dateFiche: "2026-10-03" }, tests: [status(400)] }),
    req("Fiche de production — Mélange sans machine", "POST", "/industrial-records", { role: RLA, body: { module: "melange", dateFiche: "2026-10-03" }, tests: [status(201), has("machine facultative (machineId nul)", "b.data.machineId === null"), save("recordId", "b.data.id")] }),
    req("Fiche de production — lecture", "GET", "/industrial-records/{{recordId}}", { role: RLA, tests: [status(200)] }),
    req("Fiche de production — accueil refusé", "GET", "/industrial-records", { role: "accueil", tests: [status(403)] }),
    req("Nettoyage — supprimer la fiche de production", "DELETE", "/industrial-records/{{recordId}}", { role: "superadmin", tests: [status(200)] }),
    req("Récupérables — liste", "GET", "/recuperables", { role: RLA, tests: [status(200), isJson] }),
    req("Récupérables — ligne invalide", "POST", "/recuperables", { role: RLA, body: { module: "PROBAR", machine: "1", ligne: "L9", poste: "matin", date: "2026-10-03" }, tests: [status(400)] }),
  ]),

  folder("Maintenance", [
    req("Créer — champs manquants", "POST", "/maintenance-requests", { role: "commercial", body: { equipement: "", typePanne: "" }, tests: [status(400)] }),
    req("Créer une demande", "POST", "/maintenance-requests", { role: "commercial", body: { equipement: "Compresseur Newman", typePanne: "Fuite", urgence: "faible", description: "Demande de test" }, tests: [status(201), has("statut en_attente", "b.data.statut === 'en_attente'"), save("maintenanceId", "b.data.id")] }),
    req("Mes demandes", "GET", "/maintenance-requests/my", { role: "commercial", tests: [status(200), has("contient la demande créée", "(b.data || b).some(r => r.id === pm.collectionVariables.get('maintenanceId'))")] }),
    req("Toutes les demandes — commercial refusé", "GET", "/maintenance-requests", { role: "commercial", tests: [status(403)] }),
    req("Toutes les demandes — RLA", "GET", "/maintenance-requests", { role: RLA, tests: [status(200)] }),
    req("Accepter — demandeur refusé", "PUT", "/maintenance-requests/{{maintenanceId}}/accept", { role: "commercial", tests: [status(403)] }),
    req("Accepter — RLA", "PUT", "/maintenance-requests/{{maintenanceId}}/accept", { role: RLA, tests: [status(200), has("statut acceptee", "b.statut === 'acceptee'")] }),
    req("Démarrer sans technicien", "PUT", "/maintenance-requests/{{maintenanceId}}/start", { role: RLA, tests: [status(400)] }),
    req("Historique", "GET", "/maintenance-requests/{{maintenanceId}}/history", { role: RLA, tests: [status(200), has("au moins 2 événements", "b.data.length >= 2")] }),
    req("Nettoyage — supprimer la demande", "DELETE", "/maintenance-requests/{{maintenanceId}}", { role: "superadmin", tests: [status(200)] }),
  ]),

  folder("RH", [
    req("Créer — type inconnu", "POST", "/hr-requests", { role: "commercial", body: { type: "vacances" }, tests: [status(400)] }),
    req("Créer — dates incohérentes", "POST", "/hr-requests", { role: "commercial", body: { type: "conge", typeConge: "ordinaire", dateDebut: "2027-03-10", dateFin: "2027-03-01", adresse: "Tunis", telephone: "20000001" }, tests: [status(400)] }),
    req("Créer — profil employé incomplet", "POST", "/hr-requests", { role: "accueil", body: { type: "sortie", dateSortie: "2027-02-01", heureSortie: "10:00", heureRetour: "11:00", motif: "Rendez-vous" }, tests: [status(422)] }),
    req("Créer une autorisation de sortie", "POST", "/hr-requests", { role: "commercial", body: { type: "sortie", dateSortie: "2027-02-01", heureSortie: "10:00", heureRetour: "11:00", motif: "Rendez-vous" }, tests: [status(201), has("statut en_attente", "b.data.statut === 'en_attente'"), save("hrId", "b.data.id")] }),
    req("Mes demandes RH", "GET", "/hr-requests", { role: "commercial", tests: [status(200), isJson] }),
    req("Accepter — demandeur refusé", "PUT", "/hr-requests/{{hrId}}/accept", { role: "commercial", tests: [status(403)] }),
    req("Lire — autre collaborateur refusé", "GET", "/hr-requests/{{hrId}}", { role: "accueil", tests: [status(403, 404)] }),
    req("Lire une demande inexistante", "GET", `/hr-requests/${NIL}`, { role: "commercial", tests: [status(404)] }),
    req("Nettoyage — supprimer la demande RH", "DELETE", "/hr-requests/{{hrId}}", { role: "commercial", tests: [status(200)] }),
  ]),

  folder("Archive", [
    req("Créer — champs manquants", "POST", "/archive-requests", { role: "commercial", body: {}, tests: [status(400)] }),
    req("Créer — projet d'un autre utilisateur", "POST", "/archive-requests", { role: "commercial", body: { projectId: "{{projectId}}", subject: "Archivage", message: "Test", type: "ARCHIVAGE" }, tests: [status(403)] }),
    req("Créer — projet inexistant", "POST", "/archive-requests", { role: "commercial", body: { projectId: NIL, subject: "Archivage", message: "Test", type: "ARCHIVAGE" }, tests: [status(404)] }),
    req("Mes demandes d'archivage", "GET", "/archive-requests/my", { role: "commercial", tests: [status(200), isJson] }),
    req("Toutes les demandes — commercial refusé", "GET", "/archive-requests", { role: "commercial", tests: [status(403)] }),
    req("Approuver — commercial refusé", "PUT", `/archive-requests/${NIL}/approve`, { role: "commercial", tests: [status(403)] }),
    req("Sans jeton", "GET", "/archive-requests/my", { tests: [status(401)] }),
  ]),

  folder("Notifications", [
    req("Mes notifications", "GET", "/notifications", { role: "commercial", tests: [status(200), has("items est un tableau", "Array.isArray(b.items)"), has("compteur non lu numérique", "typeof b.unreadCount === 'number'")] }),
    req("Sans jeton", "GET", "/notifications", { tests: [status(401)] }),
    req("Tout marquer comme lu", "PUT", "/notifications/read-all", { role: "commercial", tests: [status(200)] }),
    req("Marquer une notification inexistante", "PUT", `/notifications/${NIL}/read`, { role: "commercial", tests: [status(404)] }),
  ]),

  folder("Dashboard", [
    req("Tableau de bord utilisateur", "GET", "/dashboard/user", { role: "commercial", tests: [status(200), isJson] }),
    req("KPI globaux — commercial refusé", "GET", "/dashboard/kpis", { role: "commercial", tests: [status(403)] }),
    req("KPI globaux — superadmin", "GET", "/dashboard/kpis", { role: "superadmin", tests: [status(200), isJson] }),
    req("Statistiques d'administration — admin", "GET", "/admin-dashboard/stats", { role: "admin", tests: [status(200), isJson] }),
    req("Statistiques d'administration — accueil refusé", "GET", "/admin-dashboard/stats", { role: "accueil", tests: [status(403)] }),
    req("Statistiques POR — RLA", "GET", "/por-promesh/stats", { role: RLA, tests: [status(200), isJson] }),
    req("Sans jeton", "GET", "/dashboard/user", { tests: [status(401)] }),
  ]),

  folder("Copilot", [
    req("Chat — sans jeton", "POST", "/ai-copilot/chat", { body: { message: "Bonjour" }, tests: [status(401)] }),
    req("Chat — rôle non autorisé (accueil)", "POST", "/ai-copilot/chat", { role: "accueil", body: { message: "Bonjour" }, tests: [status(403)] }),
    req("Chat — message vide", "POST", "/ai-copilot/chat", { role: "commercial", body: { message: "" }, tests: [status(400)] }),
    req("Conversations", "GET", "/ai-copilot/conversations", { role: "commercial", tests: [status(200), isJson] }),
    req("Conversation inexistante", "GET", `/ai-copilot/conversations/${NIL}`, { role: "commercial", tests: [status(404)] }),
    req("Documents RAG", "GET", "/ai-copilot/documents", { role: "commercial", tests: [status(200), isJson] }),
    req("Chat réel — « Quels sont mes projets ? »", "POST", "/ai-copilot/chat", { role: "commercial", body: { message: "Quels sont mes projets ?" }, tests: [status(200), has("réponse non vide", "typeof b.data.answer === 'string' && b.data.answer.length > 0"), has("un outil a réellement été appelé", "Array.isArray(b.data.toolCalls) && b.data.toolCalls.length >= 1"), has("outil list_projects", "b.data.explainability.toolsCalled.includes('list_projects')"), has("aucune action en attente pour une lecture", "b.data.pendingAction === null")] }),
  ]),
];

const out = {
  info: {
    name: "CRM PROBAR — API (audit non fonctionnel)",
    description: "Collection générée par nfr/postman/build-collection.js. À exécuter contre l'instance de TEST (port 4100).",
    schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
  },
  variable: [
    { key: "baseUrl", value: "http://127.0.0.1:4100" },
    { key: "qaPassword", value: "QaAudit#2026" },
  ],
  item: collection,
};
const env = {
  name: "CRM PROBAR — test local",
  values: [
    { key: "baseUrl", value: "http://127.0.0.1:4100", enabled: true },
    { key: "qaPassword", value: "QaAudit#2026", enabled: true },
  ],
};
fs.writeFileSync(path.join(__dirname, "CRM_PROBAR.postman_collection.json"), JSON.stringify(out, null, 2));
fs.writeFileSync(path.join(__dirname, "CRM_PROBAR.test.postman_environment.json"), JSON.stringify(env, null, 2));
const count = collection.reduce((n, f) => n + f.item.length, 0);
console.log(`Collection générée : ${collection.length} dossiers, ${count} requêtes`);
