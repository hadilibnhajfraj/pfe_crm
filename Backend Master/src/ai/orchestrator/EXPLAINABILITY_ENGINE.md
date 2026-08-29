# Explainability Engine — pourquoi, quelles données, quels Tools, quelles règles métier

Ce document décrit `response.explainability`, PRÉSENT sur CHAQUE réponse du Copilot (jamais `null`, y compris un refus de permission ou une demande de clarification), qui répond aux 4 questions demandées : pourquoi cette réponse, quelles données ont été utilisées, quels AI Tools ont été appelés, quelles règles métier ont été appliquées. Point d'entrée : `ExplainabilityBuilder.buildExplainability({ mode, agentName, toolSteps, citations })` (`orchestrator/explainabilityBuilder.js`), câblé dans `ResponseBuilder.build()`/`buildErrorResponse()`/`buildClarificationResponse()`.

## Ce qui existait déjà, et pourquoi ce n'était pas suffisant

`response.explanation` (`explanationBuilder.js`, une passe antérieure) existe depuis longtemps mais répond seulement à "quel Agent/quels Tools" en une phrase minimaliste (ex. `"Traité par l'agent spécialisé \"project_agent\". Outils consultés : list_projects."`) — jamais "pourquoi", jamais "quelles règles métier", `null` dès qu'il n'y a rien de trivial à dire, et absent en mode `error`/`clarification`. Il est **conservé tel quel** (rétrocompatible, rien ne le supprime) — `explainability` est un CHAMP SÉPARÉ, plus riche, structuré, et TOUJOURS présent.

```
{ conversationId, intent, mode, answer,
  explanation,      // ancien champ, phrase courte, null si rien à dire
  explainability: { // NOUVEAU — toujours un objet, jamais null
    reasoning,       // pourquoi cette réponse
    dataUsed,        // quelles données ont été utilisées
    toolsCalled,      // quels AI Tools ont été appelés
    businessRules,    // quelles règles métier ont été appliquées
  },
  ... }
```

## `toolSteps` : deux natures, une seule distinction qui change tout

Chaque Agent produit déjà `toolSteps: {tool, input, output}[]` (existant). L'audit préalable à cette passe a révélé une incohérence réelle : 2 des 15 Agents (`ProjectAgent`, `DataQualityAgent`) ajoutaient déjà une entrée **synthétique** — un Tool qui n'existe pas côté MCP (`analyze_project_attention`, `analyze_data_quality`) représentant une étape de RAISONNEMENT pure, pas un appel réel — mais SANS aucun marqueur qui la distingue d'un vrai Tool, et 3 autres Agents à raisonnement lourd (`KpiAgent`, `BusinessAnalystAgent`, `RecommendationAgent`) ne traçaient AUCUNE étape de raisonnement du tout : leurs règles métier n'existaient que dans le texte libre de `answer`, invisibles à toute lecture structurée.

Cette passe généralise et rend explicite le pattern déjà amorcé :

| Agent | Étape synthétique ajoutée | Ce qu'elle représente |
|---|---|---|
| `ProjectAgent` | `analyze_project_attention` (déjà existante, désormais marquée) | Classement par attention sur 6 dimensions (`ProjectAttentionAnalyzer`) |
| `DataQualityAgent` | `analyze_data_quality` (déjà existante, désormais marquée) | Les 8 catégories d'audit + Score Qualité |
| `KpiAgent` (nouveau) | `analyze_kpi_trends` | Comparaison/prévision/alertes calculées sur les indicateurs |
| `BusinessAnalystAgent` (nouveau) | `analyze_business_domain` (une par domaine analysé dans la question) | Résultat/causes/risques/recommandations pour CE domaine |
| `RecommendationAgent` (nouveau) | `generate_recommendations` | Les 7 catégories de conseil proactif |

Chaque entrée synthétique porte désormais **deux marqueurs explicites**, jamais devinés :
- `synthetic: true` — distingue structurellement un Tool réel d'une étape de raisonnement. Absent (donc `undefined`, falsy) sur tout `toolStep` réel.
- `description` — une phrase française déjà écrite par l'Agent, qui connaît le sens métier exact de son propre calcul (ex. `"Classement de 12 projet(s) par attention sur 6 dimensions (retard, budget, activité, échéances, pipeline, blocages)."`) — jamais reformulée ni réinterprétée par `explainabilityBuilder.js`, seulement recopiée dans `businessRules[].description`.

`explainabilityBuilder.js` sépare `toolSteps` sur ce seul critère : les entrées SANS `synthetic` deviennent `dataUsed`/`toolsCalled` ("quelles données"/"quels Tools") ; les entrées AVEC `synthetic: true` deviennent `businessRules` ("quelles règles métier"). Une seule ligne de filtrage, jamais une heuristique fragile sur le nom du Tool.

## Les 4 champs de `explainability`

| Champ | Répond à | Construit à partir de |
|---|---|---|
| `reasoning` (string) | Pourquoi cette réponse | `mode`/`agentName` (qui a traité la demande) + `toolsCalled` (quelles données ont été interrogées) + `businessRules[].description` (quelle règle a été appliquée) + le nombre de citations RAG — une seule phrase composée, jamais une invention |
| `dataUsed` (`{tool, summary}[]`) | Quelles données ont été utilisées | Un résumé HONNÊTE de `toolStep.output` pour chaque Tool RÉEL (non `synthetic`) — voir `summarizeToolOutput()` ci-dessous |
| `toolsCalled` (`string[]`) | Quels AI Tools ont été appelés | Les noms de Tools RÉELS (non `synthetic`), dédupliqués |
| `businessRules` (`{rule, description}[]`) | Quelles règles métier ont été appliquées | Chaque `toolStep` marqué `synthetic: true`, `rule` = son nom, `description` = la phrase déjà écrite par l'Agent |

