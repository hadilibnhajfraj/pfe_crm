# Intent Detection — les 15 intentions du Copilot

`orchestrator/intentClassifier.js` — classification d'un message utilisateur en français, entièrement hors-ligne (aucun fournisseur LLM requis), avec un score de confiance. Voir aussi `orchestrator/WORKFLOW.md` (étapes 2-3 du workflow général) pour la place de la détection d'intention dans le cerveau du Copilot.

## Les 15 intentions

### Famille "Question sur un domaine métier" (`question_*`)

| Intention | Label | Description | Exemples de mots-clés |
|---|---|---|---|
| `question_kpi` | Question KPI | Question sur un indicateur clé de performance précis. | kpi, indicateur, performance, objectif, taux |
| `question_projet` | Question Projet | Question sur un ou plusieurs projets. | projet, étape, jalon, avancement, propriétaire |
| `question_commerciale` | Question Commerciale | Contacts commerciaux, prospects, relances, opportunités. | commercial, contact, client, prospect, relance |
| `question_rh` | Question RH | Congés, absences, recrutement. | rh, congé, absence, employé, recrutement |
| `question_maintenance` | Question Maintenance | Panne, technicien, intervention. | maintenance, panne, technicien, intervention, réparation |
| `question_industrielle` | Question Industrielle | Fiche de production industrielle. | industriel, production, fiche, usine, atelier |
| `question_dashboard` | Question Dashboard | Tableau de bord, vue d'ensemble. | dashboard, tableau, bord, aperçu, vue |
| `question_reporting` | Question Reporting | Rapport ou bilan déjà produit. | rapport, reporting, bilan |
| `question_recherche` | Question Recherche | Recherche libre d'une information précise. | recherche, cherche, trouve, localise |
| `question_documentation` | Question Documentation | Fonctionnement du CRM, procédure. | documentation, guide, procédure, manuel, expliquer, fonctionne |

### Famille "Demande transversale" (`demande_*`)

Ces 5 intentions ne sont **pas** des modules métier — une "demande de résumé" peut porter sur des KPI, des projets, ou de la maintenance. Elles répondent à une question différente : pas "de quoi parle le message" mais "quel type de traitement attend l'utilisateur".

| Intention | Label | Description | Exemples de mots-clés |
|---|---|---|---|
| `demande_action` | Demande d'action | Exécuter une action concrète (créer, modifier, assigner...). | créer, ajouter, supprimer, modifier, assigner, valider |
| `demande_resume` | Demande de résumé | Synthèse courte d'une situation. | résume, synthèse, bref |
| `demande_comparaison` | Demande de comparaison | Comparer deux périodes, entités ou valeurs. | compare, comparaison, différence, évolution |
| `demande_statistiques` | Demande de statistiques | Chiffre agrégé : moyenne, total, pourcentage. | statistique, moyenne, total, pourcentage, nombre |
| `demande_prevision` | Demande de prévision | Projection ou tendance future. | prévision, prévoir, tendance, estimer |

## Le score de confiance

```
confidence = score de l'intention gagnante / somme des scores de TOUTES les intentions
```

- Un message qui ne matche qu'une seule intention (aucun mot-clé d'une autre catégorie) obtient **`confidence: 1`**.
- Un message ambigu (mots-clés de plusieurs intentions à la fois) obtient une confiance **partagée**, proportionnelle à la part du signal lexical total que porte la gagnante.
- Un message sans aucun mot-clé reconnu obtient **`intent: null` (ou `fallbackIntent` si configuré), `confidence: 0`** — jamais une intention devinée au hasard.

`classify(message)` renvoie aussi `scores` : le classement complet des 15 intentions, chacune avec son score brut et la liste des mots-clés qui ont matché — traçabilité complète de chaque décision, pas une boîte noire.

```js
const { IntentClassifier } = require("./intentClassifier");
const classifier = new IntentClassifier();

classifier.classify("Il y a une panne, il faut un technicien.");
// {
//   intent: "question_maintenance",
//   label: "Question Maintenance",
//   confidence: 1,
//   scores: [
//     { key: "question_maintenance", label: "Question Maintenance", score: 2, matchedKeywords: ["panne", "technicien"] },
//     { key: "question_kpi", label: "Question KPI", score: 0, matchedKeywords: [] },
//     ... (13 autres, score: 0)
//   ]
// }
```

## Modularité

