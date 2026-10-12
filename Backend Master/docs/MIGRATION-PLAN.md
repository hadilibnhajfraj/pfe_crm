# Plan de migration — restructuration des modules industriels et internes

État au 08/10/2026 : **migrations écrites et testées sur une copie (voir `reports/data-quality/MIGRATION-TEST-REPORT.md`), aucune exécutée sur la base réelle.** La base PostgreSQL n'a pas été modifiée. Aucun modèle, service, route ou écran n'a été modifié.

Structure validée : `docs/CRM-STRUCTURE-PROPOSAL.md`, avec vos corrections (pas de création automatique d'employé, `product_families` au lieu de produits, clients / contacts / sociétés hors chantier, noms anglais des colonnes machines).

## 1. Où sont les migrations, et pourquoi pas dans `src/migrations`

Les 8 fichiers sont dans **`src/migrations-pending/`**. Tant qu'ils y restent, ni `npm run db:migrate` ni l'intégration continue (`.github/workflows/backend-ci.yml` lance `db:migrate`) ne peuvent les exécuter par accident.

**Activer un lot = déplacer son fichier dans `src/migrations/`**, puis lancer `npm run db:migrate`. C'est le seul geste qui déclenche une écriture de structure.

**Index anti-doublon mis en attente** : l'index unique (machine, date, poste) a été retiré de M4 et placé dans `src/migrations-pending/on-hold/`, hors de portée de toute commande de migration. Il ne sera activé que si la règle métier est confirmée ; l'analyse des 6 groupes existants (rapport de test) recommande de ne pas l'activer tel quel.

## 2. Ordre d'exécution

| Ordre | Action | Type |
|---|---|---|
| 0 | `npm run db:backup` ; restauration dans une base de test ; répétition complète des étapes 1 à 11 sur cette copie | sauvegarde et répétition |
| 1 | `20261009090000-add-data-status` | migration |
| 2 | `restructureDataApply.js --step=mark-test-data --apply` | données, journalisé |
| 3 | `20261009091000-extend-machines` | migration |
| 4 | `20261009092000-create-product-families-and-products` | migration |
| 5 | `20261009093000-extend-production-fiches` | migration |
| 6 | `20261009094000-extend-maintenance` | migration |
| 7 | `restructureDataApply.js --step=link-maintenance-machines --apply` | données, journalisé |
| 8 | `20261009095000-create-employees-and-link-hr-requests` | migration |
| 9 | `20261009096000-create-documents` | migration |
| 10 | `restructureDataApply.js --step=copy-documents --apply`, **sur le serveur qui détient le vrai dossier `uploads`** | données, journalisé |
| 11 | `20261009097000-create-internal-requests-view` | migration |

Dépendances qui imposent cet ordre : l'étape 5 exige les étapes 1 et 4 ; l'étape 9 exige 1, 6 et 8 ; l'étape 11 exige 1, 6 et 8.

Le code de chaque lot (modèles, services, validateurs, écrans) se livre **après** la migration correspondante, jamais avant : un modèle Sequelize qui déclare une colonne absente de la base fait échouer toutes les lectures de la table.

## 3. Détail des migrations

Toutes sont rejouables sans effet (`IF NOT EXISTS`) et s'exécutent dans une transaction, sauf l'ajout de valeurs d'énumération que PostgreSQL impose hors transaction.

### M1 — `20261009090000-add-data-status`

| | |
|---|---|
| Tables | `por_promesh`, `industrial_records`, `recuperable_fiches`, `maintenance_requests`, `hr_requests`, `archive_requests` |
| Colonnes | `dataStatus` (type `enum_data_status` : `REAL`, `TEST`, `REVIEW_REQUIRED`), obligatoire, défaut `REAL` |
| Contraintes, FK | aucune |
| Index | un index sur `dataStatus` par table |
| Données concernées | 63 lignes reçoivent `REAL` par défaut ; aucune ne change de sens |
| Rollback | suppression des 6 colonnes et du type |
| Risques | faible. `archive_requests` s'ajoute à la liste de la proposition : 4 de ses lignes sont à marquer |
| Tests | la colonne existe avec `REAL` partout ; l'application répond comme avant sur les 6 modules |

### M2 — `20261009091000-extend-machines`

| | |
|---|---|
| Table | `machines` |
| Colonnes | `brand`, `model`, `serialNumber`, `productionLine`, `location`, `acquisitionDate`, toutes facultatives (`description` existe déjà) |
| Énumération | `enum_machines_statut` : + `EN_MAINTENANCE`, `EN_PANNE`, `HORS_SERVICE` |
| Index | unique sur `serialNumber` quand il est renseigné |
| FK | aucune |
| Données concernées | aucune : les 9 machines gardent `ACTIVE` ; les nouvelles colonnes restent vides |
| Rollback | suppression des 6 colonnes. Les 3 valeurs restent dans le type (PostgreSQL ne sait pas les retirer) ; l'annulation s'arrête si une machine porte l'une d'elles |
| Risques | moyen : valeurs d'énumération irréversibles. Sans effet tant que le code ne les propose pas |
| Tests | `machines.routes.test.js`, `models.machineLink.test.js`, `recuperables.validator.machines.test.js` ; une machine non `ACTIVE` reste refusée sur une fiche |

### M3 — `20261009092000-create-product-families-and-products`

| | |
|---|---|
| Tables créées | `product_families`, `products` |
| Colonnes | `product_families` : `id`, `code` (unique), `name`, `description`, `active`. `products` : `id`, `familyId`, `code` (unique), `name`, `reference`, `description`, `unit`, `active` |
| FK | `products.familyId` → `product_families.id` (`RESTRICT`) |
| Index | `products(familyId)` |
| Données concernées | **2 lignes insérées** : PROBAR et PROMESH, journalisées dans `data_change_log`. `products` reste **vide** |
| Rollback | suppression des 2 tables ; refusé si `products` contient des lignes. Le journal n'est pas effacé |
| Risques | faible |
| Tests | exactement 2 familles, 0 produit, 2 lignes au journal ; rejouer la migration n'insère rien de plus |

### M4 — `20261009093000-extend-production-fiches`

| | |
|---|---|
| Tables | `por_promesh`, `industrial_records` |
| Colonnes | `por_promesh` : `productId`, `operatorUserId`, `quantitePrevue`, `quantiteRejetee`. `industrial_records` : les mêmes, plus `numeroFiche`, `heureDebut`, `heureFin` |
| FK | `productId` → `products.id`, `operatorUserId` → `users.id` (`SET NULL`) |
| Contraintes | quantités ≥ 0 ; quantité rejetée ≤ quantité produite (2 contraintes par table) |
| Index | unique sur (`module`, `numeroFiche`) quand il est renseigné ; `productId`. L'index unique (machine, date, poste) est **en attente**, dans un fichier séparé |
| Vue créée | `production_fiches_v` (PROMESH et PROBAR sous les mêmes colonnes) |
| Données concernées | aucune ligne modifiée. Les 28 brouillons PROMESH « fin = début » ne sont ni corrigés ni signalés comme erreurs |
| Rollback | suppression de la vue, des index, des contraintes et des colonnes |
| Risques | faible, une fois l'index anti-doublon sorti de cette migration |
| Tests | `production.routes.test.js`, `ai.mcp.tools.porPromesh.test.js`, `ai.mcp.tools.industrial.test.js` ; quantité négative refusée ; rejetée > produite refusée |

La règle « heure de fin > heure de début » n'est **pas** une contrainte de base : elle sera contrôlée par le service au moment de valider la fiche, et acceptera un poste de nuit qui passe minuit.

### M5 — `20261009094000-extend-maintenance`

| | |
|---|---|
| Table modifiée | `maintenance_requests` : `machineId`, `typeMaintenance` (`CORRECTIVE` par défaut, ou `PREVENTIVE`), `plannedAt`, `cancelledAt`, `cancelledBy` |
| Table créée | `maintenance_interventions` : `numero`, `requestId`, `machineId`, `typeMaintenance`, `statut`, `technicianId`, `responsableId`, `plannedAt`, `startedAt`, `completedAt`, `cause`, `resultat`, `cout`, `commentaire`, `prochaineMaintenance`, `createdBy`, `dataStatus` |
| Énumérations | `enum_maintenance_requests_statut` : + `planifiee`, `annulee` (les 5 valeurs historiques sont inchangées). Nouvelles : `enum_maintenance_type`, `enum_maintenance_interventions_statut` (`PLANIFIEE`, `EN_COURS`, `TERMINEE`, `ANNULEE`) |
| FK | `maintenance_requests.machineId` → `machines` (`RESTRICT`, facultatif) ; intervention → demande (facultatif), machine (obligatoire), utilisateurs |
| Contraintes | fin ≥ début ; coût ≥ 0 ; une intervention terminée a une date de fin |
| Index | machine, type ; intervention : (machine, date planifiée), statut, demande, technicien |
| Données concernées | la migration ne modifie aucune ligne. L'étape 7 relie ensuite les 2 demandes à PROMESH-01 |
| Rollback | suppression de la table et des colonnes ; refusé si des interventions existent ou si une demande porte un nouveau statut |
| Risques | moyen : 2 valeurs d'énumération irréversibles |
| Tests | `ai.mcp.tools.maintenance.test.js` ; les 5 statuts historiques fonctionnent comme avant ; « Mélangeur » et « Autre équipement » restent acceptés sans machine |

### M6 — `20261009095000-create-employees-and-link-hr-requests`

| | |
|---|---|
| Table créée | `employees` : `userId` (unique, facultatif), `matricule`, `nom`, `prenom`, `qualification`, `departement`, `service`, `email`, `telephone`, `dateEmbauche`, `isActive`, `createdBy`, `dataStatus` |
| Table modifiée | `hr_requests` : `employeeId` (facultatif), `description`, `cancelledAt` |
| Énumération | `enum_hr_requests_statut` : + `brouillon`, `en_revue`, `annulee` (les 4 valeurs historiques sont inchangées) |
| FK | `employees.userId` → `users` ; `hr_requests.employeeId` → `employees` (`RESTRICT`) |
| Index | `matricule` unique quand il est renseigné ; (nom, prénom) ; `hr_requests(employeeId)` |
| Données concernées | **aucune**. `employees` naît vide. Les 3 demandes gardent `employeeId` vide |
| Rollback | suppression de la table et des colonnes ; refusé si des salariés existent ou si une demande porte un nouveau statut |
| Risques | moyen : 3 valeurs d'énumération irréversibles |
| Tests | `ai.mcp.tools.hr.test.js`, `ai.agents.hrAgent.test.js` ; une demande sans salarié rattaché se crée, s'accepte, se refuse et se traite comme aujourd'hui |

Aucun salarié n'est créé quand un utilisateur dépose une demande. Le rattachement ou la création d'une fiche sera un geste du responsable RH.

### M7 — `20261009096000-create-documents`

| | |
|---|---|
| Tables créées | `documents`, `document_files` |
| Colonnes | `documents` : `titre`, `categorie`, `description`, 10 colonnes de rattachement facultatives, `createdBy`, `dataStatus`. `document_files` : `documentId`, `fileUrl` (unique), `originalName`, `mimeType`, `extension`, `sizeBytes`, `checksum`, `storageStatus`, colonne d'origine (`sourceTable`, `sourceColumn`, `sourceRecordId`), `uploadedBy`, `uploadedAt` |
| FK | `documents` → projet, société, client, contact, salarié, demande RH, demande et intervention de maintenance, fiche PROMESH, fiche industrielle (`RESTRICT`) ; `document_files.documentId` → `documents` (`CASCADE`) |
| Contrainte | au moins un rattachement par document ; taille ≥ 0 |
| Données concernées | la migration ne copie rien. L'étape 10 crée ensuite **19 documents** (voir § 4) |
| Rollback | suppression des 2 tables ; refusé si elles contiennent des lignes. Les colonnes d'origine n'ont jamais été modifiées |
| Risques | faible en base. Les clés partent de `documents` : les tables clients, sociétés et contacts ne sont pas modifiées |
| Tests | un document sans rattachement est refusé ; une adresse de fichier en double est refusée |

### M8 — `20261009097000-create-internal-requests-view`

| | |
|---|---|
| Vue créée | `internal_requests_v` : maintenance, RH et archivage sous `module`, `requestId`, `numero`, `demandeurId`, `responsableId`, `statut`, `statusCode`, `priorite`, `createdAt`, `closedAt`, `dataStatus` |
| Tables | aucune créée ni modifiée |
| Données concernées | aucune |
| Rollback | suppression de la vue |
| Risques | très faible |
| Tests | la vue rend 9 lignes (2 + 3 + 4) avec un `statusCode` pour chacune |

## 4. Données qui seront touchées

La simulation a été lancée aujourd'hui, en lecture seule. Les trois résultats sont dans `reports/data-quality/restructure-*.json`.

| Étape | Effet | Lignes |
|---|---|---|
| Marquage des données de test | `dataStatus = TEST` | 33 : 16 fiches PROMESH, 11 fiches industrielles, 3 demandes d'archivage, 2 demandes RH, 1 demande de maintenance |
| | `dataStatus = REVIEW_REQUIRED` | 30 : 13 fiches PROMESH, 13 fiches industrielles, 1 fiche de déchets, 1 demande de maintenance, 1 demande RH, 1 demande d'archivage |
| Familles de produits | insertion | 2 |
| Lien maintenance → machine | `machineId` renseigné | 2 demandes → PROMESH-01 |
| Copie des documents | insertion dans `documents` et `document_files` | 19 fichiers distincts : 5 devis, 3 pièces d'action, 11 pièces PROMESH. Les 2 photos de non-conformité pointent vers un fichier déjà compté et ne sont pas copiées deux fois |

**Écart avec votre consigne sur les 38 cas ambigus** : 8 d'entre eux sont dans des tables qui n'ont pas de colonne `dataStatus` dans la structure validée (1 utilisateur, 1 société, 4 ingénieurs, 2 actions de projet). Ils ne peuvent pas être marqués sans ajouter cette colonne à `users`, `companies`, `engineers` et `project_actions`, ce qui sort du périmètre validé. Ils restent listés dans `TEST_DATA_REVIEW.md`. Décision à prendre : étendre `dataStatus` à ces 4 tables, ou les laisser en revue manuelle.

Sur ce poste, 6 des 19 fichiers sont absents du dossier `uploads` (4 devis, 2 pièces d'action). Sur le bon serveur, ce constat peut changer : c'est pourquoi l'étape 10 doit y être exécutée.

**Rien n'est supprimé.** Les 87 lignes candidates à une suppression future sont décrites dans `reports/data-quality/FUTURE_DELETION_REPORT.md` : 59 comptes de test et 14 événements d'agenda sans aucune dépendance ; 6 projets, 1 contact et 7 événements dont la suppression entraînerait ou détacherait 116 lignes liées.

## 5. Rollback

| Niveau | Moyen |
|---|---|
| Une migration | `npx sequelize-cli db:migrate:undo`, dans l'ordre inverse. Chaque annulation refuse de détruire des données créées depuis |
| Une étape de données | chaque écriture est dans `data_change_log` avec son ancienne valeur et son identifiant de lot (`RS-…`) ; elle se défait ligne par ligne |
| Tout le chantier | restauration de la sauvegarde prise à l'étape 0 |
| Irréversible | 8 valeurs d'énumération ajoutées (3 machines, 2 maintenance, 3 RH). Elles restent dans les types après annulation, sans effet tant que le code ne les utilise pas |

## 6. Tests nécessaires

1. **Répétition sur copie** : restaurer la sauvegarde dans une base de test, y jouer les étapes 1 à 11, puis toutes les annulations dans l'ordre inverse, puis de nouveau les 11 étapes.
2. **`npm test` complet** avant le chantier et après chaque lot, comparé à la référence (3 échecs connus et sans rapport dans `ai.orchestrator.porPromeshAgent.integration.test.js`).
3. **Tests ciblés existants**, cités par migration au § 3.
4. **Tests à écrire avec le code de chaque lot** : statuts de machine, règles de validation et anti-doublon de production, interventions, rattachement d'un salarié, documents, permissions des nouvelles routes.
5. **Application** : `flutter build web` et parcours des écrans machines, production, maintenance, RH après chaque lot qui les touche.

## 7. Rôles et permissions

Rôles existants : `admin`, `superadmin`, `superadmin2`, `responsable_logistique_achat`, `commercial`, `commercial_sedentaire`, `accueil`. **Aucun nouveau rôle n'est nécessaire.**

| Responsabilité demandée | Représentée aujourd'hui par | Où c'est défini |
|---|---|---|
| ADMIN | rôles `admin`, `superadmin`, `superadmin2` | `constants/roles.js` (`ADMIN_TIER_ROLES`) |
| PRODUCTION_MANAGER | rôle `responsable_logistique_achat` : fiches PROMESH et PROBAR, machines, tableau de bord de production limité à ses fiches | `moduleAccessGuard.js`, routes machines et production |
| MAINTENANCE (gestionnaire) | rôles administrateurs, `responsable_logistique_achat`, plus un compte désigné par son adresse | `requireMaintenanceManager.js`, `config/maintenanceManager.js` |
| MAINTENANCE (technicien) | pas un rôle : n'importe quel utilisateur actif, choisi par le gestionnaire | `maintenanceRequest.service.js` |
| RH | rôles administrateurs, plus un compte désigné par son adresse | `requireHrReviewer.js`, `config/hrManager.js` |
| EMPLOYEE | tout utilisateur connecté : dépose et suit ses propres demandes RH et de maintenance | routes `hr-requests`, `maintenance-requests` |
| COMMERCIAL | rôles `commercial`, `commercial_sedentaire` : aucun accès à la production ni à la gestion des machines | routes machines et production |

Permissions proposées pour ce qui est nouveau, sur le modèle de l'existant :

| Élément | Lecture | Écriture |
|---|---|---|
| Statut et fiche d'une machine | administrateurs, `responsable_logistique_achat` | les mêmes (règle actuelle de `/machines`) |
| Interventions de maintenance | gestionnaires de maintenance ; le technicien affecté ; le demandeur de la demande liée | gestionnaires de maintenance |
| Salariés (`employees`) | responsables RH ; chaque utilisateur pour sa propre fiche | responsables RH |
| Rattacher un salarié à une demande | — | responsables RH |
| Documents | qui peut lire l'entité de rattachement | qui peut déjà y joindre un fichier aujourd'hui |
| Familles de produits | tout utilisateur connecté | administrateurs |
| Changer `dataStatus` | administrateurs | administrateurs |

Deux points à connaître, sans changement proposé : le responsable RH et le responsable maintenance sont reconnus par une **adresse e-mail écrite dans le code**, pas par un rôle ; et la liste des machines (`GET /machines`) est lisible par tout utilisateur connecté.

## 8. Compatibilité

Aucune API n'est supprimée ni renommée par ces migrations. Tant que le code n'est pas modifié, l'application ignore les nouvelles colonnes, tables et vues.

| Élément | Après les migrations seules | Avec le code du lot |
|---|---|---|
| API | réponses identiques | des champs s'ajoutent (`machineId`, `statusCode`, `dataStatus`, `brand`…) ; aucun n'est retiré |
| Flutter | fonctionne sans mise à jour | 11 fichiers lisent des statuts en dur : à mettre à jour avec les lots machines, maintenance et RH pour afficher les nouvelles valeurs ; un statut inconnu doit avoir un affichage par défaut |
| Copilot | fonctionne sans changement | filtres de statut à élargir (`listMachinesTool`) ; outils interventions et salariés à ajouter |
| Routes, contrôleurs, services | inchangés | voir ci-dessous |
| Tests | inchangés | à compléter par lot |
| Tâches planifiées | non concernées : aucune ne lit ces tables | — |
| Notifications | non concernées | — |

**Fermeture des écritures de maintenance dans `industrial_records`** : trois points d'entrée peuvent encore en créer.

| Point d'entrée | Fichier | Traitement prévu, après tests |
|---|---|---|
| `POST /industrial-records` avec `module = maintenance` | `industrialRecord.service.js` (création réservée à un compte) | refuser avec un message qui renvoie vers `/maintenance-requests` |
| Outil Copilot `createIndustrialRecordTool` | accepte `module = maintenance` | retirer cette valeur ; `createMaintenanceRequestTool` écrit déjà dans `maintenance_requests` |
| `PUT /industrial-records/:id` et `updateIndustrialRecordTool` | mêmes fichiers | interdire de passer une fiche au module maintenance |

Lectures conservées : le tableau de bord administrateur et l'écran PROMESH lisent encore les 2 anciennes lignes ; elles restent intactes et lisibles. L'écran Flutter de maintenance écrit déjà uniquement dans `maintenance_requests`.

## 9. Risques

| Risque | Parade |
|---|---|
| SQL jamais exécuté | répétition complète sur une copie avant la base réelle |
| Valeurs d'énumération irréversibles | sauvegarde avant ; annulation qui refuse de laisser des lignes incohérentes |
| Index anti-doublon trop strict pour l'atelier | à confirmer avant l'étape 5 ; il ne porte que sur les fiches réelles |
| Code livré avant sa migration | ordre imposé : migration, puis code |
| Copie de documents sur le mauvais serveur | étape 10 réservée au serveur de production ; l'état constaté est enregistré dans `storageStatus` |
| Écran qui ne connaît pas un nouveau statut | livrer application et backend ensemble pour les lots 2, 5, 6 |
| Migration exécutée par accident | dossier d'attente hors de portée de `db:migrate` et de l'intégration continue |
