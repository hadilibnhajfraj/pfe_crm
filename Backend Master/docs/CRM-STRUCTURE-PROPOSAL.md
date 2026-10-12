# Proposition de structure cible du CRM

État : **proposition, rien n'est appliqué.** Rédigée le 08/10/2026 après lecture du code (modèles, services, routes, écrans Flutter, outils du Copilot) et de la base. Aucune migration, aucun fichier de code, aucune donnée n'a été modifié pour l'écrire.

Documents liés : `reports/data-quality/INTERNAL-INDUSTRIAL-AUDIT.md` (état des données), `reports/data-quality/TEST_DATA_REVIEW.md` (données de test).

## 1. Ce que l'analyse du code a montré

Ces constats corrigent ou précisent l'audit précédent.

| Sujet | Constat | Conséquence pour la structure |
|---|---|---|
| Schéma | Aucun `sequelize.sync()` : la base n'évolue que par migrations (`src/migrations`). | Toute modification passe par une migration ; rien ne change « tout seul » au démarrage. |
| Machine sur les fiches | Le client envoie un texte (`machine` = « 1 »). Un hook serveur (`models/helpers/machineLink.js`) en déduit `machineId` et refuse une machine dont le statut n'est pas `ACTIVE`. | Ajouter des statuts ne casse pas ce hook : toute machine non `ACTIVE` reste refusée. C'est le comportement voulu pour « en panne » ou « hors service ». |
| Heures PROMESH | À la création du brouillon, `heureFin` est initialisée à `heureDebut` (`porPromesh.service.js`, ligne 262). | Les 28 fiches « fin ≤ début » sont des brouillons jamais complétés, pas des erreurs de saisie. La règle « fin > début » doit s'appliquer **à la validation de la fiche**, pas à l'enregistrement. Un poste de nuit passe minuit : fin < début y est légitime. |
| Maintenance en double | L'écran Flutter écrit aujourd'hui uniquement dans `maintenance_requests`. Les 2 lignes `industrial_records` de module `maintenance` datent de l'ancien fonctionnement. La route `/industrial-records` accepte pourtant encore ce module, ainsi qu'un outil du Copilot. | Le module `maintenance` de `industrial_records` est un reliquat à fermer en écriture. |
| Équipement de maintenance | La liste proposée à l'écran vient du référentiel des machines (« PROMESH — Machine 1 »), plus « Mélangeur » et « Autre équipement ». | Le lien vers `machines` peut être déduit sans ambiguïté par la fonction existante `parseMachineRef`. Il doit rester facultatif : deux choix ne sont pas des machines. |
| Salarié RH | À la création d'une demande, le service copie nom, prénom, matricule, etc. depuis `user_profiles` s'ils existent, sinon depuis le formulaire. Les colonnes RH de `user_profiles` sont vides pour les 13 profils. | Une table `employees` remplace proprement ces colonnes de profil, sans perte : il n'y a rien à migrer. |
| Approbation d'archivage | Le code actuel renseigne `approvedBy` et `approvedAt`. Les 2 demandes approuvées sans ces valeurs sont antérieures à ce correctif. | Pas de bogue à corriger ; lignes historiques à signaler seulement. |
| Metabase | Les 39 questions enregistrées portent toutes sur la base d'exemple de Metabase. Aucune ne lit une table du CRM. | Aucune dépendance BI à préserver. |
| Tâches planifiées | Aucune des 5 tâches (`src/cron`) ne lit les tables machines, production, maintenance ou RH. | Aucun impact. |
| Statuts codés en dur | Les valeurs `en_attente`, `acceptee`, `refusee`, `traitee`, `terminee`, `ACTIVE`, `INACTIVE` sont utilisées dans 11 fichiers Flutter, les outils du Copilot et leurs tests. | Renommer une valeur existante est le changement le plus risqué de toute la mission (voir § 3, décision D1). |

## 2. Principes proposés

