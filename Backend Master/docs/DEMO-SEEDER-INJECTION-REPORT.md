# Injection du lot de démonstration — rapport final

Exécutée le 10/10/2026 dans `cbigestionnairepfe_demo` uniquement.

**Résultat : 2 182 lignes créées sur 2 182 prévues, 9 étapes sur 9, 41 contrôles d'étape et 58 contrôles finaux conformes, aucun écart de comptage. La base réelle est strictement inchangée.**

Rien n'est déployé. Power BI n'est pas connecté.

## 1. Vérifications faites avant de lancer

| Point | Vérification | Résultat |
|---|---|---|
| Sauvegarde restaurable | `cbigestionnairepfe_demo_20261010_180413.dump` restaurée dans une base d'essai : 197 tables, 2 vues, 1 429 contraintes, mêmes référentiels que la base de démonstration ; empreinte SHA-256 conforme ; base d'essai supprimée ensuite | conforme |
| Tests | 47 tests sur 47 réussis (les 43 annoncés, plus 4 ajoutés pour le point « aucun effet externe ») | conforme |
| Plan | lot `DEMO-demo-powerbi-v1-s20261010`, graine 20261010, empreinte `44e1af420ea7e531`, 2 182 lignes, 0 violation | identique à la simulation validée |
| `current_database()` | contrôlé au chargement, avant chaque étape et dans chaque transaction d'écriture | `cbigestionnairepfe_demo` |
| Aucun effet externe | voir ci-dessous | garanti |

**Garantie « aucun envoi, notification, tâche planifiée ni effet externe »**, établie de trois façons :

1. **Lecture du code.** Les services appelés (`createPorPromesh`, `validatePorPromesh`, `saveFiche`, `updateRecord`) ne contiennent aucun appel d'envoi. Dans `createRecord`, la notification, l'historique et l'e-mail sont tous sous la condition « module maintenance » ; le générateur ne crée que des fiches `probar`.
2. **Mouchard réseau dans les tests.** Toutes les connexions ouvertes par le processus pendant le chargement du CRM, une injection complète et une suppression sont enregistrées : elles vont toutes vers `127.0.0.1`, sur le port de PostgreSQL ou sur le port 1.
3. **Constat en base.** Après l'injection : 0 notification, 0 e-mail en file, 0 événement d'agenda, 0 synchronisation de calendrier. Aucune tâche planifiée n'est programmée, et `src/app.js` n'est jamais chargé.

Le seul bruit est une tentative de vérification SMTP faite par le module d'e-mail à son chargement. Elle est dirigée vers `127.0.0.1:1` et refusée : rien ne sort de la machine.

## 2. Déroulement

| Étape | Lignes prévues | Créées | Déjà présentes | Contrôles |
|---|---|---|---|---|
| Utilisateurs | 20 | 20 | 0 | 4 / 4 |
| Référentiels commerciaux | 135 | 135 | 0 | 8 / 8 |
| Projets | 160 | 160 | 0 | 4 / 4 |
| Actions de projet | 300 | 300 | 0 | 2 / 2 |
| Contacts et lignes automatiques | 693 | 693 | 0 | 10 / 10 |
| Relances | 100 | 100 | 0 | 2 / 2 |
| Fiches PROMESH | 90 | 90 | 0 | 5 / 5 |
| Fiches PROBAR | 70 | 70 | 0 | 3 / 3 |
| Fiches de déchets | 20 | 20 | 0 | 3 / 3 |

Les 1 588 lignes ci-dessus sont celles que le générateur crée lui-même ; les services de production en ont créé 594 de plus (contrôles qualité, paramètres du poste, lignes de déchets), soit 2 182.

Aucun arrêt, aucune erreur, aucune suppression ni réinjection.

## 3. Volumes réels par table

