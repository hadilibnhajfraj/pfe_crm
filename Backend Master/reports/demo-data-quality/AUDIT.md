# Audit de qualité des données de démonstration — `cbigestionnairepfe_demo`

Audit réalisé le 12/10/2026, en lecture seule, pour la soutenance du PFE (CRM, Copilot IA, Power BI).

## 1. Conclusion

**Les données sont saines sur le plan relationnel, mais la démonstration n'est pas prête en l'état : quatre points bloquent ou faussent le Copilot.**

- **Intégrité** : aucune référence orpheline sur 18 relations contrôlées, aucun doublon sur les clés métier, aucune valeur numérique impossible, aucun statut hors des listes du code.
- **Bloquant 1 — comptes** : 9 des 10 comptes du lot ne peuvent pas se connecter (mot de passe stocké sous une forme qui n'est pas une empreinte bcrypt). Seuls `demo.commercial01` et un compte hors lot, `issam@gmail.com`, fonctionnent.
- **Bloquant 2 — configuration** : le `.env` désigne la base réelle `cbigestionnairepfe`. Lancé tel quel, le Copilot répondra sur la base réelle, pas sur la démo.
- **Bloquant 3 — tâches planifiées** : elles sont activées, et les 80 projets remplissent les conditions d'une relance automatique quotidienne. La base de démo se modifierait pendant la présentation. C'est déjà arrivé : 300 notifications ont été créées le 10/10.
- **Bloquant 4 — relances de projet** : `lastRelanceAt` est vide sur les 80 projets. Le Copilot répondra « jamais relancé » pour tous.
- **Écarts Copilot / Power BI** : six écarts viennent de définitions différentes (date de création contre date de démarrage, créateur contre commercial affecté, date du jour contre date de référence figée), pas d'erreurs de données. Ils sont chiffrés en section 7.

Bilan : 19 anomalies confirmées, 11 points ambigus, 5 familles de données synthétiques. Détail dans [anomalies.csv](anomalies.csv) ; requêtes de contrôle dans [validation-queries.sql](validation-queries.sql).

Rien n'a été modifié : ni la base de démo, ni la base réelle, ni le `.env`, ni les migrations, ni le code. Les seuls fichiers créés sont les trois livrables de ce dossier.

## 2. Périmètre et méthode

| Point | Ce qui a été fait |
|---|---|
| Base interrogée | `cbigestionnairepfe_demo` sur `127.0.0.1:5432`, vérifiée par `SELECT current_database()` avant chaque série de requêtes |
| Lecture seule | Session ouverte avec `default_transaction_read_only = on`, chaque requête dans `BEGIN READ ONLY … ROLLBACK` ; une écriture aurait été refusée par PostgreSQL |
| Base réelle | Jamais connectée |
| `.env` | Lu pour les noms de variables et quatre valeurs non secrètes (nom de base, hôte, deux indicateurs) ; aucun secret affiché ; fichier non modifié |
| Règles métier | Prises uniquement dans le code et le schéma : `plan.js` du générateur, `ficheRules.js`, validateurs, services, contraintes et types ENUM de la base. Aucune règle ajoutée |
| Copilot | Lecture du code des 85 outils et des services qu'ils appellent |
| Power BI | Lecture des fichiers TMDL de `PFE_CRM_BI_DEMO` (20 tables sources, relations, 125 mesures) |

**Non vérifié** : le Copilot n'a pas été lancé et l'API n'a pas été appelée ; Power BI Desktop n'a pas été ouvert ni actualisé. Les écarts annoncés en section 7 sont déduits du code et des définitions DAX, puis chiffrés en SQL ; ils restent à constater en conditions réelles.

## 3. Relations (objectif 1)

Toutes les relations tiennent.

| Relation | Résultat |
|---|---|
| Projet → propriétaire, étape, société, ingénieur, architecte | 0 orphelin ; noms dénormalisés (`entreprise`, `ingenieurResponsable`, `architecte`) identiques au référentiel |
| `user_projects` → projet et propriétaire | 80 lignes « owner », toutes égales à `projects.ownerId` |
| Action → projet, type, créateur | 0 orphelin ; `typeAction_legacy` égal au nom du type ; créateur = propriétaire du projet |
| Contact → créateur, commercial affecté, société | 0 orphelin ; tout commercial affecté a le rôle `commercial` ; 22 contacts non affectés (voulu) |
| Relance → contact, commercial | 0 orpheline ; commercial de la relance = commercial du contact |
| Fiche de production → machine du bon type | 0 écart |
| Lignes automatiques d'un contact | 1 historique, 1 produit, 1 action par contact, sans exception |

Deux réserves :

- **`clients` est une table isolée.** Les 60 clients n'ont aucun lien avec `companies`, `projects` ou `commercial_contacts` : ni clé étrangère, ni nom en commun. Dans le code du Copilot, « client » désigne une société (`companies`).
- **Clés étrangères absentes en base** sur `projects.companyId`, `engineerId`, `architectId` et `project_actions.createdBy`. Les données sont cohérentes aujourd'hui, mais rien ne l'impose.

Référentiels peu utilisés : 6 sociétés, 4 ingénieurs et 1 architecte sans projet ; 12 types d'action sur 20 jamais utilisés.

## 4. Doublons, références, dates, statuts, valeurs (objectif 2)

| Contrôle | Résultat |
|---|---|
| Doublons sur e-mail, nom de société, d'ingénieur, d'architecte, de client, projet par propriétaire, téléphone de contact, relance, fiche de déchets | 0 |
| Doublons d'actions (même projet, même type, même instant) | **7 groupes, 16 lignes** |
| Statuts hors liste | 0 ; les 13 valeurs de `projects.statut` appartiennent toutes aux listes `PROJECT_STATUSES` ou `REVENDEUR_STATUSES` |
| Valeurs numériques impossibles (montant ≤ 0, pourcentage hors 0–100, production ≤ 0, kg négatif, rejet > production) | 0 sur 13 contrôles |
| Dates inversées (démarrage avant prospection, relance avant action, action avant création du projet, relance avant contact) | 0 |
| Dates dans le futur | 0 action, 0 fiche ; 10 dates de démarrage de projet (jusqu'au 25/11/2026), plausibles |

Incohérences confirmées :

- **Statut contre étape, sur les revendeurs.** Le générateur tire le statut revendeur et l'étape séparément. Quatre contradictions : étape Won avec statut « Prospect », Lost avec « Offre », Negotiation et Plan technique avec « Raté ». Conséquence : 14 projets gagnés par étape ou par action, 13 par statut ; 5 perdus contre 4.
- **Actions après clôture.** 7 actions sont datées après l'action « Commande gagnée » ou « Commande perdue » de leur projet, et 20 actions restent ouvertes sur des projets gagnés (18) ou perdus (2).
- **Actions écrêtées.** 16 actions portent exactement le 30/09/2026 à 00:00 UTC, soit 01:00 à Tunis : le générateur ramène à la fin de période toute date qui la dépasse. C'est l'origine de 4 des 7 groupes de doublons.
- **Adresses périmées.** Après le renommage des comptes, les 100 relances et les 20 fiches de déchets gardent l'ancienne adresse en `@demo.invalid`.

## 5. Analyses temporelles (objectif 3)

**La série tient sur six mois pleins, d'avril à septembre 2026, sans mois vide.**

| Mois | Projets créés | Actions | Contacts créés | Relances (date de relance) | Fiches PROMESH | Fiches PROBAR |
|---|---|---|---|---|---|---|
| 2026-04 | 12 | 18 | 20 | 6 | 10 | 6 |
| 2026-05 | 22 | 51 | 29 | 12 | 15 | 11 |
| 2026-06 | 12 | 58 | 29 | 13 | 15 | 11 |
| 2026-07 | 13 | 55 | 29 | 18 | 21 | 11 |
| 2026-08 | 16 | 58 | 30 | 24 | 16 | 13 |
| 2026-09 | 5 | 58 | 13 | 27 | 13 | 18 |
| 2026-10 | 0 | 2 | 0 | 0 | 0 | 0 |

Quatre limites pèsent sur les analyses dans le temps :

1. **Rien après le 30/09.** Tout indicateur du CRM calculé sur la date du jour (« ce mois », « aujourd'hui ») vaut 0. La fenêtre « 6 derniers mois » du tableau de bord exclut déjà 5 projets et en exclura davantage chaque jour.
2. **Aucune relance à venir.** Les 27 relances planifiées de contact sont toutes échues ; 3 dates de relance d'action tombent après le 12/10.
3. **Aucun historique d'évolution.** Projets, actions et contacts ont tous `updatedAt = createdAt` ; chaque contact a une seule ligne d'historique (sa création). On ne peut pas reconstituer le passage d'une étape à l'autre, ni une durée par étape. Le seul délai mesurable est création → clôture : 40,8 jours en moyenne pour les gagnés, 35,0 pour les perdus.
4. **Dates techniques de production au jour de l'injection.** `createdAt`, `updatedAt` et `validatedAt` des fiches valent le 10/10/2026. Seules `dateProduction` et `dateFiche` sont exploitables.

Les fiches de déchets ont une échéance propre : toutes « en cours », clôture au 16/10/2026. **À partir du 17/10, le service les passera à « clôturée » à la première consultation**, ce qui modifiera la base de démo et fera passer l'indicateur Power BI de 20 à 0.

## 6. Données industrielles (objectif 4)

Contrôles limités aux règles écrites dans le code et le schéma.

| Règle | Source | Résultat |
|---|---|---|
| Fiche validée ⇔ verrouillée ; validée ⇒ date de validation | `porPromesh.service.js` | 0 écart sur 90 |
| Heure de fin ≠ heure de début ; fin avant début admise pour le poste de nuit seulement | `ficheRules.js` | 0 écart |
| Date de production non future | `ficheRules.js` | 0 écart |
| Quantités ≥ 0 ; rejet ≤ production | contraintes CHECK | 0 écart |
| Machine du type de la fiche | clé étrangère et contrôle du générateur | 0 écart sur 180 |
| Une fiche de déchets par module, machine, ligne, poste et date | contrainte existante | 0 doublon |
| Diamètre valable pour la famille ; diamètre sans famille interdit ; famille réservée au modèle « project » | `docs/product-family-diameter.md`, `validatePayload` | 0 écart, mais le diamètre n'est renseigné sur aucun projet |
| Non-conformité PROMESH ⇒ description | pas de règle (champ facultatif) | 7 non conformes, toutes décrites ; aucune n'a d'action corrective |

Points à connaître :

- **Toutes les fiches sont en `dataStatus = TEST`** (160 de production, 20 de déchets). Aucun service du CRM ne filtre sur ce champ : elles apparaissent normalement.
- **Colonnes récentes vides** : `productId`, `operatorUserId`, `quantitePrevue`, `quantiteRejetee` sur les 160 fiches ; `numeroFiche`, `heureDebut`, `heureFin` sur les 70 fiches PROBAR. La table `products` est vide. Aucune analyse par produit, par écart prévu / réalisé ou par taux de rejet n'est possible.
- **Horaires de poste simulés** : `ficheRules.js` indique qu'aucun horaire de poste n'existe dans le code. Toutes les fiches d'un même poste ont les mêmes heures.
- **Unité PROBAR non définie** : `quantiteProduite` n'a pas d'unité dans le CRM ; la vue `production_fiches_v` renvoie une unité vide pour PROBAR.

## 7. Compatibilité API, Copilot et Power BI (objectif 5)

### 7.1 Ce qui empêche la démonstration

| Sujet | Constat | Conséquence |
|---|---|---|
| Base visée par le backend | `DB_NAME` et `DATABASE_URL` du `.env` = `cbigestionnairepfe` | Le Copilot interroge la base réelle |
| Tâches planifiées | `AUTO_EMAIL_JOBS_ENABLED=true` ; 80 projets sur 80 ont un champ jugé manquant par `projectCron` | Relances, notifications et écritures automatiques dans la démo, chaque jour à 08:00 et chaque minute pour `followup.job` |
| Connexion | 9 comptes sur 10 sans empreinte bcrypt | Pas de démonstration par rôle ; les outils industriels exigent admin ou responsable production |
| `lastRelanceAt` | Vide sur 80 projets | « Projets non relancés depuis N jours » renvoie tout le portefeuille |

### 7.2 Écarts de définition entre le Copilot et Power BI

Ces écarts ne sont pas des erreurs : la même question a deux réponses selon la définition. Chaque ligne renvoie à la requête qui donne les deux valeurs.

| Question | Copilot / CRM | Power BI | Requête |
|---|---|---|---|
| Projets par mois | date de création : 12, 22, 12, 13, 16, 5 | date de démarrage : 1, 2, 15, 21, 19, 8, puis 9 en octobre et 5 en novembre | C01 |
| Relances de contact par mois | date de création de la ligne : 11, 16, 18, 19, 24, 12 | date de relance : 6, 12, 13, 18, 24, 27 | C02 |
| Contacts d'un commercial | contacts qu'il a créés : 5 à 10 | contacts qui lui sont affectés : 16 à 24 | C03 |
| Relances en retard / à venir | date du jour : 27 en retard, 0 à venir | date figée au 30/09 : 25 en retard, 2 à venir | K08, K09 |
| Projets gagnés | 13 par statut ; 14 par étape | 14 par action, 14 par étape ; 13 dans un visuel par statut | K06 |
| Production | deux outils séparés : PROBAR (70 fiches) et PROMESH (90) | une vue réunie : 160 fiches | C06 |

### 7.3 Autres points

- **Tableau de bord IA industriel** : l'analyseur exige par défaut les champs `reference` et `quantity`, absents des fiches. S'il tourne avec ses réglages par défaut, les 70 fiches seront signalées incomplètes. À tester.
- **Étapes en anglais, statuts en français** : l'analyseur de projets reconnaît une étape finale par des mots-clés français ; « Won » peut ne pas être reconnu.
- **Tables Power BI vides** : `project_devis`, `project_bon_de_commande`, `project_activities`, `project_members`, `commercial_contact_reminders` sont chargées mais sans ligne.
- **Clients sous filtre de période** : toutes les dates `creeLe` sont antérieures à avril 2026 ; `[Nombre Clients]` vaut 0 dès qu'une période du lot est sélectionnée.
- **Chiffre gagné** : 374 000, porté par un seul projet revendeur dont le statut est « Prospect ».
- **Historique, RAG et outils du Copilot** : aucune table ni fichier du Copilot n'a été touché ni modifié.

## 8. Valeurs de référence pour comparer le Copilot et les KPI (objectif 6)

[validation-queries.sql](validation-queries.sql) contient 48 requêtes, toutes exécutées sans erreur le 12/10/2026 :

- `V00` : garde-fou sur le nom de la base ;
- `A01` à `A24` : contrôles d'intégrité, avec la valeur attendue en commentaire ;
- `K01` à `K17` : valeurs de référence des indicateurs, avec l'outil du Copilot et la mesure Power BI correspondants ;
- `C01` à `C06` : écarts de définition, les deux valeurs côte à côte.

Valeurs relevées :

| Indicateur | Valeur | Requête |
|---|---|---|
| Projets (tous actifs, aucun archivé) | 80 : 61 « project », 15 revendeurs, 4 applicateurs | K01 |
| Projets gagnés / perdus | 14 / 5 par étape et par action ; 13 / 4 par statut | K06 |
| Taux de conversion | 17,5 % (14 sur 80) | K06 |
| Montant total / montant gagné | 4 252 500 / 374 000 | K02 |
| Projets par famille | PROBAR 43, PROMESH 18, sans famille 19 | K05 |
| Actions de projet | 300 : Terminé 197, A faire 60, En cours 30, Annulé 13 | K07 |
| Actions avec date de relance | 109 | K07 |
| Contacts | 150, dont 22 non affectés et 79 sans relance | K10 |
| Contacts par statut | ok 69, à rappeler 31, injoignable 27, refus 23 | K10 |
| Relances de contact | 100 : faite 63, planifiée 27, annulée 10 | K08 |
| Fiches de production | 160 : PROMESH 90 (61 validées), PROBAR 70 (54 validées) | K12 |
| Production | PROMESH 125 600 m² ; PROBAR 100 140 | K12 |
| Fiches non conformes | 13 (PROMESH 7, PROBAR 6), soit 8,1 % | K12 |
| Déchets | 20 fiches, 54 lignes, 1 781,7 kg dont 545,8 kg de produit fini | K15 |
| Machines | 9, toutes actives (5 PROBAR, 4 PROMESH) | K13 |
| Clients | 60, aucun créé pendant la période du lot | K17 |

Pour comparer : poser la question au Copilot avec des dates explicites (« entre le 1er avril et le 30 septembre 2026 »), puis lire la requête `K` ou `C` correspondante.

## 9. Synthétique, ambigu, confirmé (objectif 7)

### 9.1 Données synthétiques — fictives par construction, à annoncer

| Famille | Contenu |
|---|---|
| Identités | Noms préfixés DEMO, e-mails en `@demo.invalid` ou `@cbi_tunisia.com` (domaine invalide), téléphones en `+216 00`, matricules `DEMO-MF-…` |
| Projets | Montants tirés entre 15 500 et 408 000 ; probabilité de réussite constante par étape ; priorité et validation identiques partout |
| Actions et relances | Statuts répartis par tirage pondéré ; le taux de réalisation est un paramètre du générateur |
| Production | Quantités, horaires de poste, opérateurs et taux de non-conformité (tirage à 12 %) simulés |
| Lacunes | `diameterMm` et `surfaceProspectee` jamais renseignés ; produits, devis, bons de commande, activités, maintenance et RH vides |

Tout le lot est tracé : 2 182 lignes au registre `data_change_log`, lot `DEMO-demo-powerbi-v1-s20261010`.

### 9.2 Données ambiguës — aucune règle du code ne tranche

| Id | Sujet | Volume |
|---|---|---|
| A-01 | Contact « Gagné » avec statut d'appel « client refuse » ou « injoignable » ; étape avancée sans appel ni commercial | 35 |
| A-02 | Type d'action sans rapport avec l'étape (devis envoyé sur un prospect) | 23 sur l'étape Prospect |
| A-03 | Étapes en anglais, types d'action en double langue | référentiel |
| A-04 | Contact rattaché à son créateur ou à son commercial affecté | 150 |
| A-05 | Relance créée à la date du contact | 100 |
| A-06 | Démarrage de projet après la date de référence | 14 |
| A-07 | Fiche validée malgré une non-conformité ; non-conformité sans action corrective | 10 |
| A-08 | Deux fiches pour une même machine, un même jour, un même poste | 16 |
| A-09 | Compte `issam@gmail.com`, superadmin2, hors lot | 1 |
| A-10 | Coordonnées sans rapport avec la région de l'adresse | 61 |
| A-11 | `pipelineStage_legacy` à « Prospect » partout | 80 |

### 9.3 Anomalies confirmées

| Id | Priorité | Anomalie | Lignes |
|---|---|---|---|
| C-01 | P1 | Mot de passe non bcrypt : connexion impossible | 9 comptes |
| C-02 | P1 | `.env` dirigé vers la base réelle | configuration |
| C-03 | P1 | Tâches planifiées actives sur des projets tous « incomplets » | 80 |
| C-04 | P1 | `lastRelanceAt` et `nextRelanceDate` vides | 80 |
| C-05 | P2 | Notifications créées après l'injection, hors registre | 300 |
| C-06 | P2 | Adresse du commercial périmée dans les relances | 100 |
| C-08 | P2 | Statut revendeur contraire à l'étape | 4 |
| C-09 | P2 | Chiffre gagné porté par un seul projet incohérent | 1 |
| C-10 | P2 | Actions après clôture ou ouvertes sur projet clos | 27 |
| C-11 | P2 | Doublons d'actions et dates écrêtées | 16 |
| C-12 | P2 | Aucune relance planifiée à venir | 27 |
| C-13 | P2 | Données arrêtées au 30/09 face à des indicateurs en date du jour | lot entier |
| C-15 | P2 | Fiches de déchets qui se clôturent à la lecture après le 16/10 | 20 |
| C-07 | P3 | Opérateur des fiches de déchets sur une ancienne adresse | 20 |
| C-14 | P3 | Dates de validation et de création des fiches = jour de l'injection | 160 |
| C-16 | P3 | Colonnes de production jamais renseignées | 160 |
| C-17 | P3 | Clients isolés et antérieurs à la période | 60 |
| C-19 | P3 | Analyseur industriel du Copilot réglé sur des champs absents | 70 |
| C-18 | P4 | 417 contraintes UNIQUE en double sur `users.email` ; clés étrangères absentes | schéma |

## 10. Plan de correction

**Aucune correction n'est appliquée.** Chaque étape attend votre autorisation explicite. Toute écriture se ferait dans `cbigestionnairepfe_demo` uniquement, après une sauvegarde, avec vérification de `current_database()`, et serait inscrite au registre sous un nouvel identifiant de lot.

### Priorité 1 — sans quoi la démonstration ne fonctionne pas

| # | Correction | Nature | Effet sur le Copilot | Effet sur Power BI |
|---|---|---|---|---|
| 1 | Lancer le backend de démo avec des variables de processus pointant sur `cbigestionnairepfe_demo` et `AUTO_EMAIL_JOBS_ENABLED=false`, sans modifier le `.env` (C-02, C-03) | Configuration de lancement, aucune donnée | Le Copilot répond sur la démo ; la base ne bouge plus pendant la présentation | Les chiffres restent stables entre deux actualisations |
| 2 | Donner une empreinte bcrypt aux 9 comptes (C-01) | 9 lignes, colonne `passwordHash` | Connexion par rôle possible : admin, sédentaire, production | Aucun |
| 3 | Renseigner `lastRelanceAt` (date de la dernière action) et `nextRelanceDate` (prochaine date de relance d'une action ouverte) (C-04) | 80 lignes, 2 colonnes | Réponses justes sur les projets à relancer ; statut de relance du Kanban correct | Aucun |

### Priorité 2 — sans quoi le Copilot et Power BI se contredisent

| # | Correction | Nature | Effet sur le Copilot | Effet sur Power BI |
|---|---|---|---|---|
| 4 | Aligner l'étape des 4 revendeurs contradictoires sur leur statut (C-08, C-09) — **choix à faire** : garder l'étape ou garder le statut | 4 lignes | Gagnés et perdus identiques quelle que soit la question | `[Projets Gagnés]` égal au visuel par statut ; l'écart de contrôle reste à 0 seulement si l'action de clôture suit |
| 5 | Clore les 20 actions ouvertes des projets gagnés ou perdus ; traiter les 7 actions postérieures à la clôture (C-10) | 27 lignes | Plus d'action « à faire » sur un projet gagné | `[Relances En Retard]` et `[Projets Sans Activité Récente]` plus crédibles |
| 6 | Décaler une partie des relances planifiées après la date de soutenance (C-12) — **date de soutenance nécessaire** | jusqu'à 27 lignes | « Mes relances à venir » non vide | `[Relances À Venir]` non nul si `[Date Référence]` suit |
| 7 | Réaligner `commercialEmail` des relances sur l'adresse actuelle (C-06) | 100 lignes | Adresse citée cohérente avec le compte | Cohérence si la colonne est affichée |
| 8 | Supprimer les 300 notifications parasites (C-05) — **suppression : accord explicite requis** | 300 lignes | Liste de notifications lisible | Aucun |
| 9 | Dédoublonner ou décaler les 16 actions écrêtées (C-11) | 16 lignes | Listes d'actions sans répétition | Pic du 30/09 lissé |

Sans correction de données, deux points se règlent par le scénario : poser des dates explicites au Copilot (C-13), et tenir compte de l'échéance du 16/10 pour les fiches de déchets (C-15).

### Priorité 3 — confort et crédibilité

| # | Correction | Effet |
|---|---|---|
| 10 | Réaligner l'opérateur des 20 fiches de déchets (C-07) | Libellé cohérent avec les comptes |
| 11 | Tester l'analyseur industriel du Copilot en démonstration (C-19) ; correction de code seulement sur demande | Évite une fausse alerte « fiches incomplètes » |
| 12 | Présenter les clients hors filtre de date, ou décaler `creeLe` (C-17) | `[Nombre Clients]` non nul sur la période |
| 13 | Retirer des visuels les colonnes de production vides (C-16) et les 5 tables vides | Pas de visuel blanc |

### À ne pas corriger

- Les dates de validation des fiches (C-14) : c'est le service du CRM qui les pose.
- Le schéma (C-18) : les migrations sont hors périmètre.
- Les points ambigus A-01, A-02, A-07, A-08 : aucune règle métier dans le code ne permet de dire ce qui serait juste.
- Les données manquantes (produits, diamètres, devis, maintenance) : les créer reviendrait à inventer des références.

## 11. Décisions attendues

1. **Date de la soutenance** : elle conditionne les corrections 6 et l'échéance du 16/10 sur les fiches de déchets.
2. **Compte `issam@gmail.com`** : voulu pour la démonstration, ou à écarter ?
3. **Revendeurs contradictoires** : faut-il garder l'étape ou le statut ?
4. **Notifications** : suppression autorisée ou non ?
5. **Corrections à lancer** : lesquelles, parmi les numéros 1 à 13.