1. **Ajouter, ne pas remplacer.** Nouvelles colonnes facultatives, nouvelles tables, nouvelles valeurs d'énumération. Aucune colonne ni table existante supprimée ou renommée dans ce chantier.
2. **Les anciennes colonnes restent lues** par l'API et l'application tant qu'une migration contrôlée n'a pas été validée.
3. **Aucune ligne métier créée** : les nouvelles tables naissent vides, sauf exception soumise à décision (D3).
4. **Les données de test sont marquées, pas transformées** : une colonne `dataStatus` les distingue (voir § 4.14).
5. **Une sauvegarde avant chaque migration**, des migrations réversibles et rejouables, et chaque donnée déplacée journalisée dans `data_change_log`.

## 3. Décisions à prendre avant toute migration

| N° | Décision | Recommandation | Pourquoi |
|---|---|---|---|
| D1 | Statuts RH et maintenance : renommer les valeurs existantes (`en_attente` → `SUBMITTED`…) ou les garder et **ajouter** les valeurs manquantes ? | **Garder et ajouter.** Exposer en plus un code normalisé (`statusCode`) dans les réponses de l'API. | Un renommage touche 11 fichiers Flutter, les outils du Copilot et leurs tests d'un seul coup, sans gain fonctionnel. Le code normalisé donne à Power BI et au Copilot les libellés professionnels demandés. |
| D2 | Fiches PROBAR : les sortir de `industrial_records` vers une table dédiée maintenant, ou plus tard ? | **Plus tard, dans un lot séparé.** Maintenant : colonnes manquantes ajoutées sur place et vue commune de lecture. | Le formulaire PROBAR, 6 outils du Copilot, le tableau de bord de production et 3 écrans lisent `industrial_records`. Le déplacement est faisable mais mérite son propre cycle de tests. |
| D3 | Table `products` : la créer vide, ou y inscrire les deux familles PROBAR et PROMESH ? | **Inscrire les deux familles**, et rien d'autre. | Ce ne sont pas des données inventées : ces deux valeurs existent déjà dans `machines.typeMachine`, `projects.productFamily` et `commercial_contact_products.produit`. Les références détaillées (diamètres, mailles) doivent venir du métier. |
| D4 | Demandes internes génériques (`internal_requests`) : créer la table maintenant ? | **Non.** Fournir seulement une vue de lecture qui réunit les trois types de demandes existants. | Aucun écran, aucune donnée et aucun besoin exprimé n'existe hors maintenance, RH et archivage. Une table vide sans écran serait de la structure morte. La spécification est prête au § 4.12 si le besoin se confirme. |
| D5 | Employés : créer la fiche automatiquement à la première demande RH d'un utilisateur, ou seulement à la main par un administrateur ? | **Automatiquement**, à partir du compte et de ce que l'utilisateur saisit. | Sans cela `employeeId` resterait vide et le texte libre continuerait. La fiche vient d'une saisie réelle, elle n'est pas inventée. |
| D6 | Statut machine : le passer automatiquement à `EN_MAINTENANCE` quand une intervention démarre ? | **Non pour l'instant** : statut modifié à la main par un gestionnaire. | Une règle automatique bloquerait la saisie des fiches de production de la machine dès qu'une intervention est ouverte. À décider avec l'atelier. |
| D7 | Données de test : appliquer le marquage `TEST` proposé dans `TEST_DATA_REVIEW.md` ? | **Oui pour les 33 lignes à marqueur explicite**, après votre relecture ; les 38 lignes `REVIEW` (30 dans les modules industriels et internes, 8 ailleurs) attendent votre avis ; aucune suppression. | Sans marquage, la règle anti-doublon des fiches (§ 4.9) ne peut pas être posée. |
| D8 | Périmètre : tout le document, ou seulement les modules industriels et internes (machines, production, maintenance, RH, documents) ? | **Modules industriels et internes d'abord** (lots 1 à 5 du § 6). | Les modules commerciaux fonctionnent et portent les données réelles ; leurs changements (§ 4.1 à 4.4) sont utiles mais moins urgents et plus risqués. |

## 4. Structure cible par entité

Légende : **=** inchangé, **+** ajouté, PK clé primaire, FK clé étrangère. Tout ajout de colonne est facultatif (`NULL` accepté) sauf mention contraire.

### 4.1 Clients et sociétés