| Table | Prévues | En base | Au registre |
|---|---|---|---|
| `users` | 10 | 10 | 10 |
| `user_profiles` | 10 | 10 | 10 |
| `companies` | 40 | 40 | 40 |
| `engineers` | 25 | 25 | 25 |
| `architects` | 10 | 10 | 10 |
| `clients` | 60 | 60 | 60 |
| `projects` | 80 | 80 | 80 |
| `user_projects` | 80 | 80 | 80 |
| `project_actions` | 300 | 300 | 300 |
| `commercial_contacts` | 150 | 150 | 150 |
| `commercial_contact_status_histories` | 150 | 150 | 150 |
| `commercial_contact_products` | 150 | 150 | 150 |
| `commercial_contact_actions` | 150 | 150 | 150 |
| `commercial_projects` | 93 | 93 | 93 |
| `commercial_contact_relances` | 100 | 100 | 100 |
| `por_promesh` | 90 | 90 | 90 |
| `por_promesh_controles_qualite` | 180 | 180 | 180 |
| `por_promesh_process_control` | 360 | 360 | 360 |
| `industrial_records` (PROBAR) | 70 | 70 | 70 |
| `recuperable_fiches` | 20 | 20 | 20 |
| `recuperable_lignes` | 54 | 54 | 54 |
| **Total** | **2 182** | **2 182** | **2 182** |

Référentiels intacts : 9 machines, 10 étapes, 20 types d'action, 2 familles.

## 4. Relations, doublons, statuts

Contrôle final : 58 points conformes sur 58.

- **Relations** : aucun projet sans propriétaire ou sans étape ; aucune société, aucun ingénieur ni architecte inconnu ; aucune action sans projet ou sans type ; aucun contact sans créateur ni affecté à un non-commercial ; aucune relance sans contact ; aucune fiche sans machine du bon type.
- **Doublons** : aucun sur les adresses e-mail, les noms de projet par propriétaire, les noms de société, d'ingénieur ou d'architecte, ni au registre.
- **Lignes hors registre** : aucune dans les tables du lot.
- **Fiches multiples** : 8 couples machine / date / poste portent plusieurs fiches. C'est voulu : fonctionnement métier valide, aucune règle d'unicité.

### Statut `TEST`

| Table | `dataStatus` | Statut | Fiches |
|---|---|---|---|
| `por_promesh` | TEST | VALIDE | 61 |
| `por_promesh` | TEST | BROUILLON | 29 |
| `industrial_records` | TEST | validee | 54 |
| `industrial_records` | TEST | enregistree | 16 |
| `recuperable_fiches` | TEST | en_cours | 20 |

**Les 180 fiches de production sont toutes `TEST`.** Aucune n'est `REAL`.

Les tables commerciales n'ont pas de `dataStatus` : leur isolation tient à la base séparée et au registre du lot.

### Répartition obtenue

- Projets par étape : Prospect 22, Contacté 9, Site Visit 3, Plan technique 6, Echantillonnage 4, Quote Sent 9, Negotiation 7, Won 14, Lost 5, Loyalty 1.
- Projets par modèle : project 61, revendeur 15, applicateur 4. Montant posé sur les 19 revendeurs et applicateurs seulement (15 500 à 408 000), aucun sur un modèle « project ».
- Actions : Terminé 197, A faire 60, En cours 30, Annulé 13.
- Relances : faite 63, planifiée 27, annulée 10.
- Fiches par machine : de 9 à 26, sur les 9 machines.

## 5. Comptes créés

| Rôle | Comptes | Actifs |
|---|---|---|
| `commercial` | 6 | 6 |
| `commercial_sedentaire` | 2 | 2 |
| `responsable_logistique_achat` | 1 | 1 |
| `admin` | 1 | 1 |

- Rôles existants uniquement ; les 10 adresses sont en `@demo.invalid`.
- 10 empreintes bcrypt, toutes différentes.
- Les mots de passe temporaires ont été tirés au hasard et jetés aussitôt chiffrés : ils n'apparaissent ni dans les traces, ni dans ce rapport, ni au registre. **Personne ne peut donc se connecter avec ces comptes** sans passer par une réinitialisation.

## 6. Registre du lot

| | |
|---|---|
| `batch_id` | `DEMO-demo-powerbi-v1-s20261010` |
| Lignes au registre | 2 182, opération `INSERT`, auteur `DEMO_SEEDER` |
| Tables couvertes | 21 |
| Mention de provenance | « SIMULATION — … » sur les 2 182 lignes du registre, les 90 fiches PROMESH, les 70 fiches PROBAR et les 80 projets |
| Échecs journalisés | 0 |
| Traçabilité des suppressions | opération `DELETE` ajoutée à la contrainte du journal **de la base de démonstration seulement** ; celle de la base réelle est inchangée |

