# Cost_Analysis.md — Coût IA (module `src/ai/`)

## 0. Avertissement méthodologique — à lire avant tout le reste de ce document

**Aucun fournisseur LLM n'est câblé dans ce système.** `AI_LLM_PROVIDER`/`AI_LLM_MODEL`/`AI_LLM_API_KEY` sont vides dans `.env.example` — c'est une décision explicite, documentée, non encore prise ("Sprint 0", voir `src/ai/README.md`). **Il n'existe donc aucune donnée de facturation réelle, aucun historique d'usage de tokens, aucune latence d'API mesurée.**

Tout ce qui suit est une **estimation architecturale** : calculée en lisant le code réel qui construit les prompts (taille exacte des gabarits, nombre réel de Tools, valeurs de configuration réelles par défaut), et en appliquant une heuristique de conversion standard (**1 token ≈ 4 caractères** pour du texte français/anglais) plus les grilles tarifaires publiques usuelles des familles de modèles GPT-4-class/Claude-class. Ces chiffres servent à **prioriser où optimiser avant de choisir un fournisseur**, pas à prédire une facture réelle.

---

## 1. Le poste de coût dominant : retransmission complète du prompt système à chaque tour

`src/ai/langchain/chains/toolCallingChain.js::buildSystemPrompt(tools)` construit un prompt listant **chaque Tool disponible avec son nom et sa description complète**. Ce texte devient le premier message (`SystemMessage`) de la conversation, et — comme pour **toute** API de chat-completion (OpenAI, Anthropic, ...), c'est le fonctionnement normal du protocole, pas un bug — l'intégralité de l'historique de messages, système compris, est retransmise à **chaque tour** de la boucle `for (turn < maxToolCalls)` (`toolCallingChain.js:115`, `maxToolCalls` par défaut = 5, `langchain/config.js`).

### Calcul réel, par Agent

| Agent | Tools autorisés (`allowedToolNames`) | Taille du prompt système (mesurée sur le texte réel) | Coût estimé pour 1 tour | Coût estimé pour 5 tours (pire cas) |
|---|---|---|---|---|
| `MaintenanceAgent` | 15 Tools (`agents/maintenanceAgent.js`) | 1742 caractères ≈ **436 tokens** | 436 tokens | ≈ 2180 tokens (juste pour le prompt système, répété) |
| `AutomationAgent` | **Aucune restriction** (`allowedToolNames: null` — seul Agent des 11 dans ce cas, par conception : "une automatisation peut légitimement enchaîner des actions de n'importe quel module") | Les **73 Tools MCP** réels : 7215 caractères + 309 de boilerplate = 7524 caractères ≈ **1881 tokens** | 1881 tokens | ≈ **9405 tokens** (juste pour le prompt système, répété 5 fois) |

**À titre de repère** (tarification indicative, à confirmer une fois un fournisseur choisi) : sur une famille de modèle "GPT-4-class" à environ 2,50 $/million de tokens en entrée, 9405 tokens de prompt système répété représentent environ **0,024 $ par conversation à 5 tours avec `AutomationAgent`** — modeste à l'unité, mais qui **multiplie linéairement avec le nombre d'utilisateurs et de tours**, exactement le scénario visé par "plusieurs centaines d'utilisateurs simultanés".

## 2. Où le prompt pourrait être réduit (optimisations proposées, non appliquées)

