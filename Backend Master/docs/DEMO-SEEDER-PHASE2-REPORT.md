# Agent d'alimentation de la base de démonstration — rapport de phase 2

État au 10/10/2026 : **base de démonstration créée, simulation faite, aucune donnée métier injectée.** La base réelle n'a été que lue. `.env` n'a pas été modifié. Rien n'est déployé, Power BI n'a pas été touché.

## 1. Base de démonstration

| | |
|---|---|
| Serveur | 127.0.0.1:5432, PostgreSQL 17.5 |
| Utilisateur | `postgres` |
| Base | `cbigestionnairepfe_demo` |
| Origine | structure seule de `cbigestionnairepfe` (`pg_dump --schema-only`, en session lecture seule) |
| Tables | 197, comme la base réelle ; même dernière migration (M8) |
| Sauvegarde avant injection | `backups/cbigestionnairepfe_demo_20261010_180413.dump` (1,1 Mo, 197 tables, relue) |

Contenu : **uniquement les référentiels**.

| Table | Lignes | Rôle |
|---|---|---|
| `pipeline_stages` | 10 | étapes de pipeline |
| `project_action_types` | 20 | types d'action |
| `machines` | 9 | machines existantes |
| `product_families` | 2 | PROBAR, PROMESH |
| `SequelizeMeta` | 112 | liste des migrations, pour que le schéma soit reconnu à jour |

Toutes les autres tables sont vides : aucun utilisateur, client, contact, projet, fiche ni notification n'a été copié. Les 10 étapes de pipeline ne portent aucun lien vers un utilisateur.

## 2. Isolation et garde-fous

| Garde-fou | Mise en œuvre | Vérifié |
|---|---|---|
| Configuration indépendante | la cible vient de `scripts/demo-seeder/demo.config.json` ; `.env` n'est ni modifié ni utilisé pour le nom de la base | `.env` inchangé (date du 10/10 à 18 h 37) |
| Seul nom accepté | `cbigestionnairepfe_demo`, écrit en dur dans `lib/target.js` | 6 autres noms essayés, dont la base réelle, la copie de test et une variante en majuscules : tous refusés |
| Contrôle sur la connexion réelle | `current_database()` doit valoir exactement `cbigestionnairepfe_demo` | connexion à la base réelle : refusée ; à la démonstration : acceptée |
| Simulation sans écriture | transaction `READ ONLY` : la base refuserait toute écriture | — |
| Aucun appel externe | variables d'e-mail neutralisées, tâches planifiées désactivées, clés d'API retirées du processus | sera vérifié à l'injection |
| Mot de passe | jamais dans un fichier ; lu dans l'environnement | — |

État des bases après ce travail :

| Base | Utilisateurs | Projets | Contacts | Fiches PROMESH | Journal |
|---|---|---|---|---|---|
| `cbigestionnairepfe` (réelle) | 74 | 253 | 485 | 31 | 2 927 |
| `cbigestionnairepfe_demo` | 0 | 0 | 0 | 0 | 0 |

La base réelle est dans l'état constaté avant ce travail.

## 3. Architecture de l'agent

```
scripts/demo-seeder/
  demo.config.json        cible, lot, graine, période, volumes, limites, paramètres de simulation
  setupDemoDatabase.js    crée la base : structure + référentiels (ne vide ni ne supprime jamais rien)
  index.js                point d'entrée ; aujourd'hui : --dry-run seulement
  lib/target.js           nom autorisé, garde-fous, neutralisation des appels externes
  lib/random.js           hasard déterministe, identifiants stables
  lib/plan.js             construit le plan du lot (fonction pure, aucune base)
  lib/checks.js           contrôles avant écriture, sur le schéma réel de la base
```

- **Déterministe** : une graine (`20261010`) et la configuration donnent toujours le même plan. Vérifié à chaque simulation : deux constructions du plan ont la même empreinte.
- **Rejouable sans doublon** : chaque ligne a un identifiant dérivé du lot, de la table et d'une clé stable. Une ligne déjà présente est reconnue et ignorée.
- **Traçable** : lot `DEMO-demo-powerbi-v1-s20261010`. À l'injection, chaque création et chaque échec iront dans `data_change_log` avec ce `batch_id`.