- `IntentClassifier` accepte un jeu de `definitions` personnalisé au constructeur (`new IntentClassifier({ definitions: [...] })`) — les 15 intentions par défaut ne sont qu'une configuration, pas un couplage en dur.
- `route(message)` (méthode async, renvoie `Promise<string|null>`) rend `IntentClassifier` directement substituable partout où un `IRouter` (`langchain/router/router.interface.js`) est attendu — même contrat que `LexicalIntentRouter`/`LlmIntentRouter`.
- Aucune dépendance à un fournisseur LLM : entièrement déterministe et testable hors-ligne, comme tout le reste du kernel (`LexicalIntentRouter`, `HashingEmbeddingProvider`, `LexicalOverlapReranker`).

## Relation avec `orchestrator/intentCatalog.js` / `IntentDetector` (déjà câblés dans `AIManager`)

Le kernel possède déjà un système de détection d'intention **différent et déjà intégré** au workflow du Copilot (`IntentDetector` + `DEFAULT_INTENT_CATALOG`, voir `WORKFLOW.md` étapes 2-3) : une intention par **module métier** (`moduleKey`, `requiresTools`, `requiresRag`), utilisée pour piloter `ToolRouter`/`WorkflowManager`. Ce système-là ne calcule aujourd'hui aucun score de confiance.

`IntentClassifier` (ce document) répond à une demande différente : reconnaître explicitement les 15 catégories nommées ici, en français, avec un score de confiance — dont 8 recoupent des modules déjà connus du catalogue existant, et 7 sont nouvelles (KPI et Recherche comme domaines distincts, et les 5 intentions transversales `demande_*`).

**Correspondance indicative** entre les deux taxonomies (pour une intégration future, non appliquée automatiquement dans cette passe — voir « Ce qui n'a pas été fait » ci-dessous) :

| `IntentClassifier` (ce fichier) | `intentCatalog.js` (déjà câblé) |
|---|---|
| `question_projet` | `projects` |
| `question_commerciale` | `commercial_contacts` |
| `question_rh` | `hr` |
| `question_maintenance` | `maintenance` |
| `question_industrielle` | `industrial` |
| `question_dashboard` | `dashboard` |
| `question_reporting` | `reporting` |
| `question_documentation` | `documentation_question` |
| `question_kpi` | *(nouveau — recoupe partiellement `dashboard`)* |
| `question_recherche` | *(nouveau — distinct de `documentation_question`, pas de RAG)* |
| `demande_action` | *(transversal — recoupe `automation` pour un enchaînement multi-modules)* |
| `demande_resume`, `demande_comparaison`, `demande_statistiques`, `demande_prevision` | *(transversaux — aucun équivalent aujourd'hui)* |

### Ce qui n'a pas été fait (délibérément, dans cette passe)

`IntentClassifier` n'a **pas** été branché à la place de `LexicalIntentRouter` dans `IntentDetector`/`AIManager` : les clés des deux taxonomies ne coïncident pas (`question_projet` vs `projects`), et forcer un branchement direct aurait cassé le contrat `moduleKey`/`requiresTools`/`requiresRag` déjà consommé par `ToolRouter`/`WorkflowManager`, testé par plusieurs dizaines de tests existants. Ce fichier est livré comme un composant **autonome, testé et documenté**, prêt à être intégré (par exemple : utiliser sa `confidence` pour décider si `AIManager` doit demander une clarification à l'utilisateur avant de router, ou enrichir `intentCatalog.js` avec les 7 catégories nouvelles) — une décision d'intégration volontairement laissée à une prochaine itération plutôt que forcée ici sans certitude sur l'usage réel souhaité.

## Limite connue : ambiguïté lexicale

Un classificateur par recouvrement de mots-clés reste approximatif par nature : un message contenant à la fois "kpi" et "rapport" partage son score entre `question_kpi` et `question_reporting`. C'est exactement ce que `confidence` est censé révéler (une confiance basse signale une ambiguïté réelle) plutôt qu'un défaut à masquer. Découvert et corrigé une fois pendant le développement de ce fichier : les mots-clés "comment"/"pourquoi" avaient été initialement inclus dans `question_documentation` puis retirés — trop génériques en français courant ("comment vas-tu ?"), ils produisaient un faux positif systématique sur une simple salutation (voir le test correspondant dans `test/ai.orchestrator.intentClassifier.test.js`).

## Tests

`test/ai.orchestrator.intentClassifier.test.js` — 30 tests : les 15 intentions reconnues chacune sur une phrase réaliste, le calcul du score de confiance (message univoque, ambigu, sans match, avec/sans `fallbackIntent`), le tri de `scores`, l'insensibilité aux accents et à la casse, la compatibilité `IRouter` (`route()`), et la configuration d'un jeu de définitions personnalisé.
