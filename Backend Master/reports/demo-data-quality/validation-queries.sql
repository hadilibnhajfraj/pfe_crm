-- ##V00 GARDE-FOU : la base connectée doit être cbigestionnairepfe_demo
-- =============================================================================
-- Requêtes de contrôle — base de DÉMONSTRATION uniquement (cbigestionnairepfe_demo)
-- Audit du 12/10/2026. LECTURE SEULE : aucun INSERT / UPDATE / DELETE / DDL.
--
-- Exécution conseillée (la session entière est forcée en lecture seule) :
--   PGOPTIONS="-c default_transaction_read_only=on" \
--   psql -v ON_ERROR_STOP=1 -h 127.0.0.1 -p 5432 -U postgres \
--        -d cbigestionnairepfe_demo -f reports/demo-data-quality/validation-queries.sql
--
-- Ne JAMAIS lancer ce fichier sur cbigestionnairepfe (base réelle).
-- La requête V00 échoue (division par zéro) si la base n'est pas la bonne.
--
-- Trois familles :
--   A-xx  contrôles d'intégrité            → « attendu » = valeur saine
--   K-xx  valeurs de référence des KPI     → à comparer au Copilot / à Power BI
--   C-xx  écarts connus entre définitions  → même question, deux réponses légitimes
-- Les valeurs « constaté le 12/10/2026 » sont celles relevées pendant l'audit.
-- =============================================================================
SELECT current_database() AS base,
       current_setting('transaction_read_only') AS lecture_seule,
       CASE WHEN current_database() = 'cbigestionnairepfe_demo' THEN 'OK'
            ELSE (1 / (CASE WHEN current_database() = 'cbigestionnairepfe_demo' THEN 1 ELSE 0 END))::text END AS garde_fou;

-- ##A01 Volumes par table (attendu : users 11 dont 10 du lot, companies 40, engineers 25, architects 10, clients 60, projects 80, project_actions 300, commercial_contacts 150, relances 100, por_promesh 90, industrial_records 70, recuperable_fiches 20, notifications 300)
SELECT 'users' AS table_name, count(*) AS lignes FROM users
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles
UNION ALL SELECT 'companies', count(*) FROM companies
UNION ALL SELECT 'engineers', count(*) FROM engineers
UNION ALL SELECT 'architects', count(*) FROM architects
UNION ALL SELECT 'clients', count(*) FROM clients
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'user_projects', count(*) FROM user_projects
UNION ALL SELECT 'project_actions', count(*) FROM project_actions
UNION ALL SELECT 'commercial_contacts', count(*) FROM commercial_contacts
UNION ALL SELECT 'commercial_contact_relances', count(*) FROM commercial_contact_relances
UNION ALL SELECT 'commercial_contact_actions', count(*) FROM commercial_contact_actions
UNION ALL SELECT 'commercial_projects', count(*) FROM commercial_projects
UNION ALL SELECT 'por_promesh', count(*) FROM por_promesh
UNION ALL SELECT 'industrial_records', count(*) FROM industrial_records
UNION ALL SELECT 'recuperable_fiches', count(*) FROM recuperable_fiches
UNION ALL SELECT 'recuperable_lignes', count(*) FROM recuperable_lignes
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'project_activities (vide)', count(*) FROM project_activities
UNION ALL SELECT 'project_devis (vide)', count(*) FROM project_devis
UNION ALL SELECT 'project_bon_de_commande (vide)', count(*) FROM project_bon_de_commande
UNION ALL SELECT 'commercial_contact_reminders (vide)', count(*) FROM commercial_contact_reminders
UNION ALL SELECT 'products (vide)', count(*) FROM products;

-- ##A02 Références orphelines (attendu : 0 partout ; les colonnes projects.companyId/engineerId/architectId et project_actions.createdBy n'ont PAS de clé étrangère en base)
SELECT 'projects.ownerId' AS relation, count(*) AS orphelins FROM projects p WHERE p."ownerId" IS NULL OR NOT EXISTS (SELECT 1 FROM users u WHERE u.id = p."ownerId")
UNION ALL SELECT 'projects.pipelineStageId', count(*) FROM projects p WHERE p."pipelineStageId" IS NULL OR NOT EXISTS (SELECT 1 FROM pipeline_stages s WHERE s.id = p."pipelineStageId")
UNION ALL SELECT 'projects.companyId', count(*) FROM projects p WHERE p."companyId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies c WHERE c.id = p."companyId")
UNION ALL SELECT 'projects.engineerId', count(*) FROM projects p WHERE p."engineerId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM engineers c WHERE c.id = p."engineerId")
UNION ALL SELECT 'projects.architectId', count(*) FROM projects p WHERE p."architectId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM architects c WHERE c.id = p."architectId")
UNION ALL SELECT 'user_projects (propriétaire ≠ ownerId)', count(*) FROM user_projects up WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = up."projectId" AND p."ownerId" = up."userId")
UNION ALL SELECT 'project_actions.projectId', count(*) FROM project_actions a WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p.id = a."projectId")
UNION ALL SELECT 'project_actions.actionTypeId', count(*) FROM project_actions a WHERE a."actionTypeId" IS NULL OR NOT EXISTS (SELECT 1 FROM project_action_types t WHERE t.id = a."actionTypeId")
UNION ALL SELECT 'project_actions.createdBy', count(*) FROM project_actions a WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = a."createdBy")
UNION ALL SELECT 'commercial_contacts.createdBy', count(*) FROM commercial_contacts c WHERE NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c."createdBy")
UNION ALL SELECT 'commercial_contacts.commercialId (non commercial)', count(*) FROM commercial_contacts c WHERE c."commercialId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = c."commercialId" AND u.role = 'commercial')
UNION ALL SELECT 'commercial_contacts.nomSociete (hors companies)', count(*) FROM commercial_contacts c WHERE c."nomSociete" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM companies k WHERE k.name = c."nomSociete")
UNION ALL SELECT 'relances.commercialContactId', count(*) FROM commercial_contact_relances r WHERE NOT EXISTS (SELECT 1 FROM commercial_contacts c WHERE c.id = r."commercialContactId")
UNION ALL SELECT 'relances.commercialId ≠ contact.commercialId', count(*) FROM commercial_contact_relances r JOIN commercial_contacts c ON c.id = r."commercialContactId" WHERE r."commercialId" IS DISTINCT FROM c."commercialId"
UNION ALL SELECT 'por_promesh.machineId (type ≠ PROMESH)', count(*) FROM por_promesh f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId" AND m."typeMachine" = 'PROMESH')
UNION ALL SELECT 'industrial_records.machineId (type ≠ PROBAR)', count(*) FROM industrial_records f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId" AND m."typeMachine" = 'PROBAR')
UNION ALL SELECT 'recuperable_fiches.machineId', count(*) FROM recuperable_fiches f WHERE NOT EXISTS (SELECT 1 FROM machines m WHERE m.id = f."machineId")
UNION ALL SELECT 'notifications.commercialContactId', count(*) FROM notifications n WHERE n."commercialContactId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM commercial_contacts c WHERE c.id = n."commercialContactId");