| | |
|---|---|
| Objectif | `clients` = comptes de la comptabilité (import). `companies` = entreprises de bâtiment citées sur les projets. Les relier sans les fusionner. |
| Tables existantes | `clients` (195), `companies` (120, nom seul) |
| Table cible | les mêmes |
| Colonnes | `companies` : **=** `id`, `name` ; **+** `clientId`, `matriculeFiscal`, `adresse`, `telephone`, `email` |
| PK / FK | **+** `companies.clientId` → `clients.id` (`SET NULL`) |
| Index | **+** `companies(clientId)` ; pas d'unicité sur `name` tant que les 5 doublons candidats ne sont pas tranchés |
| Données concernées | 5 clients portent le nom d'une société : lien proposé en revue, jamais automatique |

### 4.2 Contacts

| | |
|---|---|
| Objectif | Rattacher un contact à une société et, s'il existe, à un client comptable. |
| Table | `commercial_contacts` (485) |
| Colonnes | **=** toutes, dont `nomSociete` (texte, conservé) ; **+** `companyId`, `clientId` |
| FK | **+** `companyId` → `companies.id`, `clientId` → `clients.id` (`SET NULL`) |
| Données concernées | 22 contacts portent le matricule d'un seul client (14 avec le même nom de société) : candidats à un lien, après validation |

### 4.3 Commercial

| | |
|---|---|
| Objectif | Suivi des contacts : actions, relances, rappels. |
| Tables | `commercial_contact_actions` (485), `commercial_contact_relances` (178), `commercial_contact_products` (485), `commercial_projects` (419) |
| Cible | **=** aucune modification de structure |
| Points signalés | `commercial_contact_products.produit` deviendra un lien vers `products` (§ 4.5). `commercial_projects` contient 416 lignes vides sur 419 : à examiner dans un chantier séparé, pas ici. |

### 4.4 Projets

| | |
|---|---|
| Objectif | Projet de chantier suivi par un commercial. |
| Table | `projects` (253) |
| Colonnes | **=** toutes ; les libellés (`entreprise`, `ingenieurResponsable`, `architecte`) restent à côté des liens `companyId`, `engineerId`, `architectId` ; **+** `productId` |
| FK | **+** `productId` → `products.id` (`SET NULL`) |
| Données concernées | `productFamily` est renseigné sur 2 projets : seuls ces 2 liens seraient posés. Les 251 autres restent vides. |

### 4.5 Produits

| | |
|---|---|
| Objectif | Référentiel unique des produits, aujourd'hui dispersé en trois énumérations. |
| Table existante | aucune |
| Table cible | **+** `products` |
| Colonnes | `id` (PK, uuid), `code` (unique), `nom`, `famille` (`PROBAR`, `PROMESH`), `unite`, `description`, `isActive`, dates |
| Relations | `projects.productId` et `productId` des fiches de production (§ 4.9) ; `machines.typeMachine` reste tel quel |
| Contraintes | `code` unique, `famille` obligatoire |
| Données concernées | selon D3 : 2 lignes (les deux familles), `unite` laissée vide si elle n'est pas confirmée |

### 4.6 Architectes et 4.7 Ingénieurs

| | |
|---|---|
| Tables | `architects` (19), `engineers` (118) |
| Cible | **=** aucune modification de structure |
| Pourquoi | Les colonnes nécessaires existent (`name`, `phone`, `email`). Une contrainte d'unicité sur le nom est impossible tant que les 10 doublons candidats d'ingénieurs ne sont pas tranchés. |

### 4.8 Machines

| | |
|---|---|
| Objectif | Référentiel des machines, décrit complètement et avec un état d'exploitation. |
| Table | `machines` (9) |
| Colonnes | **=** `id`, `code`, `nom`, `typeMachine`, `numero`, `statut`, `description` ; **+** `marque`, `modele`, `numeroSerie`, `ligne`, `localisation`, `dateAcquisition` |
| Énumération | `statut` : **=** `ACTIVE`, `INACTIVE` ; **+** `EN_MAINTENANCE`, `EN_PANNE`, `HORS_SERVICE` |
| Contraintes | **=** `code` unique, (`typeMachine`, `numero`) unique ; **+** `numeroSerie` unique quand il est renseigné |
| Données concernées | les 9 machines gardent leur statut `ACTIVE` ; les nouvelles colonnes restent vides : aucune valeur n'est connue |

