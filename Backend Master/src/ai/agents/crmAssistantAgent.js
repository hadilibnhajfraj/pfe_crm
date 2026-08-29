"use strict";

const { BaseAgent } = require("./baseAgent");

const SYSTEM_PROMPT = [
  "Tu es le CRM Assistant du CRM CBI Tunisia : un collaborateur expérimenté qui",
  "aide les utilisateurs à UTILISER le logiciel — pas à interroger les données",
  "métier (un autre Agent s'en charge). Tu connais tous les modules, tous les",
  "écrans, tous les champs de formulaire, tous les boutons, tous les workflows",
  "et toutes les règles de permission du CRM, tels que documentés.",
  "Réponds TOUJOURS en français, avec des explications simples et concrètes.",
  "Pour une question \"comment faire X\", guide l'utilisateur ÉTAPE PAR ÉTAPE",
  "(numérote les étapes), en citant les noms EXACTS des champs et des boutons",
  "tels qu'ils apparaissent à l'écran. Extrais les étapes concrètes du guide",
  "récupéré — ne dis JAMAIS simplement que le guide existe ou qu'il faut le",
  "consulter, cite son contenu réel. Si la documentation récupérée ne contient",
  "pas suffisamment d'informations pour répondre complètement, indique",
  "précisément ce qui manque plutôt qu'une réponse vague.",
  "Réponds UNIQUEMENT à partir de la documentation indexée (jamais des données",
  "métier du CRM, jamais un écran ou un champ qui n'y est pas décrit). Si la",
  "documentation ne couvre pas la question posée, dis-le explicitement plutôt",
  "que d'inventer un écran, un champ ou un bouton qui n'existe pas, et cite tes",
  "sources par leur numéro entre crochets.",
  "Tu expliques UNIQUEMENT — tu ne modifies, ne crées et ne supprimes jamais",
  "aucune donnée du CRM (tu n'as accès à aucun outil d'écriture), et tu ne",
  "prétends jamais avoir effectué une action à la place de l'utilisateur.",
].join(" ");

/**
 * # CrmAssistantAgent — le premier Agent métier : aider à UTILISER le CRM
 *
 * ## Rôle
 * Prend en charge l'intention `documentation_question` (remplace
 * `SearchAgent` dans `agents/manifest.js` — voir sa propre doc pour
 * pourquoi). Aucun Tool autorisé : répond exclusivement via le RAG
 * (`qaChain`/`RagContextBuilder`), qui ne lit jamais les données métier du
 * CRM (voir `rag/sourceGuard.js` et `test/ai.rag.policy.test.js`) — la
 * garantie "ne jamais inventer" vient de cette architecture, pas d'une
 * promesse du prompt seul : `SourceGuard` interdit structurellement tout
 * accès à `src/models`/`src/modules`/`src/routes`/`src/services`, donc ce
 * qui EST indexé est nécessairement de la documentation, jamais une donnée
 * client réelle.
 *
 * ## La base de connaissances
 * `docs/user-guide/` (déjà dans les racines RAG par défaut, voir
 * `rag/reindex.js::DEFAULT_CORPUS_ROOTS`) : un guide détaillé par parcours
 * demandé (créer un projet, créer un client, envoyer un devis, créer une
 * intervention, modifier une opportunité — objectif de l'écran, chaque
 * champ, chaque bouton, actions possibles, erreurs possibles, bonnes
 * pratiques) et une vue d'ensemble des autres modules. Voir
 * `CRM_ASSISTANT.md` pour la méthodologie complète (comment ce contenu a
 * été vérifié contre le vrai code Flutter/backend, pas inventé).
 *
 * ## Distinct des 11 autres Agents
 * Les 11 Agents spécialisés répondent à "quelles sont mes données" (des
 * projets en retard, des demandes RH en attente, ...) via des Tools MCP.
 * `CrmAssistantAgent` répond à "comment je fais X dans le logiciel" — un
 * guide d'usage, jamais une donnée réelle. Les deux peuvent coexister dans
 * la même conversation sans se marcher dessus : le routage se fait par
 * intention (`intentCatalog.js`), pas par ce fichier.
 */
function createCrmAssistantAgent({ chatModel, tools = [], workflowEngine, qaChain, memory = null, maxHistoryMessages, promptInjectionGuard = null }) {
  return new BaseAgent({
    name: "crm_assistant_agent",
    systemPrompt: SYSTEM_PROMPT,
    intentNames: ["documentation_question"],
    requiredRoles: [],
    allowedEmails: [],
    chatModel,
    tools,
    allowedToolNames: [],
    workflowEngine,
    qaChain,
    memory,
    maxHistoryMessages,
    promptInjectionGuard,
  });
}

module.exports = { createCrmAssistantAgent, SYSTEM_PROMPT };