-- ##A03 Doublons (attendu : 0 partout, sauf « actions : même projet + type + instant » = 7 groupes constatés le 12/10/2026)
SELECT 'users.email' AS cle, count(*) AS groupes_en_double FROM (SELECT 1 FROM users GROUP BY lower(email) HAVING count(*) > 1) d
UNION ALL SELECT 'companies.name', count(*) FROM (SELECT 1 FROM companies GROUP BY lower(trim(name)) HAVING count(*) > 1) d
UNION ALL SELECT 'engineers.name', count(*) FROM (SELECT 1 FROM engineers GROUP BY lower(trim(name)) HAVING count(*) > 1) d
UNION ALL SELECT 'architects.name', count(*) FROM (SELECT 1 FROM architects GROUP BY lower(trim(name)) HAVING count(*) > 1) d
UNION ALL SELECT 'clients.raisonSociale', count(*) FROM (SELECT 1 FROM clients GROUP BY lower(trim("raisonSociale")) HAVING count(*) > 1) d
UNION ALL SELECT 'clients.code', count(*) FROM (SELECT 1 FROM clients GROUP BY code HAVING count(*) > 1) d
UNION ALL SELECT 'projects (ownerId + nomProjet)', count(*) FROM (SELECT 1 FROM projects GROUP BY "ownerId", lower(trim("nomProjet")) HAVING count(*) > 1) d
UNION ALL SELECT 'commercial_contacts.telephone', count(*) FROM (SELECT 1 FROM commercial_contacts GROUP BY telephone HAVING count(*) > 1) d
UNION ALL SELECT 'relances (contact + date + heure)', count(*) FROM (SELECT 1 FROM commercial_contact_relances GROUP BY "commercialContactId", "dateRelance", "heureRelance" HAVING count(*) > 1) d
UNION ALL SELECT 'recuperable_fiches (module+machine+ligne+poste+date)', count(*) FROM (SELECT 1 FROM recuperable_fiches GROUP BY module, machine, ligne, poste, date HAVING count(*) > 1) d
UNION ALL SELECT 'por_promesh.sequenceNumber', count(*) FROM (SELECT 1 FROM por_promesh GROUP BY "sequenceNumber" HAVING count(*) > 1) d
UNION ALL SELECT 'actions : même projet + type + instant', count(*) FROM (SELECT 1 FROM project_actions GROUP BY "projectId", "typeAction_legacy", "dateAction" HAVING count(*) > 1) d;

-- ##A04 Détail des actions en double (même projet, même type, même instant) — 7 groupes, 16 lignes constatés
SELECT p."nomProjet", a."typeAction_legacy", a."dateAction", count(*) AS lignes, string_agg(a.statut::text, ', ' ORDER BY a.commentaire) AS statuts
FROM project_actions a JOIN projects p ON p.id = a."projectId"
GROUP BY p."nomProjet", a."typeAction_legacy", a."dateAction" HAVING count(*) > 1 ORDER BY 1;

-- ##A05 Cohérence des dates — projets (attendu : 0 sauf demarrage_apres_date_reference = 14 et demarrage_futur = 10 constatés le 12/10/2026)
SELECT count(*) FILTER (WHERE "dateDemarrage" < "dateProspection") AS demarrage_avant_prospection,
       count(*) FILTER (WHERE "updatedAt" < "createdAt") AS modifie_avant_creation,
       count(*) FILTER (WHERE "createdAt" > now()) AS cree_dans_le_futur,
       count(*) FILTER (WHERE "createdAt" < TIMESTAMPTZ '2026-04-01' OR "createdAt" >= TIMESTAMPTZ '2026-10-01') AS cree_hors_periode_lot,
       count(*) FILTER (WHERE "dateDemarrage" > DATE '2026-09-30') AS demarrage_apres_date_reference,
       count(*) FILTER (WHERE "dateDemarrage" > CURRENT_DATE) AS demarrage_futur,
       min("createdAt") AS creation_min, max("createdAt") AS creation_max, min("dateDemarrage") AS demarrage_min, max("dateDemarrage") AS demarrage_max
FROM projects;

-- ##A06 Cohérence des dates — actions de projet (attendu : 0 sauf action_apres_30_09 = 2, relance_apres_30_09 = 6, ouvertes_echues = 90, ecretees_au_30_09_minuit = 16)
SELECT count(*) FILTER (WHERE a."dateAction" < p."createdAt") AS action_avant_creation_projet,
       count(*) FILTER (WHERE a."dateRelance" < a."dateAction") AS relance_avant_action,
       count(*) FILTER (WHERE a."dateAction" > now()) AS action_dans_le_futur,
       count(*) FILTER (WHERE a."dateAction" >= TIMESTAMPTZ '2026-10-01') AS action_apres_30_09,
       count(*) FILTER (WHERE a."dateRelance" >= TIMESTAMPTZ '2026-10-01') AS relance_apres_30_09,
       count(*) FILTER (WHERE a."dateRelance" >= now()) AS relance_a_venir_reelle,
       count(*) FILTER (WHERE a.statut::text IN ('A faire', 'En cours') AND a."dateAction" < now()) AS ouvertes_echues,
       count(*) FILTER (WHERE a."dateAction" = TIMESTAMPTZ '2026-09-30 00:00:00+00') AS ecretees_au_30_09_minuit
