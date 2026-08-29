"use strict";

/**
 * # Validation du Copilot — le corpus de 500 conversations réalistes
 *
 * Voir `src/ai/orchestrator/COPILOT_VALIDATION.md` pour la méthodologie
 * complète. Ce fichier est le "Tier 1" : pour CHAQUE scénario du corpus
 * (`test/fixtures/copilotValidationScenarios.js`), vérifie contre le VRAI
 * code de production (jamais une resimulation) :
 * - l'intention détectée (`IntentDetector` réel, `DEFAULT_INTENT_CATALOG` réel) ;
 * - l'Agent sélectionné (les 11 VRAIS Agents, construits via
 *   `agents/manifest.js::loadDefaultAgents`, avec de simples collaborateurs
 *   factices — aucun modèle LLM réel n'est nécessaire pour vérifier LE
 *   ROUTAGE) ;
 * - la permission attendue au niveau Agent (`isAuthorized()` réel) ;
 * - les AI Tools attendus : soit `allowedToolNames` du VRAI Agent (quand il
 *   y en a un — un ensemble fixe, indépendant du message), soit le VRAI
 *   `ToolRouter` (quand il n'y en a pas — `users`/`hr`/`por_promesh`,
 *   voir `agents/manifest.js`) ;
 * - la permission attendue au niveau Tool (`isAuthorized()` réel, contre la
 *   transcription du manifeste MCP — voir `copilotToolReference.js` pour
 *   pourquoi une transcription est nécessaire) ;
 * - le contexte attendu (`intent.requiresTools`/`requiresRag`, réels).
 *
 * "Produit une réponse cohérente" (bout-en-bout, avec un AIManager réel) est
 * du ressort du "Tier 2" — `test/ai.validation.copilotEndToEnd.test.js` —
 * volontairement un ÉCHANTILLON représentatif (un par intention/Agent
 * distinct), pas les 500 scénarios : une fois le CÂBLAGE prouvé correct
 * pour une intention donnée, il s'applique uniformément à toute variation
 * du message qui route vers la même intention — répéter le test bout-en-bout
 * 500 fois n'apporterait aucune garantie supplémentaire, voir
 * COPILOT_VALIDATION.md.
 */

const { SCENARIOS } = require("./fixtures/copilotValidationScenarios");
const { TOOL_PERMISSIONS, TOOL_MODULE_MAP } = require("./fixtures/copilotToolReference");
const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { DEFAULT_INTENT_CATALOG } = require("../src/ai/orchestrator/intentCatalog");
const { ToolRouter } = require("../src/ai/orchestrator/toolRouter");
const { AgentRegistry, loadDefaultAgents } = require("../src/ai/agents");
const { isAuthorized } = require("../src/ai/utils/authorization");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const intentDetector = createLexicalIntentDetector({ catalog: DEFAULT_INTENT_CATALOG });
const catalogByKey = new Map(DEFAULT_INTENT_CATALOG.map((entry) => [entry.key, entry]));

// Les 11 VRAIS Agents (agents/manifest.js), construits avec des
// collaborateurs factices — suffisant pour vérifier canHandle()/
// requiredRoles/allowedToolNames, jamais utilisés pour exécuter une chaîne
// réelle dans ce fichier (voir Tier 2 pour ça).
// AI-Business-Copilot/35_ROLE_CAPABILITY_AUDIT_AGENT.md — registre créé
// explicitement (jamais inline) : le 17e Agent (RoleCapabilityAuditAgent) a
// besoin d'une référence vers CE registre — jamais lue avant la fin de
// loadDefaultAgents() ci-dessous, aucun souci d'auto-référence.
const registry = new AgentRegistry();
const agentRegistry = loadDefaultAgents(registry, {
  chatModel: { invoke: jest.fn() },
  tools: [],
  workflowEngine: { run: jest.fn() },
  qaChain: { invoke: jest.fn() },
  summarizationChain: { invoke: jest.fn() },
  planner: { plan: jest.fn() },
  pendingActionStore: new PendingActionStore(),
  createCopilotMeeting: jest.fn(),
  memory: null,
  maxToolCalls: 5,
  maxHistoryMessages: 6,
  agentRegistry: registry,
  intentCatalog: DEFAULT_INTENT_CATALOG,
  toolPermissionIndex: new Map(Object.entries(TOOL_PERMISSIONS || {})),
  toolModuleIndex: new Map(Object.entries(TOOL_MODULE_MAP || {})),
  moduleAccessByRole: {},
});

