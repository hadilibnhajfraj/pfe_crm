"use strict";

// Construit le PLAN du lot de démonstration : la liste ordonnée de toutes les
// lignes à créer. Fonction pure — elle ne lit ni n'écrit aucune base ; elle
// reçoit les référentiels (étapes, types d'action, machines) déjà chargés.
//
// Chaque entrée : { table, id, key, via, values, meta }
//   via  = "model"   : créée par le modèle Sequelize, en reproduisant les
//                      règles écrites dans les routes du CRM ;
//          "service" : créée par un service métier existant du CRM.
//   meta = informations pour l'exécution et les contrôles (acteur, étapes).
//
// TOUT ce qui est produit ici est FICTIF. Les noms portent le préfixe DEMO,
// les adresses e-mail sont en .invalid, les téléphones commencent par un
// indicatif qui n'existe pas.

const { createRng, stableUuid, pad, DAY, ymd, addDays } = require("./random");

// Rôles autorisés par les routes actuelles (aucun rôle nouveau).
const PROJECT_CREATOR_ROLES = ["commercial", "admin", "superadmin", "superadmin2"];
const PRODUCTION_ROLES = ["admin", "superadmin", "superadmin2", "responsable_logistique_achat"];

// Étape de pipeline (nom en base) → poids, valeur de `statut` (liste
// PROJECT_STATUSES du CRM), probabilité de réussite simulée.
const STAGES = [
  ["Prospect", 22, "Prospect", 10],
  ["Contacté", 12, "Contacté", 20],
  ["Site Visit", 10, "Visite", 30],
  ["Plan technique", 8, "Plan technique", 40],
  ["Echantillonnage", 6, "Echantillonnage", 50],
  ["Quote Sent", 10, "Devis envoyé", 60],
  ["Negotiation", 8, "Négociation", 75],
  ["Won", 12, "Gagné", 100],
  ["Lost", 8, "Perdu", 0],
  ["Loyalty", 4, "Fidélisation", 100],
];
const REVENDEUR_STATUTS = [["prospect", "Prospect"], ["offre", "Offre"], ["actif", "Actif"], ["rate", "Raté"]];
// Types d'action de projet réellement utilisés dans le CRM.
const ACTION_TYPES = [["Visite", 50], ["Relance", 22], ["Plan technique", 8], ["Devis envoyé", 8], ["Echantillonnage", 6], ["Negociation", 6]];
// Étape d'un contact → type de l'action créée automatiquement (mapStageToAction).
const CONTACT_STAGE_ACTION = { Prospect: "Visite", "Contacté": "Plan technique", Visite: "Visite", "Devis envoyé": "Devis envoyé", Negociation: "Negociation", "Gagné": "Commande gagnée", Perdu: "Commande perdue" };
const REGIONS = ["Tunis", "Ariana", "Ben Arous", "Nabeul", "Sousse", "Monastir", "Sfax", "Bizerte", "Kairouan", "Gabès"];
const TYPES_PROJET = ["Dallage", "Résidentiel", "Industriel"];
const DIAMETRES = ["6", "8", "10", "12", "14", "16"];