FROM project_actions a JOIN projects p ON p.id = a."projectId";

-- ##A07 Actions postérieures à la clôture du projet (constaté : 7 actions sur 5 projets)
SELECT p."nomProjet", s.name AS etape, c."dateAction" AS cloture, a."typeAction_legacy", a.statut::text AS statut, a."dateAction"
FROM project_actions a
JOIN projects p ON p.id = a."projectId"
JOIN pipeline_stages s ON s.id = p."pipelineStageId"
JOIN project_actions c ON c."projectId" = p.id AND c."typeAction_legacy" IN ('Commande gagnée', 'Commande perdue')
WHERE a.id <> c.id AND a."dateAction" > c."dateAction" ORDER BY 1, 6;

-- ##A08 Actions encore ouvertes sur des projets gagnés ou perdus (constaté : Won 18, Lost 2)
SELECT s.name AS etape, count(*) AS actions_ouvertes
FROM project_actions a JOIN projects p ON p.id = a."projectId" JOIN pipeline_stages s ON s.id = p."pipelineStageId"
WHERE (s."isWonStage" OR s."isLostStage") AND a.statut::text IN ('A faire', 'En cours') GROUP BY s.name;

-- ##A09 Statut texte du projet contre étape du pipeline (constaté : 4 projets revendeur incohérents — étape Won avec statut Prospect, Lost avec Offre, Negotiation et Plan technique avec Raté)
SELECT s.name AS etape, p.statut, p."projectModele"::text AS modele, p."revendeurStatut"::text AS statut_revendeur, count(*) AS projets
FROM projects p JOIN pipeline_stages s ON s.id = p."pipelineStageId"
WHERE (s."isWonStage" AND p.statut IS DISTINCT FROM 'Gagné')
   OR (s."isLostStage" AND p.statut IS DISTINCT FROM 'Perdu')
   OR (p.statut = 'Raté' AND NOT s."isLostStage")
   OR (p.statut = 'Gagné' AND NOT s."isWonStage")
   OR (p.statut = 'Perdu' AND NOT s."isLostStage")
GROUP BY 1, 2, 3, 4 ORDER BY 1, 2;

-- ##A10 Valeurs de statut réellement présentes (à comparer aux listes du code : PROJECT_STATUSES, REVENDEUR_STATUSES, types ENUM)
SELECT 'projects.statut' AS champ, statut AS valeur, count(*) AS lignes FROM projects GROUP BY statut
UNION ALL SELECT 'projects.validationStatut', "validationStatut"::text, count(*) FROM projects GROUP BY 2
UNION ALL SELECT 'projects.pipelineStage_legacy', "pipelineStage_legacy"::text, count(*) FROM projects GROUP BY 2
UNION ALL SELECT 'project_actions.statut', statut::text, count(*) FROM project_actions GROUP BY 2
UNION ALL SELECT 'commercial_contacts.statut', statut::text, count(*) FROM commercial_contacts GROUP BY 2
UNION ALL SELECT 'commercial_contacts.pipelineStage', "pipelineStage"::text, count(*) FROM commercial_contacts GROUP BY 2
UNION ALL SELECT 'relances.statutRelance', "statutRelance"::text, count(*) FROM commercial_contact_relances GROUP BY 2
UNION ALL SELECT 'por_promesh.status', status::text, count(*) FROM por_promesh GROUP BY 2
UNION ALL SELECT 'industrial_records.statut', statut, count(*) FROM industrial_records GROUP BY 2
UNION ALL SELECT 'recuperable_fiches.statut', statut::text, count(*) FROM recuperable_fiches GROUP BY 2
ORDER BY 1, 3 DESC;

-- ##A11 Valeurs numériques impossibles (attendu : 0 partout)
SELECT 'projects.montantMarche <= 0' AS controle, count(*) AS lignes FROM projects WHERE "montantMarche" <= 0
UNION ALL SELECT 'projects.pourcentageReussite hors 0–100', count(*) FROM projects WHERE "pourcentageReussite" NOT BETWEEN 0 AND 100
UNION ALL SELECT 'projects : montant sur un modèle « project »', count(*) FROM projects WHERE "montantMarche" IS NOT NULL AND "projectModele" = 'project'
UNION ALL SELECT 'projects : famille ou diamètre sur revendeur/applicateur', count(*) FROM projects WHERE "projectModele" <> 'project' AND ("productFamily" IS NOT NULL OR "diameterMm" IS NOT NULL)
UNION ALL SELECT 'projects : diamètre sans famille', count(*) FROM projects WHERE "diameterMm" IS NOT NULL AND "productFamily" IS NULL
UNION ALL SELECT 'projects : coordonnées hors de la Tunisie', count(*) FROM projects WHERE latitude NOT BETWEEN 30 AND 38 OR longitude NOT BETWEEN 7 AND 12
UNION ALL SELECT 'commercial_contacts.nbAppels < 0', count(*) FROM commercial_contacts WHERE "nbAppels" < 0
UNION ALL SELECT 'commercial_contact_products.qte <= 0', count(*) FROM commercial_contact_products WHERE qte <= 0
UNION ALL SELECT 'por_promesh.productionM2 <= 0 ou vide', count(*) FROM por_promesh WHERE "productionM2" IS NULL OR "productionM2" <= 0
UNION ALL SELECT 'por_promesh : rejet > production', count(*) FROM por_promesh WHERE "quantiteRejetee" > "productionM2"
UNION ALL SELECT 'industrial_records.quantiteProduite <= 0 ou vide', count(*) FROM industrial_records WHERE "quantiteProduite" IS NULL OR "quantiteProduite" <= 0
UNION ALL SELECT 'recuperable_lignes : kg négatif', count(*) FROM recuperable_lignes WHERE "dechetKg" < 0 OR "dechetProduitFiniKg" < 0
UNION ALL SELECT 'recuperable_lignes : déchet produit fini > déchet total', count(*) FROM recuperable_lignes WHERE "dechetProduitFiniKg" > "dechetKg";

