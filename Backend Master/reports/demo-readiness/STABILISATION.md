# Stabilisation avant soutenance — 12/10/2026

Chaque correction ci-dessous a été vérifiée en conditions réelles, sauf mention contraire.

## 1. Journaux exposant des jetons — corrigé

| Fichier | Ce qui était écrit dans la console | Maintenant |
|---|---|---|
| `Dash Master Toolkit/lib/providers/api_client.dart` | Tous les en-têtes de chaque requête (dont `Authorization: Bearer …` complet), tous les corps de requête (dont le mot de passe à la connexion) et toutes les réponses (dont les jetons d'accès et de rafraîchissement) | En-têtes et corps masqués clé par clé ; pour `/auth/…`, seuls les noms de champs sont listés |
| `lib/dashboard/academic/view/dashboard_screen.dart` | Les 30 premiers caractères du jeton, deux fois | « présent » ou « absent » |
| `lib/route/my_route.dart`, `lib/services/user_api.dart` (2), `lib/services/client_service.dart`, `lib/providers/archive_request_provider.dart` | Le jeton complet | « présent » ou « absent » |
| `lib/providers/auth_service.dart` | Le corps de la vérification MFA et le code à usage unique | Noms de champs, type et longueur du code |
| `Backend Master/src/services/mfa.service.js` | Le code à usage unique en clair et son empreinte, hors production | Masqués, sauf demande explicite `MFA_DIAG_SHOW_OTP=true` |

Aucun mécanisme d'authentification n'est modifié : seules des lignes de journalisation changent. Le journal de l'API côté Flutter n'était actif qu'en mode débogage ; les six autres lignes s'exécutaient aussi dans la version compilée.

Vérification : `test/api_client_log_redaction_test.dart` (9 tests) contrôle le masquage et parcourt tout `lib/` à la recherche d'un journal qui interpole un jeton. Le journal du backend lancé pour les essais (417 lignes) ne contient aucun jeton, aucun en-tête `Bearer`, aucun mot de passe.

Restent à traiter, hors périmètre « jetons » : deux fichiers contiennent un mot de passe en clair dans le code (`src/scripts/bootstrapSuperadmin2.js`, `check-demo-login.js`), et `src/seeders/superadmin-cbi.seeder.js` affiche un mot de passe temporaire.

## 2. Routage de « Quels projets nécessitent une relance ? » — corrigé

Cause : la question est d'abord routée vers `projects`, puis `commercialRelanceOverride.js` la basculait vers les contacts dès que le mot « relance » apparaissait. Cette bascule avait été écrite pour « mes clients en retard de relance ».

| Fichier | Changement |
|---|---|
| `src/ai/orchestrator/commercialRelanceOverride.js` | La bascule n'a plus lieu quand la question nomme un projet et ne nomme ni client, ni contact, ni prospect |
| `src/ai/orchestrator/entityExtractor.js` | « nécessitent une relance », « à relancer », « dois-je relancer » activent le filtre « sans relance depuis 30 jours », pour une question sur des projets uniquement |
| `test/ai.orchestrator.projectRelanceRouting.test.js` (nouveau) | 22 tests |

| | Agent | Outil | Réponse |
|---|---|---|---|
| Avant (instance sur le port 4000) | `commercial_agent` | `get_my_commercial_contacts` | 5 contacts à rappeler |
| Après (instance sur le port 4001) | `project_agent` | `list_projects`, périmètre de l'utilisateur | 14 projets sans relance depuis plus de 30 jours |

Non-régression vérifiée sur la même instance : « Quels clients dois-je relancer cette semaine ? » et « Quels sont mes clients en retard de relance ? » restent sur les contacts.

Limite : « Quels chantiers nécessitent une relance ? » part toujours vers les contacts ; le mot « chantier » n'est pas un mot-clé de l'intention projets.

## 3. « Projets critiques : 29 » pour 14 projets — analysé, puis corrigé

**Définition métier** (`src/ai/reasoning/projectAttentionAnalyzer.js`) : chaque projet reçoit un score sur six dimensions — retard, échéance, blocage de la dernière action, stagnation dans le pipeline, inactivité, budget. Un projet est « critique » à partir de 20 points.

**Requête** : `dashboardBriefing.service.js` appelait `projectService.listProjects({ limit: 100, isArchived: false }, userId)`. Le second argument n'est pas un filtre : sans `mine: true`, le dépôt (`project.repository.js`, `buildBaseWhere`) ne pose aucune condition sur `ownerId`. La requête était donc `SELECT … FROM projects WHERE "isArchived" = false LIMIT 100`, tous propriétaires confondus.

**Relations** : aucune jointure en cause. L'écart vient uniquement du filtre de propriétaire manquant.

**Preuve** (même service, même analyseur, base de démonstration) :

| Appel | Projets chargés | Critiques |
|---|---|---|
| Tel qu'il était | 80, dont 14 à l'utilisateur | 29 |
| Avec la règle de périmètre de l'outil `list_projects` | 14 | 5 |

**Conséquence au-delà du chiffre** : 4 des 5 cartes de risque affichées à `demo.commercial01` portaient sur des projets d'autres commerciaux (nom, score et motif). L'outil `list_projects` du Copilot applique déjà la règle correcte ; le tableau de bord la contournait en appelant le service directement.

**Correction** : `dashboardBriefing.service.js` passe par `scopeInputForActingUser`, la règle existante de l'outil. Administrateurs : tous les projets. Tout autre rôle : ses propres projets.

| | Projets critiques | Cartes de risque |
|---|---|---|
| Avant (port 4000) | 29 | 1 sur 5 à l'utilisateur |
| Après (port 4001) | 5 | 5 sur 5 à l'utilisateur |

Pour un administrateur, 29 reste le bon chiffre : c'est le total sur les 80 projets.

## 4. `flutter build web` et tests

| Vérification | Résultat |
|---|---|
| `flutter build web` | réussi en 140 s (`build\web`) |
| Analyse statique de tout le projet Flutter | aucune erreur |
| Suite Flutter complète | 341 réussis ; 3 échecs, les mêmes qu'avant toute intervention |
| Tests backend ciblés (32 fichiers) | 671 réussis, 0 échec |
| Rendu dans l'application en marche | tableau de bord : « 14 projets », libellés corrigés, statuts revendeur présents ; Copilot : nouvelles cartes de suggestion, survol visible, état « Assistant CRM » avant tout échange |

Les 3 échecs Flutter antérieurs : une règle de pièce jointe, et deux fichiers de test qui ne compilent pas hors navigateur.

## 5. Parcours de démonstration

Voir [PARCOURS-DEMO-COPILOT.md](PARCOURS-DEMO-COPILOT.md). Le parcours commercial est joué et chronométré. Les parcours sédentaire et administrateur sont préparés, routage vérifié, mais non joués : leurs comptes n'ont pas de mot de passe utilisable.

## Incident à signaler

En lançant un lot de tests existants du backend, j'ai exécuté des suites d'intégration qui écrivent dans **`cbigestionnairepfe_test`**, la base persistante des tests Jest. Mon filtre ne les avait pas repérées (elles chargent `src/db` directement, par exemple `ai.orchestrator.porPromeshAgent.integration.test.js`).

| Base | Lignes insérées | Modifiées | Supprimées |
|---|---|---|---|
| `cbigestionnairepfe_test` | +26 | +12 | +24 |
| `cbigestionnairepfe` (réelle) | 0 | 0 | 0 |
| `cbigestionnairepfe_demo` | 0 | +2 (connexions de `demo.commercial01`) | 0 |

Ces tests créent puis suppriment leurs propres données. Je n'ai pas vérifié s'il reste des lignes résiduelles dans la base de test. Trois de ces tests ont échoué ; je ne les ai pas analysés.

## État des bases

- Base réelle : 13 827 / 5 837 / 4 317, 0 session — identique depuis le début de la journée.
- Notifications : 300, 0 lue, même empreinte de contenu.
- Projets, actions, registre : 80 / 300 / 2 192.
- `.env` : inchangé.

## À faire de votre côté

1. **Redémarrer votre backend** (`npm run demo:start`) : il tourne depuis 11:52 avec l'ancien code, donc sans les corrections 2 et 3.
2. Redémarrer à chaud `flutter run` pour charger le masquage des journaux.
3. Décider de la réinitialisation des neuf mots de passe, nécessaire aux parcours sédentaire et administrateur.

## Problèmes connus, non corrigés

- « Combien de projets par famille de produit ? » : 147 s et une réponse fausse. À éviter en démonstration.
- Les questions libres sans agent correspondant : 35 à 160 s.
- Le client HTTP Flutter coupe à 15 s de réception : une réponse lente du modèle par l'API REST expire côté application.
- `lastRelanceAt` vide sur les 80 projets : la réponse « relance » liste tous les projets.