// Un ToolRouter réel, alimenté par la transcription du manifeste MCP —
// nécessaire seulement pour les 3 intentions sans Agent dédié
// (users/hr/por_promesh, voir agents/manifest.js). maxTools volontairement
// large (au-delà du plus grand module, 15 Tools) : ce Tier vérifie le
// FILTRAGE PAR MODULE (la frontière dure), pas le classement lexical fin
// (qui dépendrait de vraies descriptions de Tools, absentes de cette
// transcription — voir copilotToolReference.js).
const allToolNames = Object.keys(TOOL_PERMISSIONS);
const toolModuleIndex = new Map(allToolNames.map((name) => [name, TOOL_MODULE_MAP[name]]));
const langchainLikeTools = allToolNames.map((name) => ({ name, description: name.replace(/_/g, " ") }));
const toolRouter = new ToolRouter({ tools: langchainLikeTools, toolModuleIndex, maxTools: 50 });

describe("Corpus de validation — au moins 500 conversations réalistes", () => {
  test("le corpus contient au moins 500 scénarios", () => {
    expect(SCENARIOS.length).toBeGreaterThanOrEqual(500);
  });

  test("chaque scénario est rattaché à une intention réelle du catalogue", () => {
    for (const s of SCENARIOS) {
      expect(catalogByKey.has(s.expectedIntent)).toBe(true);
    }
  });

  test("chaque Tool référencé (expectedTools/toolCheck) existe réellement dans le manifeste MCP", () => {
    for (const s of SCENARIOS) {
      for (const toolName of s.expectedTools) {
        expect(TOOL_PERMISSIONS).toHaveProperty(toolName);
      }
      if (s.toolCheck) expect(TOOL_PERMISSIONS).toHaveProperty(s.toolCheck.tool);
    }
  });

  test("les personas demandés explicitement (Commercial, Chef de projet, RH, Direction) sont bien représentés", () => {
    const byPersona = SCENARIOS.reduce((acc, s) => {
      acc[s.persona] = (acc[s.persona] || 0) + 1;
      return acc;
    }, {});
    expect(byPersona["Commercial"]).toBeGreaterThanOrEqual(10);
    expect(byPersona["Chef de projet"]).toBeGreaterThanOrEqual(10);
    expect(byPersona["RH"]).toBeGreaterThanOrEqual(10);
    expect(byPersona["Direction"]).toBeGreaterThanOrEqual(10);
  });
});

describe.each(SCENARIOS.map((s) => [s.id, s]))("Scénario %s", (_id, s) => {
  test(`1. intention attendue : "${s.expectedIntent}"`, async () => {
    const intent = await intentDetector.detect(s.message, { user: s.actingUser, conversationId: null });
    expect(intent.name).toBe(s.expectedIntent);
    expect(intent.moduleKey).toBe(s.expectedModuleKey);
  });

  test("2. contexte attendu (tools/rag)", () => {
    const catalogEntry = catalogByKey.get(s.expectedIntent);
    if (s.expectedContext === "rag") {
      expect(catalogEntry.requiresRag).toBe(true);
    } else if (s.expectedContext === "tools") {
      expect(catalogEntry.requiresTools).toBe(true);
    }
  });

  test("3. Agent attendu + permission attendue au niveau Agent", () => {
    const foundAgent = agentRegistry.findHandler({ name: s.expectedIntent });

    if (s.expectedAgent === null) {
      expect(foundAgent).toBeNull();
      return;
    }

    expect(foundAgent).not.toBeNull();
    expect(foundAgent.name).toBe(s.expectedAgent);

    const allowed = isAuthorized({ requiredRoles: foundAgent.requiredRoles, allowedEmails: foundAgent.allowedEmails }, s.actingUser);
    expect(allowed).toBe(s.expectedAgentAllowed);
  });

  test("4. AI Tools attendus", () => {
    if (s.expectedAgent) {
      const agent = agentRegistry.findHandler({ name: s.expectedIntent });
      if (agent.allowedToolNames === null) {
        // Agent sans liste blanche (ex. automation_agent) : rien de plus à
        // vérifier ici, son accès aux Tools n'est pas restreint par nom.
        return;
      }
      for (const toolName of s.expectedTools) {
        expect(agent.allowedToolNames).toContain(toolName);
      }
    } else {
      // Pas d'Agent dédié (users/hr/por_promesh) : le VRAI ToolRouter décide.
      const catalogEntry = catalogByKey.get(s.expectedIntent);
      const candidates = toolRouter.select(catalogEntry, s.message).map((t) => t.name);
      for (const toolName of s.expectedTools) {
        expect(candidates).toContain(toolName);
      }
    }
  });

  test("5. permission attendue au niveau Tool (quand une vérification ciblée est définie)", () => {
    if (!s.toolCheck) return;
    const permissions = TOOL_PERMISSIONS[s.toolCheck.tool];
    const allowed = isAuthorized(permissions, s.actingUser);
    expect(allowed).toBe(s.toolCheck.expectedAllowed);
  });
});