-- ##A12 Contacts : étape contre statut d'appel (aucune règle dans le code — combinaisons AMBIGUËS, pas des erreurs prouvées)
SELECT count(*) FILTER (WHERE "pipelineStage"::text = 'Gagné' AND statut::text = 'client_refuse') AS gagne_et_client_refuse,
       count(*) FILTER (WHERE "pipelineStage"::text = 'Gagné' AND statut::text = 'user_injoignable') AS gagne_et_injoignable,
       count(*) FILTER (WHERE "pipelineStage"::text IN ('Devis envoyé', 'Negociation') AND statut::text = 'client_refuse') AS devis_ou_nego_et_refuse,
       count(*) FILTER (WHERE "pipelineStage"::text <> 'Prospect' AND "nbAppels" = 0) AS etape_avancee_sans_appel,
       count(*) FILTER (WHERE "pipelineStage"::text IN ('Visite', 'Devis envoyé', 'Negociation', 'Gagné') AND "commercialId" IS NULL) AS etape_avancee_non_affecte
FROM commercial_contacts;

-- ##A13 Relances de contact (attendu : 0 sauf email_perime = 100, planifiees_echues = 27, creation_egale_contact = 100, planifiee_sur_contact_clos = 6, planifiee_sur_refus = 3)
SELECT count(*) FILTER (WHERE r."dateRelance" < (c."createdAt" AT TIME ZONE 'Africa/Tunis')::date) AS relance_avant_contact,
       count(*) FILTER (WHERE r."commercialEmail" IS DISTINCT FROM u.email) AS email_perime,
       count(*) FILTER (WHERE r."commercialName" IS DISTINCT FROM up.name) AS nom_perime,
       count(*) FILTER (WHERE r."statutRelance"::text = 'planifiee' AND r."dateRelance" < CURRENT_DATE) AS planifiees_echues,
       count(*) FILTER (WHERE r."statutRelance"::text = 'planifiee' AND r."dateRelance" >= CURRENT_DATE) AS planifiees_a_venir,
       count(*) FILTER (WHERE r."createdAt" = c."createdAt") AS creation_egale_contact,
       count(*) FILTER (WHERE r."statutRelance"::text = 'planifiee' AND c."pipelineStage"::text IN ('Gagné', 'Perdu')) AS planifiee_sur_contact_clos,
       count(*) FILTER (WHERE r."statutRelance"::text = 'planifiee' AND c.statut::text = 'client_refuse') AS planifiee_sur_refus,
       count(*) FILTER (WHERE r."heureRelance" !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$') AS heure_invalide
FROM commercial_contact_relances r
JOIN commercial_contacts c ON c.id = r."commercialContactId"
LEFT JOIN users u ON u.id = r."commercialId"
LEFT JOIN user_profiles up ON up."userId" = r."commercialId";

-- ##A14 Champs de relance du projet contre les actions (constaté : 80 projets sans lastRelanceAt alors que tous ont au moins une action ; 56 sans nextRelanceDate avec une date de relance d'action)
SELECT count(*) AS projets,
       count(*) FILTER (WHERE p."lastRelanceAt" IS NULL AND EXISTS (SELECT 1 FROM project_actions a WHERE a."projectId" = p.id)) AS sans_lastRelanceAt_avec_action,
       count(*) FILTER (WHERE p."nextRelanceDate" IS NULL AND EXISTS (SELECT 1 FROM project_actions a WHERE a."projectId" = p.id AND a."dateRelance" IS NOT NULL)) AS sans_nextRelanceDate_avec_relance
FROM projects p;

-- ##A15 Champs que la tâche planifiée « projectCron » considère manquants (elle relance tout projet concerné chaque jour à 08:00 si AUTO_EMAIL_JOBS_ENABLED=true)
SELECT "projectModele"::text AS modele, count(*) AS projets,
       count(*) FILTER (WHERE coalesce("bureauControle", '') = '') AS sans_bureau_controle,
       count(*) FILTER (WHERE coalesce(entreprise, '') = '') AS sans_entreprise,
       count(*) FILTER (WHERE "projectModele" = 'project' AND coalesce("ingenieurResponsable", '') = '') AS sans_ingenieur,
       count(*) FILTER (WHERE "projectModele" = 'revendeur' AND (coalesce(comptoir, '') = '' OR coalesce("telephoneComptoir", '') = '')) AS revendeur_sans_comptoir,
       count(*) FILTER (WHERE "projectModele" = 'applicateur' AND (coalesce(dallagiste, '') = '' OR coalesce("telephoneDallagiste", '') = '')) AS applicateur_sans_dallagiste
FROM projects WHERE coalesce("isArchived", false) = false GROUP BY 1 ORDER BY 1;

-- ##A16 Comptes : format du mot de passe (préfixe seulement, jamais la valeur) et comptes hors lot
SELECT u.email, u.role::text AS role, u."isActive",
       CASE WHEN u."passwordHash" ~ '^[$]2[aby][$]' THEN 'bcrypt' ELSE 'NON bcrypt (connexion impossible)' END AS format_mot_de_passe,
       EXISTS (SELECT 1 FROM data_change_log l WHERE l.table_name = 'users' AND l.operation = 'INSERT' AND l.record_id = u.id::text) AS inscrit_au_registre_du_lot
FROM users u ORDER BY 5, 2, 1;

-- ##A17 Lignes créées après l'injection, hors registre du lot (constaté : 1 utilisateur, 1 profil, 300 notifications)
SELECT 'users' AS table_name, count(*) AS hors_registre FROM users x WHERE NOT EXISTS (SELECT 1 FROM data_change_log l WHERE l.table_name = 'users' AND l.operation = 'INSERT' AND l.record_id = x.id::text)
UNION ALL SELECT 'user_profiles', count(*) FROM user_profiles x WHERE NOT EXISTS (SELECT 1 FROM data_change_log l WHERE l.table_name = 'user_profiles' AND l.operation = 'INSERT' AND l.record_id = x.id::text)
UNION ALL SELECT 'notifications', count(*) FROM notifications
UNION ALL SELECT 'projects', count(*) FROM projects x WHERE NOT EXISTS (SELECT 1 FROM data_change_log l WHERE l.table_name = 'projects' AND l.operation = 'INSERT' AND l.record_id = x.id::text)
UNION ALL SELECT 'commercial_contacts', count(*) FROM commercial_contacts x WHERE NOT EXISTS (SELECT 1 FROM data_change_log l WHERE l.table_name = 'commercial_contacts' AND l.operation = 'INSERT' AND l.record_id = x.id::text);

-- ##A18 Adresses e-mail dénormalisées restées sur l'ancien domaine après le renommage des comptes (constaté : 100 relances, 20 fiches de déchets)
SELECT 'commercial_contact_relances.commercialEmail' AS champ, split_part("commercialEmail", '@', 2) AS domaine, count(*) AS lignes FROM commercial_contact_relances GROUP BY 2
UNION ALL SELECT 'recuperable_fiches.operateur', split_part(operateur, '@', 2), count(*) FROM recuperable_fiches GROUP BY 2
UNION ALL SELECT 'users.email', split_part(email, '@', 2), count(*) FROM users GROUP BY 2;

-- ##A19 Production : statut, verrou, validation (attendu : 0 sauf validation_date_injection = 61 et non_conforme_sans_action_corrective = 7)
SELECT count(*) FILTER (WHERE (status::text = 'VALIDE') <> "isLocked") AS verrou_incoherent,
       count(*) FILTER (WHERE status::text = 'VALIDE' AND "validatedAt" IS NULL) AS valide_sans_date,
       count(*) FILTER (WHERE status::text <> 'VALIDE' AND "validatedAt" IS NOT NULL) AS brouillon_avec_date,
       count(*) FILTER (WHERE "heureFin" = "heureDebut") AS heures_identiques,
       count(*) FILTER (WHERE poste::text <> 'nuit' AND "heureFin" < "heureDebut") AS fin_avant_debut_hors_nuit,
       count(*) FILTER (WHERE "dateProduction" > CURRENT_DATE) AS production_dans_le_futur,
       count(*) FILTER (WHERE conformite::text = 'non_conforme' AND coalesce("descriptionNonConformite", '') = '') AS non_conforme_sans_description,
       count(*) FILTER (WHERE conformite::text = 'non_conforme' AND coalesce("actionsCorrectives", '') = '') AS non_conforme_sans_action_corrective,
       count(*) FILTER (WHERE "validatedAt"::date = DATE '2026-10-10') AS validation_date_injection,
       count(*) FILTER (WHERE "dataStatus"::text <> 'TEST') AS hors_TEST
FROM por_promesh;

-- ##A20 Production : colonnes ajoutées par la migration 20261009093000 jamais renseignées (constaté : toutes vides)
SELECT 'por_promesh' AS table_name, count(*) AS fiches, count("productId") AS avec_produit, count("operatorUserId") AS avec_operateur_utilisateur, count("quantitePrevue") AS avec_quantite_prevue, count("quantiteRejetee") AS avec_quantite_rejetee, count("heureDebut") AS avec_heure_debut, NULL::bigint AS avec_numero_fiche FROM por_promesh
UNION ALL SELECT 'industrial_records', count(*), count("productId"), count("operatorUserId"), count("quantitePrevue"), count("quantiteRejetee"), count("heureDebut"), count("numeroFiche") FROM industrial_records;

-- ##A21 Fiches de déchets (attendu : 0 sauf cloture_plus_de_30_jours_apres = 19 ; toutes en_cours, clôture au 16/10/2026)
SELECT count(*) AS fiches, count(*) FILTER (WHERE statut::text = 'en_cours') AS en_cours, min("dateCloture") AS cloture_min, max("dateCloture") AS cloture_max,
       count(*) FILTER (WHERE "dateCloture" < date) AS cloture_avant_date,
       count(*) FILTER (WHERE "dateCloture" - date > 30) AS cloture_plus_de_30_jours_apres,
       count(*) FILTER (WHERE "dateCloture" < CURRENT_DATE AND statut::text = 'en_cours') AS en_cours_alors_que_echue
FROM recuperable_fiches;

-- ##A22 Fiches multiples pour une même machine, un même jour et un même poste (pas de règle d'unicité dans le code : information, constaté PROMESH 6 couples, PROBAR 2)
SELECT 'PROMESH' AS famille, count(*) AS couples, coalesce(sum(n), 0) AS fiches FROM (SELECT count(*) n FROM por_promesh GROUP BY "machineId", "dateProduction", poste HAVING count(*) > 1) d
UNION ALL SELECT 'PROBAR', count(*), coalesce(sum(n), 0) FROM (SELECT count(*) n FROM industrial_records GROUP BY "machineId", "dateFiche", poste HAVING count(*) > 1) d;

-- ##A23 Type d'action contre étape actuelle du projet (aucune règle dans le code — AMBIGU ; constaté : 11 « Devis envoyé », 8 « Echantillonnage », 4 « Negociation » sur des projets à l'étape Prospect)
SELECT s.position, s.name AS etape, a."typeAction_legacy" AS type_action, count(*) AS actions
FROM project_actions a JOIN projects p ON p.id = a."projectId" JOIN pipeline_stages s ON s.id = p."pipelineStageId"
WHERE a."typeAction_legacy" IN ('Devis envoyé', 'Negociation', 'Echantillonnage', 'Plan technique') GROUP BY 1, 2, 3 ORDER BY 1, 3;

-- ##A24 Fiches validées malgré une qualité non conforme (aucune règle dans le code — AMBIGU ; constaté : PROBAR 3, PROMESH 5) et types d'action jamais utilisés (constaté : 12 sur 20)
SELECT 'PROBAR validée avec statutQualite = nok' AS controle, count(*) AS lignes FROM industrial_records WHERE statut = 'validee' AND "statutQualite"::text = 'nok'
UNION ALL SELECT 'PROMESH validée et non conforme', count(*) FROM por_promesh WHERE status::text = 'VALIDE' AND conformite::text = 'non_conforme'
UNION ALL SELECT 'types d''action jamais utilisés', count(*) FROM project_action_types t WHERE NOT EXISTS (SELECT 1 FROM project_actions a WHERE a."actionTypeId" = t.id);

-- ##K01 Projets — totaux (Copilot : get_project_statistics sans groupBy ; Power BI : [Nombre Projets], [Projets Actifs])
SELECT count(*) AS projets, count(*) FILTER (WHERE coalesce("isArchived", false) = false) AS projets_actifs, count(*) FILTER (WHERE "isArchived") AS archives,
       count(*) FILTER (WHERE "projectModele" = 'project') AS modele_project, count(*) FILTER (WHERE "projectModele" = 'revendeur') AS revendeurs, count(*) FILTER (WHERE "projectModele" = 'applicateur') AS applicateurs,
       count(*) FILTER (WHERE "validationStatut" = 'Validé') AS valides, count(*) FILTER (WHERE "validationStatut" = 'Non validé') AS non_valides,
       coalesce(sum("surfaceProspectee"), 0) AS surface_prospectee
FROM projects;

-- ##K02 Projets par étape du pipeline (tableau de bord du CRM : get_dashboard_kpis ; Power BI : visuels par pipeline_stages)
SELECT s.position, s.name AS etape, s."isWonStage" AS gagne, s."isLostStage" AS perdu, count(p.id) AS projets, coalesce(sum(p."montantMarche"), 0) AS montant
FROM pipeline_stages s LEFT JOIN projects p ON p."pipelineStageId" = s.id AND coalesce(p."isArchived", false) = false
GROUP BY s.id, s.position, s.name, s."isWonStage", s."isLostStage" ORDER BY s.position;

-- ##K03 Projets par statut texte (Copilot : get_project_statistics groupBy=status ; Power BI : visuels sur projects[statut])
SELECT trim(statut) AS statut, count(*) AS projets FROM projects GROUP BY 1 ORDER BY 2 DESC, 1;

-- ##K04 Projets par commercial propriétaire (Copilot : groupBy=owner ; Power BI : Dim Commercial)
SELECT u.email, up.name AS commercial, count(*) AS projets,
       count(*) FILTER (WHERE s."isWonStage") AS gagnes_etape, count(*) FILTER (WHERE s."isLostStage") AS perdus_etape,
       coalesce(sum(p."montantMarche"), 0) AS montant_total, coalesce(sum(p."montantMarche") FILTER (WHERE s."isWonStage"), 0) AS montant_gagne
FROM projects p JOIN users u ON u.id = p."ownerId" LEFT JOIN user_profiles up ON up."userId" = u.id JOIN pipeline_stages s ON s.id = p."pipelineStageId"
GROUP BY u.email, up.name ORDER BY 1;

-- ##K05 Projets par famille de produit, par société et par ingénieur (Copilot : groupBy=product_family / client / engineer)
SELECT 'famille' AS dimension, coalesce("productFamily"::text, '(vide)') AS valeur, count(*) AS projets FROM projects GROUP BY 2
UNION ALL (SELECT 'société (top 5)', c.name, count(*) FROM projects p JOIN companies c ON c.id = p."companyId" GROUP BY c.name ORDER BY 3 DESC, 2 LIMIT 5)
UNION ALL (SELECT 'ingénieur (top 5)', e.name, count(*) FROM projects p JOIN engineers e ON e.id = p."engineerId" GROUP BY e.name ORDER BY 3 DESC, 2 LIMIT 5)
UNION ALL SELECT 'ingénieurs sans projet', NULL, count(*) FROM engineers e WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p."engineerId" = e.id)
UNION ALL SELECT 'sociétés sans projet', NULL, count(*) FROM companies c WHERE NOT EXISTS (SELECT 1 FROM projects p WHERE p."companyId" = c.id);