Utilisations de `statut` à adapter (toutes repérées) :

| Fichier | Usage actuel | Adaptation |
|---|---|---|
| `models/Machine.js` | énumération à 2 valeurs | ajouter les 3 valeurs |
| `models/helpers/machineLink.js` | refuse une fiche si `statut !== "ACTIVE"` | inchangé ; message d'erreur à préciser selon le statut |
| `modules/machines/validators/machine.validator.js` | liste `STATUTS` | ajouter les 3 valeurs |
| `modules/machines/services/machine.service.js` | activer / désactiver | accepter un statut explicite |
| `ai/mcp/tools/industrial/listMachinesTool.js` | filtre `ACTIVE` / `INACTIVE` | ajouter les 3 valeurs |
| `modules/production/services/production.service.js` | compte les machines actives | inchangé |
| Flutter `machine_model.dart`, `machines_screen.dart`, `production_models.dart`, `production_widgets.dart` | bascule actif / inactif, pastille d'état | sélecteur de statut à 5 valeurs, 3 pastilles en plus |

Réversibilité : PostgreSQL ne sait pas retirer une valeur d'énumération. La migration inverse est possible seulement si aucune machine ne porte l'une des 3 nouvelles valeurs ; elle le vérifie et s'arrête sinon.

### 4.9 Production

État actuel : deux structures. `por_promesh` (58 colonnes, 5 tables filles) pour PROMESH ; `industrial_records` (table générique, détail dans un texte JSON) pour PROBAR.

| | |
|---|---|
| Objectif | Qu'une fiche, quelle que soit la ligne, porte les mêmes informations de base et les mêmes règles. |
| Tables | `por_promesh` (29), `industrial_records` module `probar` (19) |
| Table cible | les mêmes (D2), plus une vue de lecture commune **+** `production_fiches_v` |

Correspondance avec la fiche demandée :