- **`AutomationAgent` envoie 73 Tools alors que `ToolRouter` (`orchestrator/toolRouter.js`, `maxCandidateTools` par défaut = 5, filtrage lexical par intention) existe déjà et fait exactement ce travail de réduction — mais n'est utilisé que par le chemin générique `WorkflowManager`, jamais par `BaseAgent`/`ToolCallingChain`.** Appliquer le même filtrage à `AutomationAgent` réduirait potentiellement le prompt système d'un facteur ~15× (73 → 5 Tools pertinents) pour la majorité des demandes. **Non implémenté** dans ce passage : `AutomationAgent` a été conçu délibérément sans liste blanche (voir son propre commentaire de code), et le filtrer risquerait de lui retirer l'accès à un Tool réellement nécessaire pour une demande légitime multi-module — un changement de comportement fonctionnel qui mérite d'être validé avec un vrai modèle branché, pas deviné.
- **Aucune réutilisation/cache du prompt système entre les appels.** `BaseAgent._run()` construit une nouvelle `ToolCallingChain` (donc reconstruit la chaîne de caractères du prompt système) à **chaque** `execute()`. Cela ne change PAS le coût en tokens envoyés à l'API (qui est inhérent au protocole chat), mais consomme un peu de CPU applicatif inutilement — un memoization par Agent (le prompt est déterministe pour un jeu de Tools fixe) éliminerait ce gaspillage marginal. Faible priorité.
- **Prompt caching natif du fournisseur** (ex. "prompt caching" côté Anthropic, mise en cache automatique côté OpenAI au-delà d'un certain volume) : une fois un `ILlmProvider` réel choisi, vérifier si le SDK du fournisseur expose une primitive de cache de préfixe de prompt — le prompt système étant identique d'un tour à l'autre pour un même Agent, c'est le candidat idéal pour ce mécanisme et réduirait le coût réel de manière beaucoup plus significative qu'une réduction manuelle du texte. **Recommandation la plus rentable, à évaluer dès le choix du fournisseur (Sprint 0).**

## 3. RAG / Embeddings — coût actuellement nul, par construction

- `HashingEmbeddingProvider` (`rag/embeddings/hashingEmbeddingProvider.js`) est un hachage de caractéristiques 100% local, déterministe — **aucun appel API, aucun coût**, confirmé en lisant le code.
- `RagContextBuilder` (`maxCitations` par défaut = 5, `rag/chunking/recursiveTextChunker.js` `chunkSize` par défaut = 800 caractères) : un tour RAG pleinement peuplé injecte environ 5 × 800 = 4000 caractères ≈ **1000 tokens** de citations dans le prompt — ce coût-là redeviendra réel (facturable) une fois un vrai fournisseur d'embeddings branché, mais reste un ordre de grandeur raisonnable comparé au prompt système d'`AutomationAgent`.
- `InMemoryVectorStore` : recherche par balayage linéaire, confirmé — sans coût API mais avec un coût CPU qui croît linéairement avec la taille du corpus. Le corpus actuel (`rag/reindex.js`, quelques fichiers de `docs/`) est de l'ordre de quelques centaines de chunks — largement en deçà du seuil (estimé à plusieurs dizaines de milliers de chunks) où ce balayage deviendrait un problème de latence perceptible.

## 4. Mémoire de conversation — borné, mais pas au niveau du message individuel

`ShortTermMemory` plafonne à 50 messages / TTL 30 minutes (`memory/config.js`) — la fenêtre globale est bornée. **Mais aucune fonction ne borne la longueur d'un message individuel** avant de l'injecter dans le prompt suivant (`BaseAgent._historyText`, `RagContextBuilder.renderContextText`) — une réponse très longue générée par `SummarizationChain` (utilisée par `ReportingAgent`) reste dans l'historique en texte intégral jusqu'à sa sortie naturelle de la fenêtre. Risque : un pic de coût ponctuel après une réponse inhabituellement longue, pas une fuite non bornée.

## 5. Retries / timeouts — non applicable aujourd'hui

`services/llmProvider.interface.js::ILlmProvider` est un contrat abstrait (`NotImplementedError`) — aucune politique de retry/backoff/timeout n'existe, car il n'y a pas encore d'adaptateur concret à retenter. **Ce n'est pas un manque à corriger maintenant** — à spécifier au moment du choix du fournisseur (Sprint 0), avec une attention particulière aux erreurs 429 (rate limit du fournisseur), déjà bien gérées ailleurs dans ce même code base pour l'envoi d'e-mails (`services/emailQueue.service.js`, backoff 30s/1min/2min/5min) — un pattern directement réutilisable.

## 6. Recommandations, par ordre de priorité une fois un fournisseur choisi

1. **Activer le prompt caching natif du fournisseur** dès que possible (§2) — le plus gros gain, le moins risqué.
2. **Appliquer `ToolRouter` (ou équivalent) au chemin `BaseAgent`**, pas seulement à `WorkflowManager` — réduit le nombre de Tools listés dans chaque prompt système, en particulier pour `AutomationAgent`.
3. **Réduire `LANGCHAIN_MAX_TOOL_CALLS`** (défaut 5) si l'usage réel montre que la plupart des demandes se résolvent en 1-2 tours — chaque tour économisé élimine une retransmission complète du prompt système.
4. **Mesurer réellement** dès qu'un fournisseur est branché — remplacer ce document par des chiffres de facturation réels, ces estimations n'ont de valeur que jusque-là.