**Comment les lignes seront créées**

| Domaine | Moyen | Pourquoi |
|---|---|---|
| Commercial (utilisateurs, sociétés, projets, actions, contacts, relances) | modèles Sequelize, en reproduisant les règles des routes | la logique de création du CRM est écrite dans les routes, pas dans des services réutilisables |
| Production (PROMESH, PROBAR, déchets) | services métier existants (`createPorPromesh`, `validatePorPromesh`, `createRecord`, `updateRecord`, `saveFiche`) | ils existent et portent les vraies règles ; puis `dataStatus = TEST` |

Règles des routes reproduites :
- un projet est créé par un `commercial` ou un administrateur, qui en devient propriétaire avec la permission `owner` ;
- deux projets d'un même propriétaire ne portent pas le même nom ;
- société, ingénieur et architecte ne sont pas renseignés pour un revendeur ;
- le montant du marché n'est posé que sur les modèles revendeur et applicateur ;
- un contact se voit créer automatiquement une ligne d'historique de statut, une ligne produit, un projet commercial s'il a un nom, et une action initiale « Terminé » dont le type dépend de son étape.

## 4. Simulation (dry-run)

Lancée sur `cbigestionnairepfe_demo`, en lecture seule. Détail : `reports/demo-seeder/dry-run-demo-powerbi-v1.json`.

**Résultat : 2 182 lignes prévues, 0 violation, 0 référence manquante. Injection possible, non exécutée.**

| Table | Prévues | Déjà présentes | Créée par |
|---|---|---|---|
| `users` | 10 | 0 | modèle |
| `user_profiles` | 10 | 0 | modèle |
| `companies` | 40 | 0 | modèle |
| `engineers` | 25 | 0 | modèle |
| `architects` | 10 | 0 | modèle |
| `clients` | 60 | 0 | modèle |
| `projects` | 80 | 0 | modèle |
| `user_projects` | 80 | 0 | modèle |
| `project_actions` | 300 | 0 | modèle |
| `commercial_contacts` | 150 | 0 | modèle |
| `commercial_contact_status_histories` | 150 | 0 | modèle (ligne automatique) |
| `commercial_contact_products` | 150 | 0 | modèle (ligne automatique) |
| `commercial_contact_actions` | 150 | 0 | modèle (ligne automatique) |
| `commercial_projects` | 93 | 0 | modèle (ligne automatique) |
| `commercial_contact_relances` | 100 | 0 | modèle |
| `por_promesh` | 90 | 0 | service |
| `por_promesh_controles_qualite` | 180 | 0 | service de la fiche |
| `por_promesh_process_control` | 360 | 0 | service de la fiche |
| `industrial_records` (PROBAR) | 70 | 0 | service |
| `recuperable_fiches` | 20 | 0 | service |
| `recuperable_lignes` | 54 | 0 | service de la fiche |
| **Total** | **2 182** | **0** | limite configurée : 8 000 |

Utilisateurs de démonstration : 6 `commercial`, 2 `commercial_sedentaire`, 1 `responsable_logistique_achat`, 1 `admin`. Rôles existants uniquement.

**Contrôles effectués sur chaque ligne**
- colonnes existantes, champs obligatoires, longueurs, valeurs d'énumération lues dans la base ;
- chaque clé étrangère pointe vers une ligne du plan ou de la base ;
- index uniques : conflits dans le plan et avec la base ;
- règles des routes (rôle créateur, nom de projet, affectation, domaine des adresses) ;
- fiches de production : passage par les **vrais validateurs** du CRM, machine existante et active, date dans la période et pas dans le futur, cohérence des heures pour les fiches à valider ;
- limites de volume par table et au total.