## `summarizeToolOutput()` — un résumé honnête, jamais une invention de sens métier

`explainabilityBuilder.js` ne connaît RIEN du sens métier des 74 Tools MCP existants — il ne peut donc pas écrire "12 projets en retard récupérés", seulement des faits structurels vérifiables sur la FORME du résultat :
- déjà une chaîne de caractères non vide, sans préfixe `"Error:"` → reprise TELLE QUELLE (plusieurs Agents — `ProjectAgent`, `DataQualityAgent`, `RecommendationAgent` — résument déjà leur propre `toolStep.output` en une phrase humaine, ex. `"12 projet(s) analysé(s)"` ; jamais remplacée par un texte générique qui en dirait moins) ;
- une chaîne préfixée `"Error:"` (un Tool en meilleur effort qui a échoué, voir `KpiAgent`/`BusinessAnalystAgent`) → `"Échec : <message>"`, jamais masqué ;
- un tableau → son nombre d'éléments ;
- un objet avec un champ `.data` tableau (la forme `list_projects`/beaucoup de Tools MCP) → le nombre d'enregistrements (+ le total réel si la pagination masque des résultats supplémentaires) ;
- un objet quelconque → la liste de ses champs (au plus 5, tronquée honnêtement avec `"..."`) — jamais leur signification devinée ;
- `null`/`undefined`/valeur primitive → une phrase honnête générique, jamais un chiffre fabriqué.

## Transparence même sur un refus — la partie souvent oubliée

"Le Copilot doit être transparent" ne s'arrête pas aux réponses réussies. `explainability` est calculé aussi pour `mode: "error"` (`buildErrorExplainability(error)` — explique le message d'erreur réel, jamais un champ vide sans justification) et `mode: "clarification"` (`buildClarificationExplainability()` — explique qu'une référence/correction a été détectée sans sujet antérieur connu, voir `CONVERSATION_CONTEXT.md`). Avant cette passe, `explanation` était `null` en dur dans ces deux cas — un refus restait silencieux sur son propre "pourquoi".

## Ce qui n'a pas été fait (délibérément)

- **Pas de traçabilité au niveau `reasoning/*.js`** (ex. un `ruleId` formel type `RULE_042` à l'intérieur de `projectAttentionAnalyzer.js`) — la granularité choisie est "une étape de raisonnement par Agent/domaine", pas "chaque règle interne individuelle" ; suffisant pour répondre aux 4 questions demandées sans réécrire les modules `reasoning/` existants.
- **Pas de résumé du CONTENU métier d'un Tool réel** (`dataUsed[].summary` reste structurel — "N enregistrements récupérés", jamais "N projets en retard") — l'écrire nécessiterait qu'`explainabilityBuilder.js` connaisse la sémantique de 74 Tools différents, un couplage fort et fragile ; le contenu métier réel reste dans `businessRules`/`answer`, où il est déjà écrit par l'Agent qui le connaît.
- **`AssistantAgent`/`CrmAssistantAgent`/`CommercialAgent`/`PipelineAgent`/`MaintenanceAgent`/`IndustrialAgent`/`NotificationAgent`/`ReportingAgent`/`AdvancedSearchAgent`/`AutomationAgent`** ne produisent aucune étape `synthetic` — soit parce qu'ils n'ont pas de raisonnement déterministe propre (chemin `BaseAgent` générique, tool-calling piloté par le modèle), soit parce que leur traçabilité complète est déjà assurée autrement (`AdvancedSearchAgent` documente chaque critère de recherche dans `answer` lui-même, `AutomationAgent` ne trace que de VRAIS Tools, jamais exécutés sans confirmation — voir `AUTOMATION_WORKFLOWS.md`). `businessRules` reste honnêtement vide pour eux, jamais une règle inventée pour "avoir quelque chose à montrer".

## Tests

- `test/ai.orchestrator.explainabilityBuilder.test.js` (29 tests) : présence garantie (jamais `null`), chacun des 4 champs isolément (reasoning composé correctement selon le mode, dataUsed/toolsCalled excluent les étapes `synthetic`, businessRules ne relit que les étapes `synthetic` avec leur `description`), `summarizeToolOutput()` sur chaque forme de sortie (chaîne déjà résumée, erreur, tableau, objet `.data`, objet quelconque tronqué à 5 champs, valeurs primitives), transparence sur l'échec/l'ambiguïté.
- `test/ai.orchestrator.responseBuilder.test.js` : `explainability` câblé dans les 3 méthodes (`build`/`buildErrorResponse`/`buildClarificationResponse`), toujours non-null.
- `test/ai.agents.projectAgent.test.js`/`ai.agents.dataQualityAgent.test.js`/`ai.agents.kpiAgent.test.js`/`ai.agents.businessAnalystAgent.test.js`/`ai.agents.recommendationAgent.test.js` : chaque étape synthétique porte bien `synthetic: true` + une `description`, jamais le Tool réel voisin.
- `test/ai.explainability.engine.test.js` (nouveau, 6 tests) : bout-en-bout avec un VRAI `AIManager`/`IntentDetector`/Agents — `ProjectAgent` (règle métier réelle tracée, données réelles résumées), `DataQualityAgent` (Score Qualité dans `businessRules`), `BusinessAnalystAgent` (une règle par domaine analysé), un refus de permission (mode `error`, explainability explique pourquoi), un chemin RAG (documentation).
