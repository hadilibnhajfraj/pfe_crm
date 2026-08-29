# Release_Readiness.md — Le projet est-il prêt ?

Verdict du comité d'audit, par palier de déploiement. Note globale de référence : **11,7/20 (58,5/100)** — voir `Enterprise_Audit.md`.

---

## 1. Démonstration académique — ✅ OUI, prêt (avec une réserve)

**Verdict : prêt**, sous réserve de trancher le choix du fournisseur LLM (Étape 0.3 de `Improvement_Roadmap.md`) pour que le module IA soit démontrable en fonctionnement réel, pas seulement décrit.

**Justification** :
- Le CRM fonctionne (1284 tests, 112/114 suites vertes après le correctif de configuration de cette session).
- L'ingénierie du module IA (MCP, LangChain, RAG, 11 Agents, sécurité) est réelle, testée, et documentée en profondeur (`src/ai/README.md`) — un jury technique y trouvera une matière substantielle à évaluer.
- Les quatre passes d'audit de cette session (architecture, sécurité, performance, cette synthèse finale) démontrent une démarche d'ingénierie rigoureuse : détection réelle, vérification avant correction, mesure avant/après, tests de régression — exactement ce qu'un jury de PFE évalue.
- **Réserve unique** : sans fournisseur LLM branché, le "Copilot IA" ne peut être montré qu'à travers ses tests et son architecture, pas par une conversation réelle. Un modèle local ou une clé API de démonstration suffirait à lever cette réserve.

---

## 2. Recette utilisateur (UAT) — ⚠️ PAS ENCORE, proche

**Verdict : pas prêt aujourd'hui**, prêt après l'Étape 1 de `Improvement_Roadmap.md` (effort faible).

**Justification** :
- Les failles de sécurité critiques trouvées cette session (endpoints publics, IDOR, Socket.IO ouvert) sont **corrigées** — un UAT ne serait pas exposé à ces risques.
- Le bug de performance actif (12M lignes de notifications) est **corrigé et mesuré**.
- **Ce qui manque** : la rotation des secrets exposés (Étape 0, action externe non technique) doit être faite AVANT tout accès utilisateur externe, même en UAT — un testeur UAT avec accès au dépôt (même en lecture) serait exposé aux mêmes identifiants qu'un attaquant. Le workflow CI ajouté cette session doit être vérifié en exécution réelle avant de s'y fier pour valider chaque changement pendant l'UAT.
- Les 21 tests MFA en échec (nouveau constat de cette passe, révélé par la correction du `.env`) doivent être clarifiés avant qu'un testeur UAT ne rencontre un comportement MFA non couvert par les tests.

---

## 3. Préproduction — ❌ PAS PRÊT

**Verdict : pas prêt**, prêt après les Étapes 0, 1 et 2 de `Improvement_Roadmap.md` (effort moyen).

**Justification** :
- Aucune configuration Docker n'existe — une préproduction suppose généralement un environnement reproductible, packagé, proche de la cible de production. Ce n'est pas le cas aujourd'hui.
- Aucun outil d'observabilité — en préproduction, on doit pouvoir observer ce qui se passe (logs structurés, métriques, alerte) : aujourd'hui, seul `console.log` existe, et de façon incohérente (75 fichiers hors du logger centralisé).
- Le téléchargement de pièces jointes reste non authentifié, et la fuite de données cross-role (`list_projects`) reste ouverte — deux points qu'une préproduction avec de vraies données sensibles ne devrait pas exposer sans décision explicite.
- PostgreSQL n'est pas tuné pour un volume réaliste, et l'incident `autovacuum` jamais exécuté doit être surveillé de près sur un environnement qui reçoit un trafic soutenu.

---

## 4. Production — ❌ PAS PRÊT

**Verdict : pas prêt**, prêt après les 4 étapes complètes de `Improvement_Roadmap.md` (effort élevé, plusieurs semaines réalistes selon la disponibilité de l'équipe).

**Justification** :
- **Scalability : 8/20** — les deux bloquants identifiés (Socket.IO sans adaptateur Redis, rate limiters en mémoire) rendent un déploiement multi-instance **silencieusement incorrect**, pas juste sous-optimal : des utilisateurs perdraient des notifications temps réel, et le rate-limiting deviendrait incohérent entre instances. Or, "plusieurs centaines d'utilisateurs simultanés" (l'objectif explicitement formulé) suppose réalistement plusieurs instances.
- **DevOps : 6/20** — aucun Docker, CI backend ajouté mais non vérifié en exécution réelle, aucune stratégie de déploiement documentée. Un incident en production n'aurait aujourd'hui aucun mécanisme d'alerte (pas d'observabilité).
- **La rotation des secrets exposés (Étape 0) doit être complète et vérifiée AVANT toute mise en production** — c'est un point absolument non négociable, indépendant de tout le reste.
- Le module IA, aussi bien construit soit-il, n'a **aucun fournisseur LLM branché** — le proposer en production reviendrait à vendre une fonctionnalité qui n'existe pas encore en exécution réelle.

---

## 5. Points bloquants, classés par priorité

### Critique (bloque tout accès externe, même une démo publique)
1. Rotation des secrets exposés (`.env.example` commité avec de vraies valeurs) — action externe, voir `docs/security/Security_Report.md` §1.

### Majeur (bloque UAT/préproduction/production selon le palier — voir détail ci-dessus)
2. Scalability : Socket.IO sans adaptateur Redis, rate limiters en mémoire.
3. Aucune configuration Docker.
4. Aucun outil d'observabilité (logs/métriques/alerte).
5. Téléchargement de pièces jointes non authentifié.
6. Fuite de données cross-role (`list_projects`/KPI personnel) — décision produit requise.
7. Rotation des refresh tokens absente.
8. 21 tests MFA en échec (nouveau constat, config locale) — à clarifier avant UAT.
9. Choix du fournisseur LLM non tranché — bloque la fonctionnalité IA en usage réel.

### Mineur (n'empêche aucun palier, mais dégrade la maintenabilité/qualité)
10. Pas de linter/formatter.
11. 75 fichiers en logging non centralisé.
12. Pas de spécification API (OpenAPI).
13. Frontend Flutter quasi sans test.
14. N+1 dans `scheduler.js`, absence de cache sur les dashboards, transactions manquantes sur quelques écritures multi-étapes.

## 6. Plan d'action — voir `Improvement_Roadmap.md`

Le plan complet, séquencé par étape et par effort, est détaillé dans `Improvement_Roadmap.md`. Résumé en une ligne par palier :

| Palier | Prêt aujourd'hui ? | Ce qui manque |
|---|---|---|
| Démonstration académique | **Oui** (avec réserve LLM) | Choisir un fournisseur LLM pour une démo live |
| UAT | Non, proche | Rotation des secrets + clarifier les tests MFA + vérifier la CI |
| Préproduction | Non | + Docker + observabilité + décisions sécurité résiduelles |
| Production | Non | + Redis (Socket.IO + rate limiting) + tuning PostgreSQL + fournisseur LLM |