-- ##K06 Gagnés / perdus / conversion (Power BI : [Projets Gagnés] par action, [Projets Gagnés (Étape)] ; tableau de bord CRM : étape)
SELECT (SELECT count(DISTINCT "projectId") FROM project_actions WHERE "typeAction_legacy" = 'Commande gagnée') AS gagnes_par_action,
       (SELECT count(*) FROM projects p JOIN pipeline_stages s ON s.id = p."pipelineStageId" WHERE s."isWonStage") AS gagnes_par_etape,
       (SELECT count(*) FROM projects WHERE statut = 'Gagné') AS gagnes_par_statut_texte,
       (SELECT count(DISTINCT "projectId") FROM project_actions WHERE "typeAction_legacy" = 'Commande perdue') AS perdus_par_action,
       (SELECT count(*) FROM projects p JOIN pipeline_stages s ON s.id = p."pipelineStageId" WHERE s."isLostStage") AS perdus_par_etape,
       (SELECT count(*) FROM projects WHERE statut = 'Perdu') AS perdus_par_statut_texte,
       round((SELECT count(DISTINCT "projectId") FROM project_actions WHERE "typeAction_legacy" = 'Commande gagnée')::numeric / (SELECT count(*) FROM projects), 4) AS taux_de_conversion,
       (SELECT count(*) FROM projects WHERE coalesce("isArchived", false) = false AND statut NOT IN ('Gagné', 'Perdu')) AS projets_en_suivi_selon_le_CRM,
       (SELECT coalesce(sum(p."montantMarche"), 0) FROM projects p JOIN pipeline_stages s ON s.id = p."pipelineStageId" WHERE s."isWonStage") AS chiffre_gagne_selon_le_CRM;

