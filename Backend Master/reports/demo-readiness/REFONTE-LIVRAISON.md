# Refonte CRM, Copilot et Power BI — compte rendu du 12/10/2026

## 1. Diagnostic initial

**L'interface existante était déjà au niveau d'une application SaaS : la refonte a donc été ciblée, pas massive.** Navigation bleu nuit, cartes KPI, graphiques, panneau Copilot à onglets, thème clair et sombre étaient en place (constaté dans l'application en marche). Les vrais défauts étaient ailleurs :

| Constat | Preuve |
|---|---|
| Le tableau de bord personnel affichait « 10 projets » dans le sous-titre et les graphiques, et « 14 » dans la carte KPI | `GET /projects/my-projects` ne renvoie par défaut que le modèle « project » (10) ; `GET /dashboard/user` compte tous les modèles (14) ; SQL : 10 + 3 revendeurs + 1 applicateur |
| Deux cartes KPI mal nommées | « Mes Validations » affiche les projets **en attente** de validation ; « Mon Taux Réussite » est calculé comme validés / total (`dashboard.service.js`) |
| 2 des 6 suggestions demandées pour le Copilot n'appelaient aucun outil de données | « Résume l'activité commerciale… » : 104 s, « Je ne trouve pas cette information » ; « Analyse le pipeline commercial. » : 160 s, simple liste des étapes |
| 1 suggestion partait vers le mauvais agent | « Quels projets nécessitent une relance ? » répondait sur les contacts |
| 7 suggestions contextuelles existantes ne tenaient pas leur promesse | « Montre les ventes. » et « Montre les devis. » renvoient les mêmes KPI génériques ; « Créer une opportunité. », « Créer une activité. », « Créer un rapport. » : 38 à 81 s sans action ; « Quels sont mes KPI ? » : demande de précision |
| État « prêt » du Copilot écrit en dur | `copilot_panel_body.dart` |
| Une seule erreur générique pour le réseau, les délais et le modèle | « Une erreur est survenue. Réessayez. » |
| Entrée / Maj+Entrée non gérés explicitement | champ multiligne avec action « envoyer » |
| Émojis des suggestions affichés en carrés vides au premier affichage | capture de l'application |
| Cloche de notifications et bascule de thème sans survol, sans focus clavier, sans infobulle | simples zones tactiles (`GestureDetector`) |

Ce qui fonctionnait et n'a pas été touché : Ollama `qwen3:8b`, AgentRuntime, ContextBuilder, RAG, orchestrateur, détection d'intentions, outils MCP, historique, routes et contrats de l'API. **Aucun fichier du backend n'a été modifié pendant cette mission.**

Contexte d'exécution : un backend de démonstration tournait déjà (lancé par vous à 11:52 avec `npm run demo:start`), ainsi que votre `flutter run` sur le port 57745. Je les ai utilisés ; ma propre tentative de lancement s'est arrêtée sur le port occupé, sans rien créer.

## 2. Fichiers modifiés

Tous dans `source code\Dash Master Toolkit` (même dépôt Git que le backend ; accès accordé pendant la mission). 15 fichiers modifiés, 1 nouveau.

| Fichier | Raison |
|---|---|
| `lib/ai/services/copilot_suggestion_engine.dart` | Les six suggestions demandées, chacune reliée à une formulation vérifiée sur le backend réel ; suggestions contextuelles remplacées par des questions qui appellent un outil ; pictogrammes au lieu d'émojis |
| `lib/ai/widgets/copilot_empty_state.dart` | Cartes de suggestion avec états normal, survol, focus et pression ; icônes vectorielles |
| `lib/ai/widgets/copilot_input_bar.dart` | Entrée envoie, Maj+Entrée saute une ligne ; focus clavier visible ; rappel des raccourcis |
| `lib/ai/services/copilot_api_service.dart` | Une exception par cause : réseau, délai, erreur serveur |
| `lib/ai/providers/copilot_controller.dart` | Message explicite par cause ; état de disponibilité constaté au dernier échange |
| `lib/ai/screens/copilot_panel_body.dart` | En-tête relié à l'état constaté ; onglets avec état actif, survol et focus |
| `lib/dashboard/academic/view/dashboard_screen.dart` | Les graphiques et le sous-titre incluent revendeurs et applicateurs, comme les cartes KPI |
| `assets/lang/fr.json`, `assets/lang/en.json` | « En attente de validation » et « Taux de validation » à la place de deux libellés trompeurs |
| `lib/theme/styles.dart` | États survol, focus clavier, pression et désactivé communs à tous les boutons ; infobulles homogènes ; transitions de 180 ms |
| `lib/app_shell_route/components/topbar/theme_toggle_button.dart`, `notification_icon_button.dart`, `user_profile_avtar.dart` | Vrais boutons d'icône : infobulle, survol, focus clavier |
| `test/ai/services/copilot_suggestion_engine_test.dart`, `test/ai/widgets/copilot_empty_state_test.dart` | Tests alignés sur les nouvelles suggestions |
| `test/ai/copilot_resilience_test.dart` (nouveau) | 27 tests : erreurs, disponibilité, clavier, double envoi |

## 3. Améliorations visuelles

- **Interactions** : tous les boutons Material de l'application ont maintenant des états survol, focus clavier (anneau de 2 px), pression et désactivé, avec un curseur adapté. Seules les surcouches d'état sont définies dans le thème : l'apparence au repos de chaque écran est inchangée.
- **Infobulles** : style unique (fond bleu nuit, 12 px, délai de 350 ms) ; ajoutées sur la cloche (avec le nombre de non lues), la bascule de thème et le menu du compte.
- **Copilot** : cartes de suggestion avec pictogramme, bordure et ombre légère au survol, anneau au focus ; onglets de l'en-tête avec fond teinté pour l'onglet actif ; champ de saisie avec bordure renforcée au focus.
- **Mouvement réduit** : les transitions ajoutées dans le Copilot sont supprimées quand le système demande la réduction des animations.
- **Sélection de texte** : teinte de la couleur principale au lieu du vert vif.

Non fait : la palette n'a pas été changée (elle correspond déjà à la direction demandée) ; les pages Projects, Clients, Contacts, Actions, Relances et Administration n'ont pas été redessinées une à une, elles bénéficient des états d'interaction communs.

## 4. Copilot — corrigé ou ajouté

Suggestions de l'écran d'accueil, essayées une à une sur le backend réel avec `demo.commercial01` :

| Libellé affiché | Question envoyée | Outil exécuté | Délai | Résultat |
|---|---|---|---|---|
| Combien de projets sont enregistrés dans le CRM ? | identique | `list_projects` | 0,4 s | 14, « votre périmètre d'accès » |
| Quels projets nécessitent une relance ? | Quels projets n'ont pas été relancés depuis 30 jours ? | `list_projects` | 0,4 s | 14 projets listés |
| Résume l'activité commerciale sur la période disponible. | Analyse mes contacts commerciaux. | `get_my_commercial_contacts` | 0,3 s | 32 contacts, répartition par statut, appels |
| Quels dossiers nécessitent une attention particulière ? | identique | `list_projects`, `generate_recommendations` | 4,3 s | priorités, tâches, projets critiques |
| Affiche les actions en retard. | Quels projets sont en retard ? | `list_projects`, `analyze_project_attention` | 0,4 s | projets classés, actions bloquées citées |
| Analyse le pipeline commercial. | Combien de projets par statut ? | `get_project_statistics` | 0,03 s | tableau par statut, total 14 |

La question réellement envoyée apparaît dans la conversation. Deux limites assumées : il n'existe pas d'outil « actions en retard » (la réponse vient de l'analyse d'attention des projets), et « l'activité commerciale » se limite aux contacts.

Autres ajouts :

- **Clavier** : Entrée envoie, Maj+Entrée insère une ligne ; rien n'est envoyé pendant une génération ni sur un champ vide.
- **Disponibilité** : « Assistant CRM » tant qu'aucun échange n'a eu lieu, puis « connecté », « Dernière demande en échec », « Serveur injoignable », « Copilot non configuré » ou « Accès non autorisé » selon le dernier échange réel.
- **Erreurs** : messages distincts pour serveur injoignable, délai dépassé, session expirée, trop de demandes, erreur serveur. Aucun détail technique affiché, aucune réponse inventée.

Déjà présents, vérifiés et conservés : nouvelle conversation, historique, Markdown et tableaux, copie des réponses, indicateur de génération avec bouton Arrêter, pièces jointes.

Contrôle d'accès constaté côté serveur : `get_maintenance_stats`, `get_legacy_dashboard_kpis` et `get_professional_dashboard` refusés au rôle commercial ; `/dashboard/kpis`, `/users`, `/por-promesh` en 403 ; `/projects` sans jeton en 401.

## 5. Tests exécutés

| Test | Résultat |
|---|---|
| Suite Flutter complète avant modification | 302 réussis, 3 échecs |
| Suite Flutter complète après modification | 332 réussis, les 3 mêmes échecs |
| Nouveau fichier `copilot_resilience_test.dart` | 27 réussis |
| Analyse statique des fichiers modifiés | aucune erreur |
| Connexion `demo.commercial01` par l'API puis par l'interface | 200, rôle commercial |
| 15 routes utilisées par les écrans | 200 pour les routes du rôle, 403 pour les routes d'administration, 401 sans jeton |
| 29 questions au Copilot par l'API | outils et délais relevés (section 4 et diagnostic) |
| Réponses comparées à la base | 14 projets, répartition par statut identique, 32 contacts, 5 à rappeler : conformes au SQL |
| Ouverture du Copilot dans l'application | panneau, suggestions et champ affichés |

Les 3 échecs Flutter existaient avant mon intervention : une règle de pièce jointe, et deux fichiers de test qui ne compilent pas hors navigateur (`html.Url` dans `recuperable_excel_service.dart`).

**Non vérifié :**

- **Le rendu des modifications dans l'application en marche.** Votre `flutter run` ne recompile pas sur un simple rechargement de page ; il faut un redémarrage à chaud (touche `R` dans son terminal). Les changements sont couverts par les tests et l'analyse, pas par une vérification visuelle.
- Les journaux du backend : il tourne dans votre terminal, que je ne peux pas lire.
- Les rôles admin, sédentaire et production : leurs mots de passe ne sont pas réinitialisés.
- Les suggestions de l'écran industriel, pour la même raison ; elles sont inchangées.
- `flutter build web` : non lancé, pour ne pas perturber votre session de développement.

## 6. Problèmes restants

1. **Neuf comptes sans mot de passe** : sans eux, pas de démonstration par rôle.
2. **Questions libres lentes** : toute question qui ne correspond à aucun agent passe par le modèle seul, 60 à 160 s sur cette machine. Les suggestions l'évitent, la saisie libre non.
3. **« Quels projets nécessitent une relance ? » saisi au clavier** part toujours vers les contacts : correction à faire dans la détection d'intentions du backend, non faite ici.
4. **`lastRelanceAt` vide sur les 80 projets** : la réponse sur les relances liste tous les projets « jamais relancés ».
5. **« Résume la fiche. »** renvoie une erreur sans message pour un rôle sans accès industriel.
6. **Carte « Projets critiques » du tableau de bord du Copilot** : 29 pour un commercial qui a 14 projets. Écart non expliqué, à examiner.
7. **Messages de diagnostic** (`print`) encore présents dans `app_shell.dart` et `dashboard_screen.dart`, dont un qui écrit le début du jeton dans la console du navigateur. À retirer avant la soutenance.
8. Libellés corrigés en français et en anglais seulement ; les cinq autres langues gardent l'ancien texte.

## 7. Power BI — étapes manuelles

**Le rapport n'a pas été modifié.** Il est hors du dépôt de travail et Power BI Desktop est ouvert : toute écriture dans ses fichiers serait écrasée à l'enregistrement. Aucune actualisation n'a été déclenchée.

Le rapport contient déjà les pages demandées (01 à 07, plus « Machines & Déchets », trois pages de détail, trois info-bulles et la page « À lire — Données de démonstration »), avec boutons de navigation et segments. Ce qui reste à faire à la main, dans Power BI Desktop :

| Page | Action |
|---|---|
| Toutes | Affichage → Thèmes → Personnaliser : couleur 1 `#1573FE`, couleur 2 `#0B3C99`, positif `#18E2A0`, attention `#FF784B`, négatif `#DF1C41`, fond de page `#F8F9FB` — la palette de l'application |
| Toutes | Vérifier que le paramètre `PG_Database` vaut `cbigestionnairepfe_demo` avant toute actualisation (Transformer les données → Gérer les paramètres) |
| 01 — Executive Overview | Comparer les cartes aux requêtes K01, K02 et K06 : 80 projets, 14 gagnés, 5 perdus, 17,5 % |
| 02 — Commercial Performance | Ajouter au titre la mention « contacts affectés » : l'application compte les contacts créés (requête C03) |
| 03 — Project Pipeline | Trier l'axe par `pipeline_stages[position]` ; le visuel par statut affiche 13 gagnés contre 14 par étape (4 revendeurs incohérents) |
| 04 — Relance Center | Rappeler dans le sous-titre la date de référence du 30/09/2026 : 25 en retard et 2 à venir côté contacts (K08) |
| 05 — Clients & Contacts | Ne pas filtrer les clients par période : toutes les dates de création sont antérieures à avril 2026 (K17) |
| 06 — AI Business Copilot | Reprendre les six questions de la section 4 ; préciser que le Copilot répond dans le périmètre de l'utilisateur connecté |
| 07 — Production | Retirer les champs vides : produit, quantité prévue, quantité rejetée ; unité absente pour PROBAR (K12) |
| Info-bulles | Format → Info-bulle → Type « Page de rapport » sur chaque graphique, avec la page d'info-bulle correspondante |
| Interactions | Format → Modifier les interactions : les segments Période et Commercial doivent filtrer toutes les cartes de la page |

Fermer Power BI Desktop avant toute modification de fichiers par un outil, puis rouvrir.

## 8. Ce qui a été préservé

| Élément | Avant | Après |
|---|---|---|
| Base réelle : lignes insérées / modifiées / supprimées, sessions | 13 827 / 5 837 / 4 317, 0 | identique |
| Notifications : nombre, lues, dernière, empreinte md5 | 300, 0, 10/10 23:13 UTC, `e46d2726…` | identique |
| File d'e-mails | 0 | 0 |
| Projets, actions, registre | 80 / 300 / 2 192 | identique |
| Bases de test | compteurs inchangés | identique |
| Base de démonstration | — | 2 lignes modifiées : le jeton de session de `demo.commercial01`, par mes deux connexions |
| `.env` | 11/10 17:53 | identique |
| Backend | fichiers du périmètre P1 | aucun autre changement |
| Autre copie du dépôt (`codecanyon-…`) | — | non touchée |
| Modifications locales préexistantes | — | aucune écrasée ; aucune commande Git d'écriture |

Le mot de passe du compte de démonstration a été lu dans un fichier du projet par un petit programme local et n'apparaît dans aucune trace ; le jeton de session temporaire a été supprimé.

## Pour voir les changements

Dans le terminal où tourne `flutter run`, appuyer sur `R` (redémarrage à chaud), puis recharger l'application.
