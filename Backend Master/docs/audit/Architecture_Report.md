# Architecture_Report.md — Architecture, DDD, Clean Architecture, SOLID, Modularité

**Périmètre analysé** : `Backend Master/src` (CRM Express/Sequelize + kernel IA `src/ai/`) et `Dash Master Toolkit/lib` (Flutter, évalué structurellement, pas ligne à ligne). Aucune hypothèse — chaque constat renvoie à un fichier réel.

---

## 1. Deux architectures cohabitent dans le même dépôt

Le constat le plus structurant de cet audit : **le CRM "historique" (`src/routes/`, `src/modules/*`) et le kernel IA (`src/ai/`) suivent deux disciplines architecturales très différentes**, visiblement écrites à des moments différents avec des standards différents.

### 1.1 `src/ai/` — Ports & Adapters rigoureux, Clean Architecture par construction
- Chaque sous-système (`mcp/`, `rag/`, `langchain/`, `orchestrator/`, `agents/`, `memory/`, `automations/`, `dashboard/`, `security/`) expose un contrat (`*.interface.js`), un ou plusieurs adaptateurs, et une racine de composition (`pipeline.js`) — jamais de construction d'adaptateur concret en profondeur.
- **Vérifié mécaniquement**, pas seulement documenté : des tests "policy" (`test/ai.*.policy.test.js`) lisent le code source en texte brut pour garantir qu'un sous-système ne touche jamais Sequelize/SQL brut/HTTP sortant en dehors de son périmètre déclaré.
- DIP appliqué de façon disciplinée : `McpServer`, `AIManager`, `WorkflowManager` ne construisent aucun de leurs collaborateurs — tout est injecté, avec des valeurs par défaut `null` rétrocompatibles à chaque extension (vérifié à travers 3 passes d'audit successives dans cette session, jamais de régression sur les tests existants).
- **Évaluation : Excellent.**

### 1.2 CRM historique (`src/routes/*.js`, une partie de `src/modules/*`) — discipline inconsistante
- Certains modules suivent une vraie séparation repository/service/controller (`src/modules/projects/`, `src/modules/kanban/`) avec transactions Sequelize correctement utilisées (`project.service.js::moveStage()`).
- D'autres fichiers mélangent tout dans la route elle-même : `src/routes/client.routes.js` fait le parsing Excel, la validation, et l'accès Sequelize direct dans le handler HTTP ; `src/services/scheduler.js` mélange logique cron, requêtes DB et logique métier sans couche de service.
- Incohérences concrètes trouvées et corrigées pendant cette session : un cache (`kanban.service.js::_stageCache`) non invalidé par 5 des 6 chemins qui auraient dû le faire ; des index manquants sur des colonnes filtrées en permanence ; un cron sans déduplication ayant produit 12 millions de lignes en production (voir `docs/performance/`).
- **Évaluation : Moyen.** Le code fonctionne, mais la discipline architecturale du kernel IA n'a pas été rétro-appliquée au reste du CRM.

---

## 2. DDD (Domain-Driven Design)

**Aucune modélisation DDD classique n'existe dans ce projet** — ni agrégats explicites, ni value objects, ni langage ubiquitaire documenté, ni bounded contexts formalisés. Deux lectures possibles selon la zone :

- **Dans `src/ai/`** : c'est un choix **assumé et cohérent** — le kernel délègue explicitement TOUTE la logique métier aux services CRM existants plutôt que de la dupliquer (principe répété dans tout le code : "jamais réimplémenter une logique de portée parallèle"). Les Tools MCP sont volontairement de fins wrappers "déclare + délègue". Une modélisation DDD y serait contre-productive : il n'y a pas de domaine propre à modéliser, seulement de l'orchestration.
- **Dans le CRM historique** : c'est une **anémie de fait**, pas un choix documenté. Les modèles Sequelize (`src/models/*.js`) sont de purs conteneurs de données (getters/setters, aucune méthode métier), et les règles métier réelles (ex. "un follow-up manquant doit être notifié une fois par jour maximum", "une fiche POR PROMESH verrouillée refuse toute écriture") vivent dispersées dans des services et parfois directement dans des fichiers cron. Deux exemples trouvés dans les audits précédents illustrent une vraie règle métier "perdue" dans du code procédural plutôt que nommée : les seuils numériques des `*Analyzer.js` du Dashboard IA (`pendingBacklogThreshold`, `lowScoreThreshold`) et l'absence de tout concept nommé de "politique de suppression des follow-up".
- **Évaluation : Moyen** pour l'ensemble — cohérent et défendable côté IA, anémique et non documenté côté CRM.

---

## 3. Clean Architecture — direction des dépendances

- **`src/ai/utils/*.js`** (la couche la plus basse) ne dépend d'aucun sibling — vérifié par les tests policy.
- **Aucune violation de barrel/boundary n'a été trouvée dans le CRM historique** au sens Clean Architecture classique (pas de couche "domaine" séparée à violer, puisqu'elle n'existe pas — voir §2).
- Deux imports "hors barrel" trouvés et corrigés dans `src/ai/` pendant l'audit de sécurité (`mcp/server/mcpServer.js` et `security/pipeline.js` important des fichiers internes d'un autre sous-système plutôt que son barrel public) — corrigés, cas isolés, pas un pattern répété.
- **Évaluation (kernel IA) : Très bon.** **Évaluation (CRM) : Non applicable** au sens strict — il n'y a pas de couches à violer.