-- ##K07 Actions de projet par type et par statut (Power BI : [Actions Projets], Dim Type Action)
SELECT "typeAction_legacy" AS type_action, count(*) AS total,
       count(*) FILTER (WHERE statut::text = 'Terminé') AS termine, count(*) FILTER (WHERE statut::text = 'A faire') AS a_faire,
       count(*) FILTER (WHERE statut::text = 'En cours') AS en_cours, count(*) FILTER (WHERE statut::text = 'Annulé') AS annule,
       count("dateRelance") AS avec_date_de_relance
FROM project_actions GROUP BY ROLLUP (1) ORDER BY 2 DESC;

-- ##K08 Relances — définitions de Power BI, date de référence figée au 30/09/2026 ([Relances En Retard], [Relances À Venir], [Relances Réalisées], [Relances Annulées], [Total Relances])
SELECT 'contacts' AS origine, count(*) AS total,
       count(*) FILTER (WHERE "statutRelance"::text = 'planifiee' AND "dateRelance" < DATE '2026-09-30') AS en_retard,
       count(*) FILTER (WHERE "statutRelance"::text = 'planifiee' AND "dateRelance" >= DATE '2026-09-30') AS a_venir,
       count(*) FILTER (WHERE "statutRelance"::text = 'faite') AS realisees,
       count(*) FILTER (WHERE "statutRelance"::text = 'annulee') AS annulees
