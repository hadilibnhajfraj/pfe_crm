# Utiliser le Copilot IA

Les 5 autres guides de ce dossier expliquent COMMENT utiliser les écrans du CRM. Celui-ci explique COMMENT PARLER au Copilot — l'assistant conversationnel qui répond directement à une question métier ("Quels projets sont en retard ?", "Conseille-moi sur mes priorités") plutôt que de vous faire naviguer les écrans vous-même.

## Comment vous lui parlez

Dans l'application, le Copilot est accessible partout — un bouton flottant ouvre une fenêtre de conversation (un panneau latéral sur desktop, une feuille qui remonte du bas sur mobile), jamais une page à part entière qu'il faudrait quitter le reste de l'écran pour consulter. Techniquement, l'application parle à deux points d'entrée réels côté serveur (voir `docs/admin-guide/copilot-administration.md` pour le détail) : `POST /ai-copilot/chat` pour envoyer un message et recevoir la réponse complète, et un canal WebSocket dédié pour l'indicateur "en train d'écrire" et l'effet de révélation progressive de la réponse. Votre historique de conversations est accessible via `GET /ai-copilot/conversations` — jamais celui d'un autre utilisateur.

## Ce que le Copilot comprend (18 types de questions)

Le Copilot classe chaque message en une intention parmi 18, puis choisit l'Agent et les AI Tools appropriés. Vous n'avez jamais besoin de connaître ces noms techniques — posez la question en langage naturel, comme à un collègue.