Chaque ligne créée se retrouve par `SELECT … FROM data_change_log WHERE batch_id = 'DEMO-demo-powerbi-v1-s20261010'`.

## 7. Deuxième exécution

Simulée en lecture seule juste après l'injection : **0 ligne à créer, 2 182 reconnues comme déjà présentes**, 0 violation. Une seconde exécution ne créerait aucune ligne.

## 8. Base réelle : état avant / après

Relevé pris juste avant l'injection, repris juste après.

| Contrôle | Résultat |
|---|---|
| Nombre de lignes des 196 tables (hors `notifications`) | identique |
| Empreinte de contenu de 16 tables (utilisateurs, projets, contacts, sociétés, ingénieurs, actions, fiches PROMESH et PROBAR, déchets, maintenance, RH, machines, journal, étapes, types d'action, familles) | identique |
| Schéma complet | identique |
| Journal `data_change_log` | 2 927 lignes, contenu identique, contrainte inchangée (pas de `DELETE`) |
| Fiches PROMESH 138 et 139 | contenu identique, toujours BROUILLON / VALIDE et `REAL` |
| `.env` | identique (même empreinte, date du 10/10 à 18 h 37) |

`notifications` est exclue : une tâche planifiée du CRM y écrit en continu, indépendamment de ce travail.

## 9. Écarts et points à connaître

Aucun écart de comptage, de relation ou de statut. Cinq caractéristiques des données qui pèseront sur les tableaux de bord :

1. **Date de validation des fiches = date de l'injection.** Les 61 fiches PROMESH validées portent une production d'avril à septembre mais un `validatedAt` au 10/10/2026 : c'est le service du CRM qui pose cette date. Un indicateur « délai de validation » serait faux.
2. **Date de modification des fiches de production = date de l'injection**, pour la même raison. Les lignes commerciales, elles, gardent les dates du plan (avril à septembre).
3. **Les 20 fiches de déchets sont toutes « en cours »**, avec une clôture au 16/10/2026 : le service ouvre une fenêtre de 6 jours à partir de la création. Leur opérateur est l'adresse du compte de démonstration.
4. **Répartition par étape inégale** : 1 seul projet en « Loyalty », 3 en « Site Visit ». C'est l'effet du tirage sur 80 projets.
5. **Horaires de poste simulés** (06:00 → 14:00, 22:00 → 06:00) : toutes les fiches d'un même poste ont les mêmes heures. Ils sont déclarés fictifs dans la configuration et chaque fiche porte la mention de provenance.

Autres points :
- la simulation relancée après l'injection a remplacé le fichier `dry-run-demo-powerbi-v1.json` ; l'empreinte du plan y est la même ;
- la base jetable `cbigestionnairepfe_demo_test` et la copie `cbigestionnairepfe_mig_test` existent toujours sur le serveur.

## 10. Sauvegardes et retour arrière

| Sauvegarde | Contenu |
|---|---|
| `backups/cbigestionnairepfe_demo_20261010_180413.dump` | base de démonstration avant injection (restauration testée) |
| `backups/cbigestionnairepfe_demo_20261010_182339.dump` | base de démonstration après injection |

Retour arrière, **non exécuté** :

```
node scripts/demo-seeder/index.js --delete-batch=DEMO-demo-powerbi-v1-s20261010 --simulate   # montre ce qui partirait
node scripts/demo-seeder/index.js --delete-batch=DEMO-demo-powerbi-v1-s20261010              # supprime les 2 182 lignes du registre
```

La suppression est refusée si une ligne hors du lot dépend d'une ligne du lot. Autre voie : restaurer la sauvegarde d'avant injection.

## 11. Commandes

```
node scripts/demo-seeder/index.js --dry-run    # simulation, lecture seule
node scripts/demo-seeder/index.js --verify     # contrôle après injection, lecture seule
npx jest test/demoSeeder                       # 47 tests, sur une base jetable
```