FROM commercial_contact_relances
UNION ALL
SELECT 'projets (actions avec date de relance)', count(*),
       count(*) FILTER (WHERE statut::text = 'A faire' AND ("dateRelance" AT TIME ZONE 'Africa/Tunis')::date < DATE '2026-09-30'),
       count(*) FILTER (WHERE statut::text = 'A faire' AND ("dateRelance" AT TIME ZONE 'Africa/Tunis')::date >= DATE '2026-09-30'),
       count(*) FILTER (WHERE statut::text NOT IN ('A faire', 'Annulé')),
       count(*) FILTER (WHERE statut::text = 'Annulé')
FROM project_actions WHERE "dateRelance" IS NOT NULL;

-- ##K09 Relances — vues du CRM et du Copilot, par rapport à la date du jour (get_dashboard_kpis / relances du jour, en retard, à venir)
SELECT (SELECT count(*) FROM commercial_contact_relances WHERE "statutRelance"::text = 'planifiee' AND "dateRelance" = CURRENT_DATE) AS contacts_du_jour,
       (SELECT count(*) FROM commercial_contact_relances WHERE "statutRelance"::text = 'planifiee' AND "dateRelance" < CURRENT_DATE) AS contacts_en_retard,
       (SELECT count(*) FROM commercial_contact_relances WHERE "statutRelance"::text = 'planifiee' AND "dateRelance" > CURRENT_DATE) AS contacts_a_venir,
       (SELECT count(*) FROM project_actions a JOIN projects p ON p.id = a."projectId" WHERE a."dateRelance" IS NOT NULL AND coalesce(p."isArchived", false) = false AND date(a."dateRelance") = CURRENT_DATE) AS projets_du_jour,
       (SELECT count(*) FROM project_actions a JOIN projects p ON p.id = a."projectId" WHERE a."dateRelance" IS NOT NULL AND coalesce(p."isArchived", false) = false AND a."dateRelance" > now()) AS projets_a_venir,
       (SELECT count(*) FROM projects WHERE "nextRelanceDate" IS NOT NULL AND "nextRelanceDate" < now()) AS projets_nextRelanceDate_depassee,
       (SELECT count(*) FROM projects WHERE "lastRelanceAt" IS NULL) AS projets_jamais_relances_selon_lastRelanceAt;

-- ##K10 Contacts — totaux et répartition (Copilot : get_commercial_contact_statistics metric=contacts ; Power BI : [Nombre Contacts])
SELECT count(*) AS contacts, count(*) FILTER (WHERE "commercialId" IS NULL) AS non_affectes,
       count(*) FILTER (WHERE statut::text = 'ok') AS ok, count(*) FILTER (WHERE statut::text = 'rappeler_plus_tard') AS rappeler_plus_tard,
       count(*) FILTER (WHERE statut::text = 'user_injoignable') AS injoignable, count(*) FILTER (WHERE statut::text = 'client_refuse') AS client_refuse,
       count(*) FILTER (WHERE statut::text IN ('client_refuse', 'user_injoignable')) AS contacts_non_valides_selon_le_CRM,
       count(*) FILTER (WHERE "pipelineStage"::text = 'Gagné') AS gagnes, count(*) FILTER (WHERE "pipelineStage"::text = 'Perdu') AS perdus,
       (SELECT count(*) FROM commercial_contacts c WHERE NOT EXISTS (SELECT 1 FROM commercial_contact_relances r WHERE r."commercialContactId" = c.id)) AS contacts_sans_relance
FROM commercial_contacts;

-- ##K11 Contacts par étape (Power BI et écran CRM)
SELECT "pipelineStage"::text AS etape, count(*) AS contacts FROM commercial_contacts GROUP BY 1 ORDER BY 2 DESC;

-- ##K12 Production — fiches par famille et statut (Power BI : [Fiches PROMESH], [Fiches PROBAR], [Fiches Validées], [Fiches Non Conformes], [Production PROMESH m²], [Quantité PROBAR] ; source : vue production_fiches_v)
SELECT ligne AS famille, count(*) AS fiches, count(*) FILTER (WHERE statut IN ('VALIDE', 'validee')) AS validees,
       count(*) FILTER (WHERE conforme = false) AS non_conformes, sum("quantiteProduite") AS quantite_produite,
       round(count(*) FILTER (WHERE conforme = false)::numeric / nullif(count(*) FILTER (WHERE conforme IS NOT NULL), 0), 4) AS part_non_conformes,
       count(*) FILTER (WHERE "dataStatus"::text <> 'TEST') AS hors_TEST
FROM production_fiches_v GROUP BY ROLLUP (1) ORDER BY 1;

-- ##K13 Production par machine (Copilot : get_industrial_statistics groupBy=machine ne couvre QUE industrial_records, c'est-à-dire PROBAR)
SELECT m.code, m."typeMachine"::text AS type, m.statut::text AS statut,
       (SELECT count(*) FROM por_promesh f WHERE f."machineId" = m.id) AS fiches_promesh,
       (SELECT coalesce(sum(f."productionM2"), 0) FROM por_promesh f WHERE f."machineId" = m.id) AS m2,
       (SELECT count(*) FROM industrial_records f WHERE f."machineId" = m.id) AS fiches_probar,
       (SELECT coalesce(sum(f."quantiteProduite"), 0) FROM industrial_records f WHERE f."machineId" = m.id) AS quantite_probar,
       (SELECT count(*) FROM recuperable_fiches f WHERE f."machineId" = m.id) AS fiches_dechets
