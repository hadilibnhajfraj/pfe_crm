# Génération de réponse — prompts système et ton par rôle

`langchain/prompts/responsePrompts.js` — étape 10 du workflow général (« générer une réponse naturelle », voir `orchestrator/WORKFLOW.md`), complétée par les principes explicitement demandés ici : professionnel, naturel, court, compréhensible, sans hallucination, toujours citer les données, expliquer le raisonnement, signaler une information manquante, ne jamais inventer.

## Les principes de base (`RESPONSE_PRINCIPLES`)

Toujours appliqués, quels que soient le rôle de l'utilisateur ou la Chain qui répond :

```
Réponds de façon professionnelle, naturelle, courte et facilement compréhensible.
Ne jamais halluciner ni inventer une donnée : si une information manque ou n'apparaît
pas dans les résultats fournis, dis-le explicitement plutôt que de deviner ou d'extrapoler.
Cite toujours les données, outils ou sources utilisés pour construire ta réponse.
Quand ta réponse combine plusieurs éléments (plusieurs outils, plusieurs sources),
explique brièvement ton raisonnement.
```

Une seule source de vérité, jamais dupliquée/réécrite différemment d'une Chain à l'autre — `QaChain` (RAG) et `ToolCallingChain` (Tool Calling) composent TOUTES LES DEUX ce même texte de base, chacune y ajoutant ses propres instructions spécifiques (voir plus bas).

## Les 5 tons par rôle (`ROLE_TONE_GUIDANCE`)

