"use strict";

const { SuggestionEngine } = require("../src/ai/orchestrator/suggestionEngine");
const { SUGGESTION_CATALOG, DIMENSION_SUGGESTION_TRIGGERS } = require("../src/ai/orchestrator/suggestionCatalog");

const OPEN_TOOL_PERMISSIONS = { requiredRoles: [], allowedEmails: [] };
const ADMIN_TOOL_PERMISSIONS = { requiredRoles: ["admin", "superadmin", "superadmin2"], allowedEmails: [] };

function toolPermissionIndex(overrides = {}) {
  return new Map([
    ["create_calendar_event", OPEN_TOOL_PERMISSIONS],
    ["send_notification_email", ADMIN_TOOL_PERMISSIONS],
    ["create_project_action", OPEN_TOOL_PERMISSIONS],
    ...Object.entries(overrides),
  ]);
}

function engine(overrides = {}) {
  return new SuggestionEngine({ toolPermissionIndex: toolPermissionIndex(), ...overrides });
}

const USER = { id: "u1", role: "user" };
const ADMIN = { id: "u2", role: "admin" };

describe("SuggestionEngine — l'exemple demandé (dimension 'retard')", () => {
  test("'retard' déclenche exactement les 4 actions de l'exemple, avec la raison du facteur", () => {
    const factors = [{ dimension: "retard", reason: "Relance en retard de 10 jour(s)" }];
    const suggestions = engine().suggestForFactors(factors, USER);

    expect(suggestions.map((s) => s.id).sort()).toEqual(["create_activity", "create_reminder", "prepare_email", "schedule_meeting"].sort());
    for (const s of suggestions) {
      expect(s.reason).toBe("Relance en retard de 10 jour(s)");
    }
  });
});

describe("SuggestionEngine — permissions (garantie n°1 : jamais montré, jamais juste désactivé)", () => {
  test("'notify_team' (adossé à send_notification_email, admin-tier) est écarté pour un rôle 'user'", () => {
    const suggestions = engine().suggestForFactors([{ dimension: "blocage", reason: "x" }], USER);
    expect(suggestions.map((s) => s.id)).not.toContain("notify_team");
    expect(suggestions.map((s) => s.id)).toContain("create_activity"); // le reste de la même dimension reste visible
  });

  test("'notify_team' est inclus pour un rôle 'admin'", () => {
    const suggestions = engine().suggestForFactors([{ dimension: "blocage", reason: "x" }], ADMIN);
    expect(suggestions.map((s) => s.id)).toContain("notify_team");
  });

  test("'schedule_meeting' (adossé à create_calendar_event, ouvert) reste visible même pour un rôle 'user'", () => {
    const suggestions = engine().suggestForFactors([{ dimension: "echeance", reason: "x" }], USER);
    expect(suggestions.map((s) => s.id)).toContain("schedule_meeting");
  });

  test("un utilisateur sans rôle défini ne voit AUCUNE suggestion, même les actions ouvertes", () => {
    const suggestions = engine().suggestForFactors([{ dimension: "retard", reason: "x" }], { id: "u3" });
    expect(suggestions).toEqual([]);
  });

  test("la règle de permission d'une action adossée à un Tool est résolue depuis toolPermissionIndex, pas depuis une valeur codée en dur ici", () => {
    const strictIndex = engine({ toolPermissionIndex: toolPermissionIndex({ create_calendar_event: ADMIN_TOOL_PERMISSIONS }) });
    const suggestions = strictIndex.suggestForFactors([{ dimension: "echeance", reason: "x" }], USER);
    expect(suggestions.map((s) => s.id)).not.toContain("schedule_meeting");
  });
});

describe("SuggestionEngine — dédoublonnage", () => {
  test("une action déclenchée par 2 dimensions différentes n'apparaît qu'une fois, avec la raison de la première dimension rencontrée", () => {
    const factors = [
      { dimension: "pipeline", reason: "Aucune étape de pipeline assignée" },
      { dimension: "activite", reason: "Aucune mise à jour depuis 40 jour(s)" },
    ];
    const suggestions = engine().suggestForFactors(factors, USER);
    const createActivity = suggestions.filter((s) => s.id === "create_activity");
    expect(createActivity).toHaveLength(1);
    expect(createActivity[0].reason).toBe("Aucune étape de pipeline assignée");
  });
});

describe("SuggestionEngine — robustesse", () => {
  test("un id de déclencheur absent du catalogue est ignoré, sans jamais planter", () => {
    const customEngine = engine({ triggers: { retard: ["create_activity", "id_qui_nexiste_pas"] } });
    const suggestions = customEngine.suggestForFactors([{ dimension: "retard", reason: "x" }], USER);
    expect(suggestions.map((s) => s.id)).toEqual(["create_activity"]);
  });

  test("une dimension sans déclencheur configuré ne produit aucune suggestion", () => {
    expect(engine().suggestForFactors([{ dimension: "inconnue", reason: "x" }], USER)).toEqual([]);
  });

  test("aucun facteur => aucune suggestion", () => {
    expect(engine().suggestForFactors([], USER)).toEqual([]);
  });
});

describe("SuggestionEngine — garantie n°2 : jamais rien d'exécutable", () => {
  test("chaque suggestion est un objet purement descriptif (id, label, reason) — un aller-retour JSON ne perd rien", () => {
    const suggestions = engine().suggestForFactors([{ dimension: "retard", reason: "x" }], USER);
    expect(suggestions.length).toBeGreaterThan(0);
    expect(JSON.parse(JSON.stringify(suggestions))).toEqual(suggestions);
    for (const s of suggestions) {
      expect(Object.keys(s).sort()).toEqual(["id", "label", "reason"]);
      for (const value of Object.values(s)) {
        expect(typeof value).toBe("string");
      }
    }
  });

  test("SuggestionEngine ne reçoit et n'expose aucune référence à un Tool invocable", () => {
    const instance = engine();
    expect(typeof instance.suggestForFactors).toBe("function");
    // Le seul état interne est un catalogue de données + un index de permissions
    // (aussi des données) — jamais un Tool/chatModel/workflowEngine.
    expect(instance.catalog).toBe(SUGGESTION_CATALOG);
    expect(instance.triggers).toBe(DIMENSION_SUGGESTION_TRIGGERS);
    expect(instance.toolPermissionIndex).toBeInstanceOf(Map);
  });
});