| Information | `por_promesh` | `industrial_records` (probar) |
|---|---|---|
| Numéro de fiche | **=** `sequenceNumber` (unique) | **+** `numeroFiche` (unique) |
| Produit | **+** `productId` → `products` | **+** `productId` → `products` |
| Machine | **=** `machineId` → `machines` | **=** `machineId` → `machines` |
| Poste | **=** `poste` | **=** `poste` |
| Ligne | portée par `machines.ligne` (§ 4.8) | idem |
| Opérateur | **=** `operateur` (texte) ; **+** `operatorUserId` → `users` | idem |
| Date | **=** `dateProduction` | **=** `dateFiche` |
| Heure de début, de fin | **=** `heureDebut`, `heureFin` | **+** `heureDebut`, `heureFin` (aujourd'hui dans le JSON `description`) |
| Quantité prévue | **+** `quantitePrevue` | **+** `quantitePrevue` |
| Quantité produite | **=** `productionM2` | **=** `quantiteProduite` |
| Quantité rejetée | **+** `quantiteRejetee` | **+** `quantiteRejetee` |
| Statut | **=** `status` (`BROUILLON`, `VALIDE`) | **=** `statut` (texte : `enregistree`, `validee`) |
| Conformité | **=** `conformite` | **=** `statutQualite` |
| Commentaire | **=** `observationsGenerales` | **=** `observations` |
| Auteur, dates | **=** `createdBy`, `createdAt`, `updatedAt` | **=** idem |
| Nature de la donnée | **+** `dataStatus` | **+** `dataStatus` |

L'opérateur reste un texte tant que les opérateurs n'ont pas de compte : `operatorUserId` n'est rempli que s'il correspond à un utilisateur réel.

Vue `production_fiches_v` (lecture seule, pour Power BI et le Copilot) : `ligne`, `ficheId`, `numeroFiche`, `date`, `poste`, `machineId`, `productId`, `operateur`, `quantitePrevue`, `quantiteProduite`, `unite`, `quantiteRejetee`, `statut`, `conforme`, `dataStatus`, `createdBy`.

**Règles de validation** (étape 5) :

| Règle | Où | Pourquoi là |
|---|---|---|
| quantités ≥ 0 | contrainte `CHECK` en base + validateur | aucune ligne existante ne la viole (à vérifier par la migration, qui s'arrête sinon) |
| quantité rejetée ≤ quantité produite | contrainte `CHECK` en base + validateur | colonnes nouvelles, donc vides |
| heure de fin ≠ heure de début, et fin > début pour le poste du matin | service, **au moment de valider la fiche** | un brouillon naît avec fin = début ; un poste de nuit passe minuit |
| date de fiche pas dans le futur | validateur | — |
| machine existante et `ACTIVE` | hook existant `machineLink` | déjà en place |
| produit existant | clé étrangère | — |
| pas deux fiches pour la même machine, la même date et le même poste | index unique partiel `WHERE "dataStatus" = 'REAL'` | 6 groupes de doublons existent dans les données de test : l'index ne peut porter que sur les fiches réelles |

Les fiches existantes ne sont ni supprimées ni corrigées : elles sont classées `TEST` ou `REVIEW_REQUIRED` (§ 4.14).

### 4.10 Maintenance

| | |
|---|---|
| Objectif | Relier la demande à une machine, et séparer la **demande** (ce qui est signalé) de l'**intervention** (ce qui est fait). |
| Tables existantes | `maintenance_requests` (2), `maintenance_request_activities` (0), `maintenance_request_comments` (0) |
| Tables cibles | `maintenance_requests` enrichie ; **+** `maintenance_interventions` |

**`maintenance_requests`** (la demande)

| | |
|---|---|
| Colonnes | **=** toutes, dont `equipement` (texte, conservé pour « Mélangeur » et « Autre équipement ») ; **+** `machineId`, `typeMaintenance`, `plannedAt`, `cancelledAt`, `cancelledBy`, `dataStatus` |
| FK | **+** `machineId` → `machines.id` (`RESTRICT`), `cancelledBy` → `users.id` |
| Énumérations | `typeMaintenance` : `CORRECTIVE`, `PREVENTIVE` (défaut `CORRECTIVE`). `statut` : **=** `en_attente`, `acceptee`, `refusee`, `en_cours`, `terminee` ; **+** `planifiee`, `annulee` (D1) |
| Index | **+** `(machineId)`, `(typeMaintenance)` |
| Données concernées | 2 demandes : `machineId` déduit de « PROMESH — Machine 1 » par la fonction existante (→ PROMESH-01), journalisé |

Correspondance des statuts (code normalisé exposé par l'API) : `en_attente` → `EN_ATTENTE` ; `acceptee`, `planifiee` → `PLANIFIEE` ; `en_cours` → `EN_COURS` ; `terminee` → `TERMINEE` ; `refusee`, `annulee` → `ANNULEE`. « Refusée » (par le gestionnaire) et « annulée » (par le demandeur) restent distinctes en base.

**`maintenance_interventions`** (nouvelle)

| | |
|---|---|
| Colonnes | `id` (PK), `numero` (unique), `requestId`, `machineId`, `typeMaintenance`, `statut` (`PLANIFIEE`, `EN_COURS`, `TERMINEE`, `ANNULEE`), `technicianId`, `responsableId`, `plannedAt`, `startedAt`, `completedAt`, `cause`, `resultat`, `cout`, `commentaire`, `prochaineMaintenance`, `createdBy`, `dataStatus`, dates |
| FK | `requestId` → `maintenance_requests.id` (facultatif : une intervention préventive n'a pas de demande) ; `machineId` → `machines.id` (obligatoire) ; `technicianId`, `responsableId`, `createdBy` → `users.id` |
| Contraintes | `completedAt` ≥ `startedAt` ; `cout` ≥ 0 ; une intervention `TERMINEE` a une date de fin |
| Index | `(machineId, plannedAt)`, `(statut)`, `(requestId)` |
| Données concernées | aucune : la table naît vide, les 2 demandes n'ayant jamais été traitées |

Les colonnes `technicianId`, `startedAt`, `completedAt` de la demande restent en place et continuent d'alimenter l'écran actuel ; l'intervention les reprendra quand l'écran sera adapté.

Chaîne cible : `MACHINE ← DEMANDE ← INTERVENTION → TECHNICIEN`, avec coût, cause, résultat et prochaine échéance sur l'intervention. Pièces détachées : hors périmètre, aucune donnée ni besoin exprimé.

### 4.11 RH

| | |
|---|---|
| Objectif | Une fiche par salarié, à laquelle les demandes se rattachent. |
| Tables existantes | `hr_requests` (3), `hr_request_activities` (5), colonnes RH de `user_profiles` (vides) |
| Tables cibles | **+** `employees` ; `hr_requests` enrichie |

**`employees`** (nouvelle)

| | |
|---|---|
| Colonnes | `id` (PK), `userId`, `matricule`, `nom`, `prenom`, `qualification`, `departement`, `service`, `email`, `telephone`, `dateEmbauche`, `isActive`, `dataStatus`, dates |
| FK | `userId` → `users.id` (unique, facultatif : un salarié peut ne pas avoir de compte) |
| Contraintes | `matricule` unique quand il est renseigné ; `nom` obligatoire |
| Données concernées | aucune fiche créée par la migration. Les 3 demandes existantes citent 3 « salariés » de test saisis depuis le même compte : ils ne deviennent pas des employés. |

**`hr_requests`**

| | |
|---|---|
| Colonnes | **=** toutes, dont la copie `employeeNom`, `employeePrenom`… (conservée : c'est l'état du salarié au moment de la demande, utile au PDF) ; **+** `employeeId`, `description`, `cancelledAt`, `dataStatus` |
| FK | **+** `employeeId` → `employees.id` (`RESTRICT`) |
| Énumération | `statut` : **=** `en_attente`, `acceptee`, `refusee`, `traitee` ; **+** `brouillon`, `en_revue`, `annulee` (D1) |
| Données concernées | `employeeId` reste vide sur les 3 demandes de test |

Correspondance des statuts : `brouillon` → `DRAFT` ; `en_attente` → `SUBMITTED` ; `en_revue` → `IN_REVIEW` ; `acceptee` → `APPROVED` ; `refusee` → `REJECTED` ; `annulee` → `CANCELLED` ; `traitee` → `COMPLETED`.

L'approbateur et sa date existent déjà (`reviewedBy`, `reviewedAt`) ; ils ne sont pas dupliqués.

Les colonnes RH de `user_profiles` (`nom`, `prenom`, `matricule`, `qualification`, `departement`, `service`) deviennent redondantes. Elles restent en place et sont déclarées dépréciées.

### 4.12 Services internes

Recommandation D4 : **ne pas créer de table maintenant**. Créer seulement la vue de lecture **+** `internal_requests_v`, qui réunit les trois types de demandes existants sous des colonnes communes : `module` (maintenance, rh, archivage), `requestId`, `numero`, `demandeurId`, `responsableId`, `statut`, `statusCode`, `priorite`, `createdAt`, `closedAt`.

Si le besoin d'une demande générique se confirme, la table serait :

| | |
|---|---|
| Table | `internal_requests` |
| Colonnes | `id`, `numero` (unique), `requesterId`, `service`, `categorie`, `priorite` (`BASSE`, `NORMALE`, `HAUTE`, `URGENTE`), `description`, `assigneeId`, `statut`, `assignedAt`, `resolvedAt`, `closedAt`, `resolution`, dates |
| Statuts | `SUBMITTED` → `ASSIGNED` → `IN_PROGRESS` → `RESOLVED` → `CLOSED`, plus `REJECTED`, `CANCELLED` |
| FK | `requesterId`, `assigneeId` → `users.id` |
| Pièces jointes | par `documents` (§ 4.13) |

`tasks` (256) est l'agenda des commerciaux, pas un module de tâches internes : inchangé.

### 4.13 Documents et archivage

Deux fonctions distinctes, à nommer distinctement :

- **Archivage de projets** : `archive_requests`, `archive_request_messages`, `projects.isArchived`. **=** Conservé tel quel. À libeller « Archivage des projets » dans l'application, jamais « GED ».
- **Gestion documentaire** : n'existe pas ; 5 colonnes d'adresse de fichier dispersées.

Tables cibles : **+** `documents` (la fiche descriptive) et **+** `document_files` (le fichier).

**`documents`**

| | |
|---|---|
| Colonnes | `id` (PK), `titre`, `categorie` (`DEVIS`, `BON_DE_COMMANDE`, `PIECE_ACTION`, `PRODUCTION`, `JUSTIFICATIF_RH`, `PHOTO_MAINTENANCE`, `AUTRE`), `description`, `createdBy`, `dataStatus`, dates |
| Rattachement | une colonne facultative par entité : `projectId`, `companyId`, `clientId`, `contactId`, `employeeId`, `hrRequestId`, `maintenanceRequestId`, `porPromeshId`, `industrialRecordId` |
| FK | chacune vers sa table (`RESTRICT`) ; `createdBy` → `users.id` |
| Contrainte | au moins un rattachement renseigné |
| Index | un par colonne de rattachement, `(categorie)` |

Des clés étrangères explicites plutôt qu'un couple « type + identifiant » : la base garantit ainsi qu'un document ne pointe jamais vers une ligne inexistante.

**`document_files`**

| | |
|---|---|
| Colonnes | `id` (PK), `documentId`, `fileUrl`, `originalName`, `mimeType`, `extension`, `sizeBytes`, `checksum`, `storageStatus` (`PRESENT`, `MISSING`), `uploadedBy`, `uploadedAt` |
| FK | `documentId` → `documents.id` (`CASCADE`), `uploadedBy` → `users.id` |
| Contrainte | `fileUrl` unique |

Données concernées : les 21 références existantes (5 devis, 3 pièces d'action, 11 pièces PROMESH, 2 photos de non-conformité) seraient **copiées** dans ces tables, chaque copie journalisée avec sa colonne d'origine. Les anciennes colonnes (`fileUrl`…) restent en place et restent la source lue par l'application. Aucun fichier déplacé ni supprimé. Les 87 fichiers non référencés ne sont pas importés : rien ne dit à quoi ils se rattachent.

Cette copie doit tourner **sur le serveur qui détient le vrai dossier `uploads`**, sinon taille et présence des fichiers seraient fausses.

### 4.14 Audit et qualité des données

| | |
|---|---|
| Table existante | `data_change_log` (2 860 lignes) : **=** conservée |
| Ajout | colonne `dataStatus` sur `por_promesh`, `industrial_records`, `recuperable_fiches`, `maintenance_requests`, `maintenance_interventions`, `hr_requests`, `employees`, `documents` |
| Valeurs | `REAL` (défaut pour toute nouvelle ligne), `TEST`, `REVIEW_REQUIRED` |
| Usage | les indicateurs, la vue de production et la règle anti-doublon ne retiennent que `REAL` ; un filtre permet d'afficher le reste |
| Données concernées | selon D7 : 33 lignes `TEST`, 30 lignes `REVIEW_REQUIRED`, chaque marquage journalisé dans `data_change_log` |

Les comptes, projets, contacts et événements d'agenda de test (87 lignes) sont listés dans `TEST_DATA_REVIEW.md` mais ne reçoivent pas de colonne `dataStatus` dans ce chantier : ils relèvent des modules commerciaux (D8).

## 5. `industrial_records` : verdict par module

| Module | Lignes | Pourquoi il existe | Qui l'utilise | Doublon | Verdict |
|---|---|---|---|---|---|
| `probar` | 19 | table générique choisie au départ pour ne pas créer un schéma par module | formulaire et tableaux de bord PROBAR (Flutter), tableau de bord de production, 6 outils du Copilot, tableau de bord administrateur | non | **KEEP** maintenant, **MIGRATE** vers une table dédiée dans un lot séparé (D2) |
| `melange` | 3 | même raison ; tout le contenu est dans `melangeData` (JSON) | formulaire et historique de mélange (Flutter) | non | **KEEP** |
| `maintenance` | 2 | ancien circuit des demandes de maintenance | plus aucun écran en écriture ; lu par un tableau de bord et un outil du Copilot | oui : copie de `maintenance_requests` | **DEPRECATE** : refuser toute nouvelle écriture de ce module, garder les 2 lignes en lecture, puis les retirer après validation |

Routes concernées : `GET/POST/PUT/DELETE /industrial-records` (un seul module de code pour les trois). `maintenance_activities` (1 ligne) ne sert qu'à l'ancien circuit : dépréciée avec lui.

## 6. Plan de migration proposé

Une sauvegarde (`npm run db:backup`) avant chaque lot. Chaque lot est une migration Sequelize réversible, puis ses adaptations de code, puis ses tests.

| Lot | Contenu | Tables touchées | Risque |
|---|---|---|---|
| 1 | `dataStatus` ; marquage des données de test validées | 5 tables existantes | faible : colonnes nouvelles avec valeur par défaut |
| 2 | Machines : 6 colonnes, 3 statuts | `machines` | moyen : énumération non réversible si utilisée |
| 3 | Produits : table et liens | `products` (nouvelle), `projects`, fiches | faible |
| 4 | Production : colonnes, contraintes, index anti-doublon, vue | `por_promesh`, `industrial_records` | moyen : la contrainte dépend du lot 1 |
| 5 | Maintenance : lien machine, type, statuts, interventions ; fermeture du module `maintenance` de `industrial_records` | `maintenance_requests`, `maintenance_interventions` (nouvelle) | moyen |
| 6 | RH : employés, lien, statuts | `employees` (nouvelle), `hr_requests` | moyen |
| 7 | Documents : deux tables, copie des 21 références | `documents`, `document_files` (nouvelles) | faible en base ; à exécuter sur le bon serveur |
| 8 | Vue `internal_requests_v` | aucune table | très faible |
| 9 (optionnel, D8) | Liens sociétés / clients / contacts | `companies`, `commercial_contacts` | moyen : données réelles |

## 7. Compatibilité à préserver

| Élément | Garantie |
|---|---|
| API | aucune route supprimée, aucun champ de réponse retiré ; des champs s'ajoutent (`machineId`, `statusCode`, `dataStatus`…) |
| Application Flutter | continue de fonctionner sans mise à jour après les lots 1, 3, 4, 7, 8 ; les lots 2, 5, 6 ajoutent des valeurs de statut que les écrans doivent savoir afficher : mise à jour à livrer avec ces lots |
| Copilot | les outils existants gardent leurs paramètres ; les filtres de statut s'élargissent |
| Scripts d'audit | inchangés |
| Power BI / Metabase | aucune dépendance existante ; les deux vues sont des ajouts |
| Tâches planifiées, notifications | non concernées |

## 8. Tests prévus

- `npm test` complet avant et après chaque lot, comparé au résultat de référence (3 échecs connus et sans rapport : `ai.orchestrator.porPromeshAgent.integration.test.js`).
- Tests ciblés existants : `machines.routes`, `models.machineLink`, `production.routes`, `recuperables.validator.machines`, `ai.mcp.tools.industrial`, `ai.mcp.tools.maintenance`, `ai.mcp.tools.hr`, `ai.mcp.tools.porPromesh`.
- Tests à écrire : statuts de machine et refus de fiche, règles de validation de production, anti-doublon, lien machine et interventions de maintenance, création d'employé et lien RH, documents, permissions de chaque nouvelle route.
- Chaque migration : montée, descente, puis montée à nouveau sur une copie restaurée de la sauvegarde.
- Application : `flutter build web` et parcours manuel des écrans machines, production, maintenance et RH.

## 9. Risques

| Risque | Parade |
|---|---|
| Valeur d'énumération impossible à retirer | migration inverse qui vérifie l'absence d'usage et s'arrête sinon ; sauvegarde avant le lot |
| Écran Flutter qui ne connaît pas un nouveau statut | livrer backend et application ensemble pour les lots 2, 5, 6 ; affichage par défaut pour toute valeur inconnue |
| Index anti-doublon refusé par des données existantes | il ne porte que sur `dataStatus = 'REAL'` ; la migration compte les violations avant de le créer |
| Copie de documents faussée par un mauvais dossier `uploads` | exécution sur le serveur de production uniquement ; `storageStatus` enregistre ce qui a été constaté |
| Structure créée mais jamais utilisée | pas de table générique de demandes internes (D4) ; chaque nouvelle table a un écran ou un usage prévu |
| Deux sources pour une même information pendant la transition | l'ancienne colonne reste la source lue ; la nouvelle est déclarée cible ; la bascule est un lot à part |