FROM machines m ORDER BY 2, 1;

-- ##K14 Production par mois (date de production)
SELECT to_char(date, 'YYYY-MM') AS mois, count(*) FILTER (WHERE ligne = 'PROMESH') AS fiches_promesh, sum("quantiteProduite") FILTER (WHERE ligne = 'PROMESH') AS m2,
       count(*) FILTER (WHERE ligne = 'PROBAR') AS fiches_probar, sum("quantiteProduite") FILTER (WHERE ligne = 'PROBAR') AS quantite_probar,
       count(*) FILTER (WHERE conforme = false) AS non_conformes
FROM production_fiches_v GROUP BY 1 ORDER BY 1;

-- ##K15 Déchets (Power BI : [Fiches Déchets], [Lignes Déchets], [Déchets kg], [Déchets Produit Fini kg])
SELECT (SELECT count(*) FROM recuperable_fiches) AS fiches, count(*) AS lignes, sum("dechetKg") AS dechets_kg, sum("dechetProduitFiniKg") AS dechets_produit_fini_kg FROM recuperable_lignes;

-- ##K16 Déchets par diamètre
SELECT diametre, count(*) AS lignes, sum("dechetKg") AS dechets_kg, sum("dechetProduitFiniKg") AS dechets_produit_fini_kg FROM recuperable_lignes GROUP BY 1 ORDER BY diametre::int;

-- ##K17 Clients (Power BI : [Nombre Clients], filtré par la date creeLe — toutes antérieures à la période du lot)
SELECT count(*) AS clients, min("creeLe") AS cree_le_min, max("creeLe") AS cree_le_max,
       count(*) FILTER (WHERE "creeLe" BETWEEN DATE '2026-04-01' AND DATE '2026-09-30') AS crees_dans_la_periode_du_lot,
       count("derniereFacturation") AS avec_derniere_facturation
FROM clients;

-- ##C01 ÉCART CONNU — projets par mois : Copilot = date de création ; Power BI (relation active) = date de démarrage
SELECT coalesce(c.mois, d.mois) AS mois, coalesce(c.n, 0) AS par_date_de_creation_copilot, coalesce(d.n, 0) AS par_date_de_demarrage_power_bi
FROM (SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS mois, count(*) AS n FROM projects GROUP BY 1) c
FULL JOIN (SELECT to_char("dateDemarrage", 'YYYY-MM') AS mois, count(*) AS n FROM projects GROUP BY 1) d ON d.mois = c.mois ORDER BY 1;

-- ##C02 ÉCART CONNU — relances de contact par mois : Copilot = date de création de la ligne (= date du contact dans le lot) ; Power BI = date de relance
SELECT coalesce(c.mois, d.mois) AS mois, coalesce(c.n, 0) AS par_date_de_creation_copilot, coalesce(d.n, 0) AS par_date_de_relance_power_bi
FROM (SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS mois, count(*) AS n FROM commercial_contact_relances GROUP BY 1) c
FULL JOIN (SELECT to_char("dateRelance", 'YYYY-MM') AS mois, count(*) AS n FROM commercial_contact_relances GROUP BY 1) d ON d.mois = c.mois ORDER BY 1;

-- ##C03 ÉCART CONNU — contacts par commercial : Copilot/KPI du CRM = créateur (createdBy) ; Power BI = commercial affecté (commercialId)
SELECT u.email, u.role::text AS role,
       (SELECT count(*) FROM commercial_contacts c WHERE c."createdBy" = u.id) AS contacts_crees_copilot,
       (SELECT count(*) FROM commercial_contacts c WHERE c."commercialId" = u.id) AS contacts_affectes_power_bi,
       (SELECT count(*) FROM commercial_contact_relances r WHERE r."commercialId" = u.id) AS relances_affectees,
       (SELECT count(*) FROM commercial_contact_relances r WHERE r."createdBy" = u.id) AS relances_creees
FROM users u WHERE u.role IN ('commercial', 'commercial_sedentaire') ORDER BY 2, 1;

-- ##C04 ÉCART CONNU — contacts par mois (même définition des deux côtés : date de création) — sert de témoin
SELECT to_char(date_trunc('month', "createdAt"), 'YYYY-MM') AS mois, count(*) AS contacts FROM commercial_contacts GROUP BY 1 ORDER BY 1;

-- ##C05 ÉCART CONNU — fenêtres glissantes du CRM calculées sur la date du jour (mois courant, 6 derniers mois) alors que le lot s'arrête au 30/09/2026
SELECT (SELECT count(*) FROM projects WHERE "createdAt" >= date_trunc('month', now())) AS projets_crees_ce_mois,
       (SELECT count(*) FROM commercial_contacts WHERE "createdAt" >= date_trunc('month', now())) AS contacts_crees_ce_mois,
       (SELECT count(*) FROM project_actions WHERE "dateAction" >= date_trunc('month', now())) AS actions_ce_mois,
       (SELECT count(*) FROM production_fiches_v WHERE date >= date_trunc('month', now())) AS fiches_production_ce_mois,
       (SELECT count(*) FROM projects WHERE "createdAt" >= now() - INTERVAL '6 months') AS projets_6_derniers_mois,
       (SELECT count(*) FROM projects WHERE "createdAt" < now() - INTERVAL '6 months') AS projets_exclus_de_la_fenetre_6_mois,
       (SELECT max("createdAt") FROM projects) AS dernier_projet, (SELECT max("createdAt") FROM commercial_contacts) AS dernier_contact;

-- ##C06 ÉCART CONNU — production vue par le Copilot : get_industrial_statistics lit industrial_records (PROBAR), les outils por_promesh lisent PROMESH ; Power BI lit la vue qui réunit les deux
SELECT 'industrial_records (get_industrial_statistics)' AS source, count(*) AS fiches, sum("quantiteProduite") AS quantite FROM industrial_records
UNION ALL SELECT 'por_promesh (get_por_promesh_stats / dashboard)', count(*), sum("productionM2") FROM por_promesh
UNION ALL SELECT 'production_fiches_v (Power BI)', count(*), sum("quantiteProduite") FROM production_fiches_v;