---

## 4. SOLID

| Principe | Kernel IA (`src/ai/`) | CRM historique |
|---|---|---|
| **S**RP | Respecté — un fichier = un contrat/adaptateur | Mitigé — `dashboard.service.js::getProfessionalKPIs` exécute ~18 requêtes dans une seule fonction ; `client.routes.js` mélange upload/parsing/persistance dans un handler |
| **O**CP | Respecté — `ToolRegistry`/`AgentRegistry` s'étendent par `register()`, jamais par modification | Partiel — ajouter un module CRM suit un pattern répété (routes/controller/service/repository) mais sans registre formel |
| **L**SP | Respecté et testé (`InMemoryConversationMemory` ↔ `ShortTermMemory` interchangeables, vérifié par test) | Non testé explicitement, mais peu de polymorphisme à violer dans ce code très concret |
| **I**SP | 27 interfaces ciblées dans le kernel IA | Non applicable (pas d'interfaces) |
| **D**IP | Appliqué systématiquement (racines de composition, injection) | Appliqué partiellement — `pipelineStage.service.js` importe désormais `kanban.service.js` (nouvellement corrigé), mais beaucoup de services importent directement des modèles Sequelize concrets sans abstraction, ce qui est acceptable pour du CRUD mais rend tout mock de test plus lourd (constaté en écrivant les tests de régression de cette session) |

**Évaluation SOLID globale : Bon**, tiré vers le haut par le kernel IA, vers le bas par le CRM historique.

---

## 5. Modularité

- 614 fichiers source dans `Backend Master/src`, organisés par domaine (`modules/<domaine>/{routes,controllers,services,repositories,validators}`) pour les modules les plus récents — un pattern cohérent, réplicable.
- Le kernel IA ajoute 11+ sous-dossiers avec un couplage explicite et minimal entre eux (chacun dépend du barrel public d'un autre, jamais d'un fichier interne — sauf les 2 exceptions déjà corrigées, §3).
- Aucun cycle de dépendance bloquant trouvé, mais un risque réel identifié en écrivant les tests de cette session : `kanban.service.js` ↔ `project.service.js` ↔ `pipelineStage.service.js` forment maintenant une étoile de dépendances (tous pointent vers `kanban.service.js` pour l'invalidation de cache) — pas un cycle, mais une coupling à surveiller si `kanban.service.js` grossit encore.
- **Évaluation : Bon.**

---

## 6. Frontend Flutter (`Dash Master Toolkit`) — évaluation structurelle limitée

**Avertissement de portée** : cette section repose sur une inspection structurelle (arborescence, `pubspec.yaml`, comptage de fichiers), **pas** une revue ligne à ligne du code Dart — hors profondeur des trois audits précédents de cette session, qui ont porté sur le backend et le kernel IA.

- 402 fichiers Dart, organisés par domaine fonctionnel (`lib/dashboard/`, `lib/forms/`, `lib/application/`, `lib/app_shell_route/`) — structure de dossiers cohérente et lisible.
- Gestion d'état : `provider` (^6.1.2) — choix standard, adapté à l'échelle du projet, pas de sur-ingénierie (pas de `bloc`/`riverpod` pour un besoin qui ne le justifie peut-être pas).
- **1 seul fichier de test** dans tout le projet Flutter (`test/`) — couverture de test quasiment nulle côté frontend.
- Un pipeline CI/CD existe (`codemagic.yaml`, 35 lignes) — **le frontend a une automatisation de build/déploiement que le backend n'a pas** (corrigé partiellement dans cette session par l'ajout d'un premier workflow CI backend, voir `Technical_Debt.md`).
- **Évaluation : Moyen**, avec la réserve explicite que cette évaluation est structurelle et non approfondie.

---

## 7. Synthèse architecture

| Dimension | Note |
|---|---|
| Kernel IA (`src/ai/`) | **Excellent** |
| CRM historique (routes/modules) | **Moyen** |
| DDD | **Moyen** (cohérent côté IA, anémique et non documenté côté CRM) |
| SOLID | **Bon** |
| Modularité | **Bon** |
| Frontend Flutter (structurel) | **Moyen** |

Voir `Enterprise_Audit.md` pour la note chiffrée consolidée et la pondération dans la note globale.