| Rôle | Ton |
|---|---|
| `admin` | Précis et factuel — les détails techniques (identifiants, statuts, dates exactes) sont utiles, pas superflus. |
| `commercial` | Concret, orienté résultat — met en avant les chiffres utiles à l'action (relances, opportunités, KPI de vente). |
| `rh` | Posé, respectueux de la confidentialité des données personnelles, sans détail au-delà de ce qui est demandé. |
| `maintenance` | Direct et opérationnel (état d'une panne, urgence, technicien assigné), va à l'essentiel. |
| `direction` | Synthèse de haut niveau (tendances, risques, chiffres clés), pas de détail opérationnel sauf demande explicite. |

Le ton adapte le **registre** de la réponse, jamais les principes de base : un ton "Direction" reste tout aussi rigoureux sur l'anti-hallucination et la citation des sources qu'un ton "Admin".

## `buildResponseSystemPrompt({ role, extra })`

```js
const { buildResponseSystemPrompt } = require("./responsePrompts");

buildResponseSystemPrompt({ role: "commercial" });
// RESPONSE_PRINCIPLES + le ton "commercial", séparés par une ligne vide

buildResponseSystemPrompt(); // ou { role: null }
// RESPONSE_PRINCIPLES seuls (aucune restriction de ton)

buildResponseSystemPrompt({ role: "un_role_crm_non_reconnu" });
// RESPONSE_PRINCIPLES seuls — un rôle CRM non reconnu (ex. "responsable_logistique_achat",
// qui ne fait pas partie des 5 tons demandés) n'est jamais une erreur

buildResponseSystemPrompt({ role: "maintenance", extra: "Instructions propres à la Chain appelante." });
// RESPONSE_PRINCIPLES + ton "maintenance" + instructions de la Chain, dans cet ordre
```

`role` est comparé insensible à la casse (`"Admin"` ≡ `"admin"`).

## Où c'est branché

| Composant | Comment |
|---|---|
| `QaChain` (langchain/chains/qaChain.js) | `role` optionnel au constructeur ; compose `RESPONSE_PRINCIPLES` + ton + les instructions RAG existantes (répondre uniquement à partir du contexte, citer par `[1]`/`[2]`, dire explicitement quand l'information n'est pas dans la documentation). |
| `ToolCallingChain` (langchain/chains/toolCallingChain.js) | `role` optionnel au constructeur ; `buildSystemPrompt(tools, role)` compose `RESPONSE_PRINCIPLES` + ton + le protocole JSON d'appel d'outil. **C'était le vrai manque avant cette passe** : le prompt système de cette Chain ne portait AUCUNE instruction de qualité de réponse — seulement le format JSON à respecter pour décider d'appeler un outil. Le texte de `final_answer.answer` n'était donc guidé ni sur le ton, ni sur l'anti-hallucination, ni sur la citation des outils utilisés. |
| `WorkflowManager` (orchestrator/workflowManager.js) | `role` optionnel au constructeur, transmis à chaque `ToolCallingChain` fraîchement construite dans `run()`. |
| `createLangChainPipeline` (langchain/pipeline.js) | `role` optionnel, **dérivé automatiquement de `actingUser.role`** par défaut — aucun appelant n'a besoin de le répéter explicitement ; un `role` passé explicitement l'emporte sur `actingUser.role`. |
| `createAiOrchestrator` (orchestrator/pipeline.js) | Transmet `role: actingUser.role` au `WorkflowManager` qu'il construit. |

Comportement par défaut strictement inchangé partout où `role` est omis (paramètre optionnel, `null` par défaut) — même discipline que `promptInjectionGuard`/`auditLog` dans le reste de ce kernel.

## Comment "citer les données" et "signaler une information manquante" sont réellement garantis

Un prompt système, seul, ne peut jamais **garantir** qu'un modèle réel l'applique à la lettre (aucun fournisseur LLM n'est branché à ce jour — voir `src/ai/README.md`). Ce kernel ne s'appuie donc pas uniquement sur l'instruction textuelle pour ces deux exigences — deux garde-fous **mécaniques**, calculés en code plutôt que laissés au modèle, existent déjà indépendamment :

- **Citer les données** : `citations` (`rag/citations/CitationBuilder`, chemin RAG) et `toolCalls`/`explanation` (`orchestrator/explanationBuilder.js`, chemin Tool Calling — voir `WORKFLOW.md` étape 11) sont calculés déterministiquement à partir de ce qui a RÉELLEMENT été consulté, jamais reformulés/inventés par le modèle.
- **Signaler une information manquante** : le prompt encourage le modèle à le dire explicitement (`RESPONSE_PRINCIPLES`, et la consigne RAG spécifique de `QaChain` : *"Je ne trouve pas cette information dans la documentation"*), mais en dernier recours c'est `ResponseBuilder`/`AIManager` qui renvoient une réponse `mode: "error"` propre (jamais un texte halluciné) dès qu'une étape échoue réellement (Tool introuvable, permission refusée, ...) — voir `WORKFLOW.md`.

## Ce qui n'a pas encore été fait (délibérément, dans cette passe)

Les 11 Agents spécialisés (`agents/*.js`) gardent chacun leur propre `SYSTEM_PROMPT` fixe par domaine (une décision antérieure à cette fonctionnalité — voir `src/ai/README.md`, « Les Agents spécialisés »). Le ton par rôle n'a **pas** été propagé à l'intérieur de ces 11 prompts dans cette passe : cela demanderait de relire et modifier 11 fichiers dont le contenu (le prompt métier de chaque Agent) est indépendant de cette fonctionnalité, un changement plus large que le périmètre de cette passe. `WorkflowManager` et `QaChain`/`ToolCallingChain` (le chemin générique, utilisé par les intentions `users`/`hr`/`por_promesh` qui n'ont pas d'Agent dédié, et par tout Agent qui construit sa PROPRE `ToolCallingChain` via `BaseAgent` sans passer par ce mécanisme) restent donc le point d'intégration réel de cette passe.

## Tests

- `test/ai.langchain.responsePrompts.test.js` — principes de base, les 5 tons, composition, casse, rôle non reconnu.
- `test/ai.langchain.chains.test.js` — `QaChain`/`ToolCallingChain` envoient réellement le prompt composé au modèle (vérifié sur les messages reçus par `llmProvider.complete()`), avec et sans rôle.
- `test/ai.langchain.pipeline.test.js` — dérivation automatique du rôle depuis `actingUser.role`, override explicite, comportement par défaut sans rôle.
- `test/ai.orchestrator.pipeline.test.js` — le rôle atteint bien `WorkflowManager` depuis la racine de composition de l'orchestrateur.