| Vous demandez... | Le Copilot... | Exemples de questions |
|---|---|---|
| L'état des projets | Cite des projets réels (`list_projects`), classe par priorité si vous demandez "quels projets nécessitent une attention" | « Quels projets sont en retard ? », « Qui est le propriétaire du projet Sfax ? », « Quels projets nécessitent une attention particulière ? » |
| Vos contacts commerciaux | Cite vos KPI et contacts réels (rôle commercial/admin requis) | « Quelle relance dois-je faire cette semaine ? », « Donne-moi mon KPI ce mois-ci » |
| Le pipeline de vente | Cite les étapes réelles du pipeline | « Quel est l'état du pipeline ? », « Quelle est la position de l'étape Signature ? » |
| Le RH | Cite les demandes de congé réelles | « Qui est absent aujourd'hui ? », « Quel est le statut de ma demande de congé ? » |
| La maintenance | Cite les demandes/interventions réelles | « Signale une panne sur la ligne 3 », « Quel technicien est disponible ? » |
| Les notifications | Cite vos notifications réelles | « Ai-je des notifications non lues ? », « Marque tout comme lu » |
| L'industriel / POR PROMESH | Cite les fiches réelles (rôles restreints) | « Détail de la fiche industrielle numéro 88 », « Combien de fiches POR PROMESH en attente ? » |
| Les utilisateurs / comptes | Cite les comptes réels (admin) | « Liste les utilisateurs actifs », « Quel est mon rôle ? » |
| Le tableau de bord | Cite de vrais chiffres, explique une tendance, compare, prévoit | « Pourquoi mon KPI a-t-il augmenté ce mois ? », « Compare ce mois au précédent » |
| Une synthèse / un rapport | Produit une SYNTHÈSE narrative, pas une liste de chiffres bruts | « Fais-moi un rapport de synthèse sur les indicateurs clés » |
| Une analyse métier | Résultat → causes → risques → recommandations, sur 8 domaines | « Analyse les KPI du mois et donne-moi des recommandations » |
| Un conseil / des priorités | Priorités, tâches, clients à relancer, projets critiques, risques, anomalies, actions | « Conseille-moi sur mes priorités du jour » |
| La qualité des données | Doublons, informations manquantes, emails/téléphones invalides, incohérences, orphelins, Score Qualité | « Détecte les doublons dans mes projets » |
| Une recherche complexe | Combine plusieurs Tools (période, seuil de montant, absence de correspondance) | « Trouve les chantiers créés en juin dont le montant dépasse 20 000 € » |
| Une automatisation | Décompose en étapes, PROPOSE (jamais n'exécute directement) | « Automatise la relance des dossiers en retard » |
| Une question sur le CRM | Répond via la base documentaire (RAG), cite ses sources | « Comment fonctionne le calcul du pourcentage de réussite d'un projet ? » |
| Une conversation générale | Reste courtois, réoriente vers le bon module si hors sujet | « Bonjour, que peux-tu faire pour moi ? » |

Ce tableau reflète le corpus de validation complet (`test/fixtures/copilotValidationScenarios.js`, 500 conversations réalistes, une par question testée contre le vrai code) — voir `src/ai/orchestrator/COPILOT_VALIDATION.md` pour la méthodologie.

## Le Copilot respecte toujours vos permissions

Le Copilot n'a jamais plus de droits que vous. Si vous n'avez pas le rôle nécessaire pour une donnée ou une action (ex. un rôle standard qui demande les KPI de contacts commerciaux, réservés aux commerciaux/admins), il refuse poliment et explique pourquoi — jamais une réponse partielle qui laisserait deviner une donnée que vous n'êtes pas censé voir.

## Il ne fait jamais rien sans vous le dire — et jamais d'action sensible sans confirmation

Pour une simple question ("Quels projets sont en retard ?"), le Copilot répond directement. Pour une **automatisation** (enchaîner plusieurs actions : créer un rappel, préparer un email, planifier un rendez-vous, générer un rapport, créer une activité), il se déroule en 2 tours :

1. **Vous demandez** → le Copilot décompose la demande en étapes concrètes et vous les PROPOSE, sans rien exécuter.
2. **Vous confirmez** ("confirme") ou **annulez** ("annule") → seulement à ce moment, les actions proposées s'exécutent réellement.

Aucune action d'écriture (créer, modifier, supprimer, envoyer un email) n'a jamais lieu sans ce second tour explicite.

## Il explique toujours sa réponse

Chaque réponse du Copilot est accompagnée de :
- **une explication** — pourquoi il a répondu ainsi, quelles données il a utilisées, quels AI Tools il a appelés, quelles règles métier s'appliquent (moteur d'Explainability, voir `src/ai/orchestrator/EXPLAINABILITY_ENGINE.md`) ;
- **des citations**, quand la réponse vient de la documentation (RAG) plutôt que de données live ;
- **des suggestions d'actions pertinentes**, filtrées selon vos permissions — jamais exécutées automatiquement, toujours à votre initiative.

## Il se souvient de la conversation

Vous pouvez enchaîner naturellement : « Montre-moi les projets. » puis « Et lesquels sont en retard ? » — le Copilot comprend que la seconde question porte sur les mêmes projets déjà évoqués, sans que vous ayez à tout répéter (Conversation Manager + Natural Conversation Engine, voir `src/ai/orchestrator/CONVERSATION_CONTEXT.md`).

## Il ne vous attend pas toujours — les alertes proactives

Une fois activées par un administrateur (voir le guide administrateur), le Copilot surveille en continu projets, ventes, activités, échéances, interventions et KPI, et envoie une alerte réelle (e-mail + notification + événement temps réel) dès qu'un risque critique ou élevé est détecté — avec le problème expliqué, une solution proposée, et des actions préparées (jamais exécutées automatiquement, comme pour l'automatisation). Vous n'avez rien à demander pour recevoir ces alertes ; elles arrivent d'elles-mêmes si vous êtes administrateur.

## Voir aussi

- `docs/user-guide/00-vue-ensemble-des-modules.md` — pour la liste des modules CRM eux-mêmes.
- `docs/admin-guide/copilot-administration.md` — configuration, activation, supervision (pour les administrateurs).
- `src/ai/README.md` — la documentation technique complète du Copilot, pour qui construit ou maintient le kernel IA.