function buildPlan(config, refs) {
  const { batch, volumes: V, simulation: S, identity } = config;
  const rng = createRng(batch.seed);
  const PREFIX = identity.prefix;
  const mail = (local) => `${local}@${identity.emailDomain}`;
  // Comptes de connexion : domaine dédié, rôle écrit tel quel (demo.commercial_sedentaire01@…).
  const accountMail = (role, index) => `demo.${role}${pad(index, 2)}@${identity.accountEmailDomain || identity.emailDomain}`;
  // Indicatif « 00 » : aucun numéro tunisien ne commence ainsi.
  const phone = (n) => `+216 00 ${pad(Math.floor(n / 1000), 3)} ${pad(n % 1000, 3)}`;
  const from = new Date(`${config.period.from}T00:00:00Z`);
  const to = new Date(`${config.period.to}T00:00:00Z`);
  const spanDays = Math.round((to - from) / DAY);
  const id = (table, key) => stableUuid(batch.name, table, key);
  const entries = [];
  const add = (table, key, values, extra = {}) => {
    const entry = { table, key, id: extra.id !== undefined ? extra.id : id(table, key), via: extra.via || "model", values, meta: extra.meta || {} };
    entries.push(entry);
    return entry;
  };
  // Instant dans la période, heure de bureau, à partir d'un tirage dédié.
  const moment = (r, minDay = 0, maxDay = spanDays) => new Date(addDays(from, r.int(minDay, Math.max(minDay, maxDay))).getTime() + r.int(8, 17) * 3600000 + r.int(0, 59) * 60000);

  // ── Utilisateurs de démonstration ────────────────────────────────────────
  const users = [];
  const userSpecs = [
    ["commercial", V.commerciaux, "Commercial"],
    ["commercial_sedentaire", V.commerciauxSedentaires, "Commercial sédentaire"],
    ["responsable_logistique_achat", V.responsablesProduction, "Responsable production"],
    ["admin", V.administrateurs, "Administrateur"],
  ];
  for (const [role, count, label] of userSpecs) {
    for (let i = 1; i <= count; i++) {
      const key = `${role}-${pad(i, 2)}`;
      const email = accountMail(role, i);
      const name = `${PREFIX} ${label} ${pad(i, 2)}`;
      // passwordHash : calculé à l'exécution (jamais écrit dans un rapport).
      const u = add("users", key, { email, role, isActive: true, createdAt: from, updatedAt: from }, { meta: { needsPasswordHash: true, name } });
      users.push({ id: u.id, role, email, name });
      add("user_profiles", key, { userId: u.id, name, designation: `${label} (démonstration)`, createdAt: from, updatedAt: from });
    }
  }
  const byRole = (role) => users.filter((u) => u.role === role);
  const commerciaux = byRole("commercial");
  const sedentaires = byRole("commercial_sedentaire");
  const production = byRole("responsable_logistique_achat")[0];

  // ── Référentiels commerciaux de démonstration ────────────────────────────
  const companies = [];
  for (let i = 1; i <= V.societes; i++) {
    const name = `${PREFIX} Entreprise ${pad(i)}`;
    companies.push({ id: add("companies", pad(i), { name, createdAt: from, updatedAt: from }).id, name });
  }
  const engineers = [];
  for (let i = 1; i <= V.ingenieurs; i++) {
    const e = { name: `${PREFIX} Ingénieur ${pad(i)}`, phone: phone(100000 + i), email: mail(`demo.ingenieur${pad(i)}`) };
    engineers.push({ id: add("engineers", pad(i), { ...e, createdAt: from, updatedAt: from }).id, ...e });
  }
  const architects = [];
  for (let i = 1; i <= V.architectes; i++) {
    const a = { name: `${PREFIX} Architecte ${pad(i)}`, phone: phone(200000 + i), email: mail(`demo.architecte${pad(i)}`) };
    architects.push({ id: add("architects", pad(i), { ...a, createdAt: from, updatedAt: from }).id, ...a });
  }
  {
    const r = rng.fork("clients");
    for (let i = 1; i <= V.clients; i++) {
      // `clients` a une clé entière : plage 900 001+ réservée à la démonstration.
      add(
        "clients",
        pad(i),
        { code: `${PREFIX}-C${pad(i)}`, raisonSociale: `${PREFIX} Client ${pad(i)}`, adresse: `${PREFIX} — adresse fictive`, region: r.pick(REGIONS), creeLe: ymd(addDays(from, -r.int(30, 900))), matriculeFiscal: `${PREFIX}-MF-${pad(i, 5)}`, createdAt: from, updatedAt: from },
        { id: 900000 + i }
      );
    }
  }

  // ── Projets (règles de POST /projects) ───────────────────────────────────
  const projects = [];
  {
    const r = rng.fork("projects");
    const stageWeights = STAGES.map((s) => [s, s[1]]);
    for (let i = 1; i <= V.projets; i++) {
      const owner = commerciaux[(i - 1) % commerciaux.length];
      const modele = r.weighted([["project", 85], ["revendeur", 10], ["applicateur", 5]]);
      const isRevendeur = modele === "revendeur";
      const isApplicateur = modele === "applicateur";
      const stage = r.weighted(stageWeights);
      const createdAt = moment(r, 0, spanDays - 20);
      const company = r.pick(companies);
      const engineer = r.pick(engineers);
      const architect = r.bool(0.35) ? r.pick(architects) : null;
      const region = r.pick(REGIONS);
      const revendeur = r.pick(REVENDEUR_STATUTS);
      // Nom unique : la route refuse deux projets de même nom pour un même propriétaire.
      const nomProjet = `${PREFIX} Projet ${pad(i)} — ${isRevendeur ? "Revendeur" : isApplicateur ? "Applicateur" : r.pick(TYPES_PROJET)}`;
      const values = {
        nomProjet,
        projectModele: modele,
        ownerId: owner.id,
        pipelineStageId: refs.stageByName.get(stage[0]) || null,
        statut: isRevendeur ? revendeur[1] : stage[2],
        priority: "medium",
        dateProspection: ymd(createdAt),
        dateDemarrage: ymd(addDays(createdAt, r.int(10, 90))),
        dateLimiteIngenieur: addDays(createdAt, 7), // la route pose une échéance à 7 jours
        typeProjet: isRevendeur || isApplicateur ? null : r.pick(TYPES_PROJET),
        // Société, ingénieur, architecte : non renseignés pour un revendeur (règle de la route).
        companyId: isRevendeur ? null : company.id,
        entreprise: isRevendeur ? null : company.name,
        engineerId: isRevendeur || isApplicateur ? null : engineer.id,
        ingenieurResponsable: isRevendeur || isApplicateur ? null : engineer.name,
        telephoneIngenieur: isRevendeur || isApplicateur ? null : engineer.phone,
        emailIngenieur: isRevendeur || isApplicateur ? null : engineer.email,
        architectId: !isRevendeur && architect ? architect.id : null,
        architecte: !isRevendeur && architect ? architect.name : null,
        telephoneArchitecte: !isRevendeur && architect ? architect.phone : null,
        emailArchitecte: !isRevendeur && architect ? architect.email : null,
        adresse: `${PREFIX} — adresse fictive, ${region}`,
        // Coordonnées fictives, tirées dans l'emprise de la Tunisie.
        latitude: isRevendeur || isApplicateur ? null : r.float(33.5, 37.2, 6),
        longitude: isRevendeur || isApplicateur ? null : r.float(8.6, 11.0, 6),
        productFamily: isRevendeur || isApplicateur ? null : r.weighted([["PROBAR", 60], ["PROMESH", 40]]),
        // Montant : seulement revendeur / applicateur, comme la route. SIMULÉ.
        montantMarche: isRevendeur || isApplicateur ? r.int(S.montantMarche.min / 500, S.montantMarche.max / 500) * 500 : null,
        pourcentageReussite: isRevendeur ? null : stage[3],
        revendeurStatut: isRevendeur ? revendeur[0] : "prospect",
        revendeurNom: isRevendeur ? `${PREFIX}` : null,
        revendeurPrenom: isRevendeur ? `Revendeur ${pad(i)}` : null,
        revendeurEmail: isRevendeur ? mail(`demo.revendeur${pad(i)}`) : null,
        validationStatut: "Non validé",
        isArchived: false,
        localisationCommentaire: S.provenance,
        createdAt,
        updatedAt: createdAt,
      };
      const p = add("projects", pad(i), values, { meta: { ownerRole: owner.role, stage: stage[0] } });
      projects.push({ id: p.id, owner, createdAt, stage: stage[0], nomProjet });
      // La route rattache le créateur au projet avec la permission « owner ».
      add("user_projects", pad(i), { userId: owner.id, projectId: p.id, permission: "owner", createdAt, updatedAt: createdAt });
    }
  }

  // ── Actions de projet (règles de POST /projects/:id/actions) ─────────────
  {
    const r = rng.fork("project_actions");
    let n = 0;
    const action = (project, type, date, statut, withRelance) => {
      n += 1;
      const dateRelance = withRelance ? addDays(date, r.int(3, 21)) : null;
      add("project_actions", pad(n, 4), {
        projectId: project.id,
        typeAction_legacy: type,
        actionTypeId: refs.actionTypeByName.get(type) || null,
        commentaire: `${PREFIX} — action simulée n° ${n}`,
        dateAction: date,
        dateRelance,
        statut,
        priorite: r.weighted([["normale", 60], ["haute", 20], ["basse", 12], ["urgente", 8]]),
        createdBy: project.owner.id,
        createdAt: date,
        updatedAt: date,
      });
    };
    // Un projet gagné ou perdu porte l'action de clôture correspondante.
    for (const p of projects) {
      if (p.stage === "Won") action(p, "Commande gagnée", addDays(p.createdAt, r.int(20, 60)), "Terminé", false);
      if (p.stage === "Lost") action(p, "Commande perdue", addDays(p.createdAt, r.int(15, 50)), "Terminé", false);
    }
    while (n < V.actionsProjet) {
      const p = r.pick(projects);
      const date = new Date(Math.min(addDays(p.createdAt, r.int(0, 45)).getTime(), to.getTime()));
      action(p, r.weighted(ACTION_TYPES), date, r.weighted([["Terminé", 60], ["A faire", 25], ["En cours", 10], ["Annulé", 5]]), r.bool(0.35));
    }
  }

  // ── Contacts (règles de POST /commercial-contacts, lignes automatiques comprises)
  const contacts = [];
  {
    const r = rng.fork("contacts");
    for (let i = 1; i <= V.contacts; i++) {
      const creator = r.bool(0.7) ? r.pick(sedentaires) : r.pick(commerciaux);
      const assigned = r.bool(0.85) ? r.pick(commerciaux) : null;
      const assigner = assigned ? (creator.role === "commercial_sedentaire" ? creator : r.pick(sedentaires)) : null;
      const createdAt = moment(r, 0, spanDays - 10);
      const stage = r.weighted([["Prospect", 45], ["Contacté", 18], ["Visite", 12], ["Devis envoyé", 10], ["Negociation", 6], ["Gagné", 5], ["Perdu", 4]]);
      const statut = r.weighted([["ok", 50], ["rappeler_plus_tard", 20], ["user_injoignable", 18], ["client_refuse", 12]]);
      const company = r.bool(0.75) ? r.pick(companies) : null;
      const c = add("commercial_contacts", pad(i), {
        typeClient: r.weighted([["Batiment", 60], ["Tuteur", 30], ["Cloture", 10]]),
        nomSociete: company ? company.name : null,
        nom: `Contact ${pad(i)}`,
        prenom: PREFIX,
        localisation: r.pick(REGIONS),
        telephone: phone(300000 + i),
        email: r.bool(0.4) ? mail(`demo.contact${pad(i)}`) : null,
        message: S.provenance,
        statut,
        nbAppels: r.int(0, 6),
        sujetDiscussion: `${PREFIX} — échange simulé`,
        pipelineStage: stage,
        dateAppel: createdAt,
        createdBy: creator.id,
        commercialId: assigned ? assigned.id : null,
        assignedBy: assigner ? assigner.id : null,
        assignedAt: assigned ? createdAt : null,
        createdAt,
        updatedAt: createdAt,
      }, { meta: { assignedRole: assigned ? assigned.role : null } });
      contacts.push({ id: c.id, createdAt, creator, assigned });
      // Lignes créées automatiquement par la route, dans le même ordre :
      // 1. historique du statut initial (type CREATED) ;
      add("commercial_contact_status_histories", pad(i), { commercialContactId: c.id, field: "statut", type: "CREATED", ancienStatut: null, nouveauStatut: statut, commentaire: "Création du contact", changedBy: creator.id, changedByName: creator.name, createdAt });
      // 2. ligne produit (PROBAR, quantité 1 par défaut) ;
      add("commercial_contact_products", pad(i), { commercialContactId: c.id, produit: r.weighted([["PROBAR", 70], ["PROMESH", 30]]), qte: 1, createdAt, updatedAt: createdAt });
      // 3. projet commercial, seulement s'il a un nom (la route ignore les noms vides) ;
      if (r.bool(0.6)) add("commercial_projects", pad(i), { commercialContactId: c.id, nomProjet: `${PREFIX} Besoin ${pad(i)}`, localisation: r.pick(REGIONS), typeProjet: r.pick(TYPES_PROJET), description: S.provenance, createdAt, updatedAt: createdAt });
      // 4. action initiale, type déduit de l'étape, statut « Terminé ».
      add("commercial_contact_actions", pad(i), { commercialContactId: c.id, typeAction: CONTACT_STAGE_ACTION[stage] || "Visite", commentaire: "Création du contact", dateAction: createdAt, statut: "Terminé", createdBy: creator.id, createdAt, updatedAt: createdAt });
    }
  }

  // ── Relances de contact (règles de POST /commercial-contacts/:id/relances)
  {
    const r = rng.fork("relances");
    const assignedContacts = contacts.filter((c) => c.assigned);
    // Une relance exige un commercial : sans contact affecté, aucune relance.
    for (let i = 1; assignedContacts.length && i <= V.relances; i++) {
      const c = r.pick(assignedContacts);
      const date = new Date(Math.min(addDays(c.createdAt, r.int(2, 40)).getTime(), to.getTime()));
      add("commercial_contact_relances", pad(i), {
        commercialContactId: c.id,
        dateRelance: ymd(date),
        heureRelance: `${pad(r.int(8, 17), 2)}:${r.pick(["00", "15", "30", "45"])}`,
        commentaire: `${PREFIX} — relance simulée n° ${i}`,
        statutRelance: r.weighted([["faite", 65], ["planifiee", 25], ["annulee", 10]]),
        emailSent: false,
        createdBy: c.creator.id,
        commercialId: c.assigned.id,
        commercialName: c.assigned.name,
        commercialEmail: c.assigned.email,
        createdAt: c.createdAt,
        updatedAt: c.createdAt,
      });
    }
  }

  // ── Production : créée par les SERVICES existants ─────────────────────────
  // Horaires de poste SIMULÉS (config.simulation.postes) : le CRM n'en définit aucun.
  const machines = (type) => refs.machines.filter((m) => m.typeMachine === type && m.statut === "ACTIVE");
  const operators = [1, 2, 3, 4].map((n) => `${PREFIX} Opérateur ${n}`);
  const actor = { id: production.id, role: production.role, email: production.email };
  {
    const r = rng.fork("promesh");
    for (let i = 1; i <= V.fichesPromesh; i++) {
      const machine = r.pick(machines("PROMESH"));
      const poste = r.weighted([["matin", 70], ["nuit", 30]]);
      const shift = S.postes[poste];
      const day = addDays(from, r.int(0, spanDays));
      const conformite = r.bool(S.tauxNonConformite) ? "non_conforme" : "conforme";
      const body = {
        dateProduction: ymd(day),
        heureDebut: shift.debut,
        heureFin: shift.fin,
        machine: String(machine.numero),
        poste,
        operateur: r.pick(operators),
        productionM2: r.int(S.productionM2.min / 10, S.productionM2.max / 10) * 10,
        conformite,
        descriptionNonConformite: conformite === "non_conforme" ? `${PREFIX} — non-conformité simulée` : null,
        observationsGenerales: S.provenance,
        controlesQualite: [1, 2].map((k) => ({ heure: k === 1 ? "09:00" : "12:00", numeroPlaque: `${PREFIX}-${pad(i)}-${k}`, statutCOQ: conformite === "non_conforme" && k === 2 ? "NC" : "C" })),
      };
      add("por_promesh", pad(i), body, { via: "service", meta: { service: "porPromesh.createPorPromesh", validate: r.bool(S.tauxValidationFiches), actor, machineId: machine.id, machineCode: machine.code, dataStatus: "TEST" } });
    }
  }
  {
    const r = rng.fork("probar");
    for (let i = 1; i <= V.fichesProbar; i++) {
      const machine = r.pick(machines("PROBAR"));
      const poste = r.weighted([["matin", 70], ["nuit", 30]]);
      const shift = S.postes[poste];
      const operateur = r.pick(operators);
      const body = {
        module: "probar",
        machine: String(machine.numero),
        poste,
        dateFiche: ymd(addDays(from, r.int(0, spanDays))),
        operateur,
        quantiteProduite: r.int(S.quantiteProbar.min / 10, S.quantiteProbar.max / 10) * 10,
        statutQualite: r.bool(S.tauxNonConformite) ? "nok" : "ok",
        // Heures et contenu dans le blob JSON, comme le formulaire de l'application.
        description: JSON.stringify({ hd: shift.debut, hf: shift.fin, p: { r1: operateur }, simulation: true }),
        observations: S.provenance,
      };
      add("industrial_records", pad(i), body, { via: "service", meta: { service: "industrialRecord.createRecord", validate: r.bool(S.tauxValidationFiches), actor, machineId: machine.id, machineCode: machine.code, dataStatus: "TEST" } });
    }
  }
  {
    // Fiches de déchets : une seule par module, machine, ligne, poste et date
    // (contrainte existante) — les combinaisons tirées sont donc distinctes.
    const r = rng.fork("dechets");
    const seen = new Set();
    let i = 0;
    while (i < V.fichesDechets) {
      const machine = r.pick(machines("PROBAR"));
      const body = { module: "PROBAR", machine: String(machine.numero), ligne: r.pick(["L1", "L2", "L3", "L4"]), poste: r.pick(["matin", "soir"]), date: ymd(addDays(from, r.int(0, spanDays))) };
      const combo = Object.values(body).join("|");
      if (seen.has(combo)) continue;
      seen.add(combo);
      i += 1;
      const picked = DIAMETRES.filter(() => r.bool(0.5)).slice(0, 4);
      body.recuperables = (picked.length ? picked : [DIAMETRES[0]]).map((diametre) => {
        const dechetKg = r.float(S.dechetKg.min, S.dechetKg.max, 1);
        return { diametre, dechetKg, dechetProduitFiniKg: Number((dechetKg * r.float(0.1, 0.5, 2)).toFixed(1)) };
      });
      // L'identifiant est attribué par le service : il sera inscrit au registre à l'exécution.
      add("recuperable_fiches", pad(i), body, { via: "service", id: null, meta: { service: "recuperable.saveFiche", actor, machineId: machine.id, machineCode: machine.code, dataStatus: "TEST", naturalKey: combo } });
    }
  }

  return { batch: { name: batch.name, seed: batch.seed }, generatedFor: config.target.database, entries };
}

module.exports = { buildPlan, PROJECT_CREATOR_ROLES, PRODUCTION_ROLES, STAGES, CONTACT_STAGE_ACTION };