**Les contrôles détectent-ils vraiment un problème ?** J'ai soumis 18 plans volontairement fautifs (statut inconnu, champ obligatoire absent, relation invalide, e-mail en double, adresse hors du domaine de démonstration, commercial sédentaire propriétaire d'un projet, fiche du matin finissant avant de commencer, machine inconnue, rôle sans droit, dépassement de limite…). **Les 18 ont été refusés.**

**Avertissement** : 8 couples machine / date / poste portent plusieurs fiches. C'est un fonctionnement métier valide ; aucune règle d'unicité n'est appliquée.

## 5. Provenance des valeurs simulées

Tout est fictif et déclaré comme tel dans la configuration et dans les données elles-mêmes.

| Élément | Valeur | Marque de provenance |
|---|---|---|
| Noms | préfixe `DEMO` partout (« DEMO Entreprise 012 », « DEMO Projet 034 ») | dans le nom |
| Adresses e-mail | domaine `demo.invalid`, réservé et inexistant | contrôle bloquant |
| Téléphones | indicatif `+216 00`, qu'aucun numéro réel ne porte | — |
| Horaires de poste | matin 06:00 → 14:00, nuit 22:00 → 06:00 | **simulés** : le CRM n'en définit aucun ; déclarés dans `simulation.postes` |
| Montants de marché | 15 000 à 450 000, seulement revendeur et applicateur | texte de provenance dans `localisationCommentaire` |
| Production | PROMESH 400 à 2 600 m² ; PROBAR 600 à 2 400 (unité non définie par le CRM) | texte de provenance dans l'observation de la fiche |
| Période | 01/04/2026 au 30/09/2026 | toutes les dates sont passées |
| Produits | aucune référence : `productId` reste vide | — |

## 6. Limites connues

1. **Seule la simulation existe.** L'injection, la suppression ciblée d'un lot et les tests automatisés restent à écrire, après votre validation.
2. **La simulation ne rejoue pas les écritures.** Elle confronte le plan au schéma et aux validateurs ; elle n'exécute pas les services. Une erreur qui n'apparaîtrait qu'à l'écriture réelle (un hook, par exemple) arrêtera le lot à l'injection.
3. **`dataStatus` n'est pas connu des modèles.** Une fiche créée par un service naît `REAL` ; l'agent la passera à `TEST` aussitôt après, sur l'identifiant qu'il vient de créer.
4. **Les fiches de déchets reçoivent leur identifiant du service.** Elles seront retrouvées au rejeu par leur combinaison module / machine / ligne / poste / date, déjà unique dans le schéma.
5. **La date de validation des fiches sera celle de l'injection**, pas une date passée : c'est le service qui la pose.
6. **`data_change_log` n'a pas d'opération `DELETE`.** La suppression d'un lot sera tracée dans un registre de fichier, sauf si vous autorisez l'ajout de cette valeur dans la base de démonstration.
7. **Tables commerciales sans `dataStatus`** : leur isolation repose sur la base séparée et le registre du lot.
8. **L'agent charge le code du CRM** (modèles et services) pour créer les lignes. Il fixe la base visée pour son propre processus avant ce chargement ; un autre programme lancé avec `.env` viserait, lui, la base que `.env` désigne.

## 7. Lancer la simulation

```
node scripts/demo-seeder/setupDemoDatabase.js     # contrôle la base (n'écrit rien sans --create)
node scripts/demo-seeder/index.js --dry-run       # simulation, lecture seule
```

Retour arrière à ce stade : la base de démonstration peut être supprimée et recréée sans aucun effet sur la base réelle ; sa sauvegarde vide est dans `backups/`.

## 8. Décisions attendues avant l'injection

1. Valider les volumes et la répartition ci-dessus, ou les ajuster dans `demo.config.json`.
2. Valider les horaires de poste simulés (06:00 → 14:00 et 22:00 → 06:00).
3. Autoriser ou non l'ajout de l'opération `DELETE` à `data_change_log` **dans la base de démonstration seulement**.
4. Mot de passe des 10 comptes de démonstration : un mot de passe que vous fournissez (pour vous connecter au CRM de démonstration), ou des comptes non connectables.
