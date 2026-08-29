# Tool Router — sélection automatique des AI Tools

`orchestrator/toolRouter.js` — étapes 6 (« décider si un AI Tool est nécessaire ») et une partie de 7/8/9 (sélection, exécution, fusion) du workflow général (voir `WORKFLOW.md`). Ce document répond spécifiquement à la demande : après détection de l'intention, sélectionner automatiquement un ou plusieurs Tools, les exécuter, et fusionner leurs résultats dans une seule réponse.

## L'exemple demandé, avec de vrais Tools

> Question : **« Quels projets sont en retard ? »**
> → sélection automatique de Tools → fusion des résultats.

Les noms `Project.Search`/`Project.KPI`/`Project.Activity` de l'énoncé sont illustratifs — ce dépôt n'a pas de Tool `Project.Activity` (aucun Tool n'expose l'historique d'activité d'un projet aujourd'hui) et nomme ses Tools réels en `snake_case` (`list_projects`, `get_dashboard_kpis`, ...), pas en dot-notation. Voici le même scénario avec les **Tools réellement enregistrés** dans ce kernel :

```
"Quels projets sont en retard ?"
        │
        ▼
IntentDetector.detect() → intent "projects"
  moduleKey: "projects"
  relatedModules: ["dashboard"]   ← nouveau : les indicateurs de retard vivent dans le module dashboard, pas projects
        │
        ▼
ToolRouter.select(intent, message)
  pool de candidats = Tools du module "projects" ∪ Tools du module "dashboard"
  classés par recouvrement lexical avec le message
        │
        ▼
  [ list_projects, get_dashboard_kpis ]   ← DEUX Tools, DEUX modules, une seule sélection
        │
        ▼
ToolCallingChain (langchain/chains/toolCallingChain.js)
  tour 1 : appelle list_projects           → { projects: [...] }
  tour 2 : appelle get_dashboard_kpis      → { retardMoyenJours: 12 }
  tour 3 : final_answer, synthèse des deux résultats
        │
        ▼
"Le projet 'Usine A' est en retard (12 jours en moyenne)."
```

## Comment la sélection automatique fonctionne

### 1. Filtrage par module(s) métier (frontière dure)

Chaque `Intent` (résolu par `IntentDetector`, voir `intentCatalog.js`) porte :
- `moduleKey` — le module métier **principal** de l'intention (ex. `"projects"`).
- `relatedModules` (nouveau, optionnel, `[]` par défaut) — des modules **supplémentaires** dont les Tools sont aussi pertinents pour cette intention.

`ToolRouter.select()` ne considère JAMAIS un Tool en dehors de `{moduleKey} ∪ relatedModules` — une frontière dure, pas une suggestion (une intention "maintenance" ne peut toujours pas faire remonter un Tool RH, même avec ce changement). `relatedModules` est déclaré explicitement par intention dans `intentCatalog.js`, jamais deviné automatiquement : à ce jour, seule l'intention `"projects"` en déclare un (`["dashboard"]`), pour exactement le scénario ci-dessus.

### 2. Classement par recouvrement lexical

Une fois le pool de candidats fixé, chaque Tool est noté par le nombre de mots de son nom+description qui apparaissent aussi dans le message (même technique que `LexicalIntentRouter`/`LexicalOverlapReranker` — un seul `tokenize()` partagé, jamais réécrit). Les `maxTools` (5 par défaut) meilleurs sont retenus.

### 3. Le modèle décide combien en appeler

`ToolRouter.select()` renvoie une LISTE de candidats, jamais un Tool imposé — c'est `ToolCallingChain` (langchain/chains/toolCallingChain.js) qui, tour par tour, décide d'appeler zéro, un, ou plusieurs de ces candidats avant de répondre. Rien n'empêche le modèle d'appeler `list_projects` PUIS `get_dashboard_kpis` dans la même conversation — c'est exactement ce que montre l'exemple ci-dessus, et ce que couvre le test dédié (voir plus bas).

## Comment la fusion des résultats fonctionne

Trois couches, chacune avec sa propre responsabilité — aucune ne duplique le travail d'une autre :

1. **`ToolCallingChain`** (langchain/chains/toolCallingChain.js) — accumule CHAQUE appel dans `steps: {tool, input, output}[]`, et réinjecte le résultat de chaque Tool comme message avant le tour suivant (le modèle voit donc le résultat du premier Tool avant de décider d'appeler le second) ; `answer` est la synthèse finale du modèle, qui a vu tous les résultats.
2. **`WorkflowManager`** (orchestrator/workflowManager.js) — reçoit `{answer, steps}` de la Chain et les renomme `toolSteps` dans sa propre sortie `{mode, answer, citations, toolSteps}`.
3. **`ResponseBuilder`** (orchestrator/responseBuilder.js) — projette `toolSteps` en `toolCalls: {tool, input, output}[]` dans la réponse finale, et calcule `explanation` (étape 11 du workflow) à partir d'eux — ex. *"Réponse construite à partir de l'outil (ou des outils) : list_projects, get_dashboard_kpis."*

Aucune étape ne perd le résultat d'un Tool appelé plus tôt : la réponse finale porte la trace complète des DEUX appels, pas seulement du dernier.

## Configurer une nouvelle relation cross-module

Pour qu'une autre intention bénéficie du même mécanisme, ajouter `relatedModules: [...]` à son entrée dans `intentCatalog.js` — aucun autre changement de code requis (`ToolRouter`/`IntentDetector` sont déjà prêts à le lire). Exemple :

```js
{
  key: "commercial_contacts",
  moduleKey: "commercialContacts",
  relatedModules: ["dashboard"], // si une question commerciale bénéficie aussi des KPI
  ...
}
```

À ce jour, seule l'intention `"projects"` en déclare un — ajouté pour cette passe, grounded dans les Tools réellement disponibles (pas de relation ajoutée sans qu'un vrai Tool du module cible existe et soit pertinent).

## Tests

- `test/ai.orchestrator.toolRouter.test.js` — sélection cross-module : sans `relatedModules` (comportement inchangé, aucune fuite), avec `relatedModules` (les deux modules représentés dans la sélection), et confirmation qu'un module non déclaré ne fuite jamais même s'il matche mieux lexicalement.
- `test/ai.orchestrator.intentDetector.test.js` — `relatedModules` correctement résolu depuis le catalogue (`[]` par défaut, ou la valeur déclarée).
- `test/ai.langchain.chains.test.js` — `ToolCallingChain` appelle réellement DEUX Tools différents dans une même conversation et fusionne leurs résultats dans une seule réponse (le scénario « Quels projets sont en retard ? » de bout en bout, avec un modèle factice).
