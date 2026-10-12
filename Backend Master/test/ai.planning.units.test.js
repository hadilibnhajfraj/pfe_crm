"use strict";

// Phase 3 — briques du planificateur, testées isolément : TaskPlanner
// (compréhension + plan), contrats de Tools (résultats inventés/mal formés),
// ConfirmationManager (propriétaire, usage unique, expiration), PlanExecutor
// (timeouts, cible non observée, refus RBAC, échec partiel).

const crypto = require("crypto");
const { TaskPlanner, extractDueDate } = require("../src/ai/planning/taskPlanner");
const { PlanStep, STEP_STATUS } = require("../src/ai/planning/planStep");
const { ExecutionContext } = require("../src/ai/planning/executionContext");
const { PlanExecutor, PERMISSION_DENIED_CODE } = require("../src/ai/planning/planExecutor");
const { ConfirmationManager, classifyDecision } = require("../src/ai/planning/confirmationManager");
const { extractReadRows, WRITE_CONTRACTS, parseToolOutput, InvalidToolResultError } = require("../src/ai/planning/toolContracts");
const { PendingActionStore } = require("../src/ai/orchestrator/pendingActionStore");

const USER = { id: "u-1", role: "commercial" };
const NOW = new Date("2026-09-30T10:00:00Z");
const daysAgo = (n) => new Date(NOW.getTime() - n * 86400000).toISOString();
const uuid = () => crypto.randomUUID();

describe("TaskPlanner.detect — portée volontairement étroite", () => {
  const planner = new TaskPlanner({ now: () => NOW });

  test.each([
    "Trouve mes projets en cours sans relance depuis 30 jours et prépare une relance pour chacun.",
    "Liste mes projets en négociation et crée une activité appel pour chacun",
    "Trouve mes contacts à rappeler et programme une relance pour chacun",
    "Prépare une relance pour tous mes projets en cours",
  ])("demande composée reconnue : %s", (message) => expect(planner.detect(message)).toBe(true));

  test.each([
    "Programme une relance pour le contact Ahmed", // une cible nommée : Agent Commercial existant
    "Crée une relance pour le projet Sfax Port",
    "Relance les clients.", // suggestion Flutter existante (smart-13)
    "Relance tous mes contacts commerciaux en attente depuis une semaine.", // com-35
    "Montre-moi mes projets en cours",
    "Quels projets n'ont pas été relancés depuis 30 jours ?",
    "Prépare une relance pour chacun", // aucune source identifiable
  ])("non capturée : %s", (message) => expect(planner.detect(message)).toBe(false));
});

describe("TaskPlanner.plan — plan READ → ANALYZE (+ gabarit WRITE)", () => {
  const planner = new TaskPlanner({ now: () => NOW });

  test("exemple de référence : lecture scopée « mine », statut, analyse relance > 30 j, relance datée", () => {
    const { plan } = planner.plan("Trouve mes projets en cours sans relance depuis 30 jours et prépare une relance pour chacun.", { user: USER });
    expect(plan.steps.map((s) => s.kind)).toEqual(["read", "analyze"]);
    expect(plan.steps[0]).toMatchObject({ tool: "list_projects", input: { mine: true, statut: "En cours", isArchived: false, limit: 100 } });
    expect(plan.criteria).toMatchObject({ status: "En cours", olderThanDays: 30 });
    expect(plan.action).toMatchObject({ tool: "create_project_action", label: "Relance", dueDate: "2026-10-01", dueDateExplicit: false });
  });

  test("admin sans « mes » : lecture non restreinte (le Tool applique de toute façon le périmètre du rôle)", () => {
    const { plan } = planner.plan("Trouve les projets en cours et prépare une relance pour chacun", { user: { id: "a", role: "admin" } });
    expect(plan.steps[0].input.mine).toBeUndefined();
  });

  test("contacts : Tool de lecture et d'écriture dédiés, statut « à rappeler »", () => {
    const { plan } = planner.plan("Trouve mes contacts à rappeler et programme une relance pour chacun dans 3 jours", { user: USER });
    expect(plan.steps[0]).toMatchObject({ tool: "get_my_commercial_contacts", input: { status: "rappeler_plus_tard", limit: 100 } });
    expect(plan.action).toMatchObject({ tool: "schedule_commercial_contact_relance", dueDate: "2026-10-03" });
  });

  test("action non disponible pour la source → refus explicite, aucun Tool inventé", () => {
    const result = planner.plan("Trouve mes contacts à rappeler et crée une visite pour chacun", { user: USER });
    expect(result.unsupported).toMatch(/seules les relances/);
  });

  test("dates : demain par défaut, « dans N jours », « le JJ/MM », « aujourd'hui »", () => {
    expect(extractDueDate("prepare une relance", NOW)).toEqual({ iso: "2026-10-01", explicit: false });
    expect(extractDueDate("dans 5 jours", NOW).iso).toBe("2026-10-05");
    expect(extractDueDate("pour le 15/10", NOW).iso).toBe("2026-10-15");
    expect(extractDueDate("aujourd'hui", NOW).iso).toBe("2026-09-30");
    expect(extractDueDate("le 31/02", NOW).iso).toBe("2026-10-01"); // date impossible → défaut
  });
});

describe("TaskPlanner.analyze / prepareWrites — uniquement des données lues", () => {
  const planner = new TaskPlanner({ now: () => NOW, maxWrites: 2 });
  const { plan } = planner.plan("Trouve mes projets en cours sans relance depuis 30 jours et prépare une relance pour chacun.", { user: USER });
  const rows = [
    { id: uuid(), nomProjet: "Récent", statut: "En cours", lastRelanceAt: daysAgo(5) },
    { id: uuid(), nomProjet: "Ancien", statut: "En cours", lastRelanceAt: daysAgo(45) },
    { id: uuid(), nomProjet: "Jamais", statut: "En cours", lastRelanceAt: null },
    { id: uuid(), nomProjet: "Autre statut", statut: "Terminé", lastRelanceAt: null },
    { id: uuid(), nomProjet: "Très ancien", statut: "En Cours", lastRelanceAt: daysAgo(90) },
  ];

  test("filtre statut (sans casse/accents) + relance > 30 j ou jamais ; les plus anciens d'abord", () => {
    const analysis = planner.analyze(plan, rows);
    expect(analysis.kept.map((r) => r.nomProjet)).toEqual(["Jamais", "Très ancien", "Ancien"]);
    expect(analysis.excluded).toBe(2);
  });

  test("une écriture par ligne, paramètres issus de la ligne ; plafond de sécurité respecté", () => {
    const analysis = planner.analyze(plan, rows);
    const prepared = planner.prepareWrites(plan, analysis.kept);
    expect(prepared).toMatchObject({ truncated: true, totalCandidates: 3 });
    expect(prepared.steps).toHaveLength(2);
    expect(prepared.steps[0]).toMatchObject({
      kind: "write",
      tool: "create_project_action",
      target: { entityType: "project", id: analysis.kept[0].id, label: "Jamais" },
      input: { projectId: analysis.kept[0].id, typeAction: "Relance", dateRelance: "2026-10-01", priorite: "normale" },
    });
    expect(prepared.steps[0].input.commentaire).toMatch(/sans relance depuis plus de 30 jours/);
  });
});

describe("classifyDecision — seuls « confirme » / « annule », courts et sans négation", () => {
  test.each([
    ["confirme", "confirm"],
    ["Oui, je confirme.", "confirm"],
    ["Confirmé !", "confirm"],
    ["annule", "cancel"],
    ["Non, annule tout", "cancel"],
    ["ne confirme pas", null],
    ["confirme ou annule ?", null],
    ["oui", null],
    ["Peux-tu me confirmer le nombre de projets en cours dans le pipeline commercial ce mois-ci ?", null],
  ])("%s → %s", (message, expected) => expect(classifyDecision(message)).toBe(expected));
});

describe("ConfirmationManager — sur le PendingActionStore partagé", () => {
  const step = () => new PlanStep({ id: "step_3", kind: "write", tool: "create_project_action", input: { projectId: "p" }, target: { entityType: "project", id: "p", label: "P" }, description: "Relance — P" });

  test("lié au propriétaire : un autre utilisateur ne voit ni ne consomme le plan", () => {
    const store = new PendingActionStore();
    const cm = new ConfirmationManager({ store });
    cm.request({ conversationId: "c", user: USER, goal: "g", writeSteps: [step()] });
    expect(cm.pendingFor("c", { id: "intrus", role: "admin" })).toBeNull();
    expect(cm.take("c", { id: "intrus", role: "admin" })).toBeNull();
    expect(cm.pendingFor("c", USER)).toMatchObject({ type: "task_plan", actingUserId: "u-1" });
  });

  test("usage unique, et ignore les propositions d'un autre type (réunion)", () => {
    const store = new PendingActionStore();
    const cm = new ConfirmationManager({ store });
    cm.request({ conversationId: "c", user: USER, goal: "g", writeSteps: [step()] });
    expect(cm.take("c", USER)).not.toBeNull();
    expect(cm.take("c", USER)).toBeNull();
    store.propose("c", { type: "create_meeting", actingUserId: "u-1" });
    expect(cm.pendingFor("c", USER)).toBeNull();
  });

  test("expiration : un plan trop ancien n'est plus exécutable", () => {
    let t = 0;
    const store = new PendingActionStore({ ttlMs: 1000, now: () => t });
    const cm = new ConfirmationManager({ store });
    cm.request({ conversationId: "c", user: USER, goal: "g", writeSteps: [step()] });
    t = 1001;
    expect(cm.take("c", USER)).toBeNull();
    expect(cm.ttlMinutes).toBe(0);
  });
});

describe("Contrats de Tools — un résultat inventé ou mal formé n'est jamais cru", () => {
  test("lecture : ligne sans UUID → tout le résultat est rejeté", () => {
    expect(() => extractReadRows("list_projects", { data: [{ id: uuid() }, { id: "PRJ-12" }] })).toThrow(InvalidToolResultError);
    expect(() => extractReadRows("list_projects", { rows: [] })).toThrow(/champ "data" absent/);
    expect(() => extractReadRows("delete_everything", { data: [] })).toThrow(/non autorisé/);
    expect(() => parseToolOutput("list_projects", "J'ai trouvé 3 projets")).toThrow(/non JSON/);
  });

  test("écriture : succès seulement avec l'enregistrement créé", () => {
    expect(WRITE_CONTRACTS.create_project_action.verify({ id: uuid() }).ok).toBe(true);
    expect(WRITE_CONTRACTS.create_project_action.verify({ success: true })).toEqual({ ok: false, reason: "aucun enregistrement renvoyé par le service" });
    expect(WRITE_CONTRACTS.schedule_commercial_contact_relance.verify({ ok: false, reason: "forbidden" })).toEqual({ ok: false, reason: "accès refusé à ce contact" });
    expect(WRITE_CONTRACTS.schedule_commercial_contact_relance.verify({ ok: true, relance: { id: "r1" } })).toEqual({ ok: true, recordId: "r1" });
  });
});

describe("PlanExecutor", () => {
  const ctxFor = (opts = {}) => new ExecutionContext({ user: USER, conversationId: "c", ...opts });
  const writeStep = (id, projectId = id) =>
    new PlanStep({ id: `w-${id}`, kind: "write", tool: "create_project_action", input: { projectId }, target: { entityType: "project", id, label: id }, description: `Relance — ${id}` });

  test("lecture en délai dépassé → timeout, aucune ligne observée", async () => {
    const tools = [{ name: "list_projects", invoke: () => new Promise(() => {}) }];
    const ctx = ctxFor({ stepTimeoutMs: 20 });
    const read = new PlanStep({ id: "r", kind: "read", tool: "list_projects", input: {}, description: "lire" });
    const { rows } = await new PlanExecutor({ tools }).runRead(read, ctx);
    expect(rows).toBeNull();
    expect(read.status).toBe(STEP_STATUS.TIMEOUT);
  });

  test("refus RBAC (code JSON-RPC PERMISSION_DENIED) → denied", async () => {
    const tools = [{ name: "list_projects", invoke: async () => { throw Object.assign(new Error("Role \"x\" is not allowed to call tool \"list_projects\"."), { code: PERMISSION_DENIED_CODE }); } }];
    const read = new PlanStep({ id: "r", kind: "read", tool: "list_projects", input: {}, description: "lire" });
    await new PlanExecutor({ tools }).runRead(read, ctxFor());
    expect(read.status).toBe(STEP_STATUS.DENIED);
    expect(read.error).toMatch(/permission refusée par le serveur/);
  });

  test("écriture vers une cible jamais lue → refusée sans appeler le Tool", async () => {
    const invoke = jest.fn();
    const ctx = ctxFor();
    const a = uuid();
    ctx.observe("project", [{ id: a }]);
    const forged = writeStep(a, uuid()); // input.projectId ≠ cible lue
    const unknown = writeStep(uuid());
    await new PlanExecutor({ tools: [{ name: "create_project_action", invoke }] }).runWrites([forged, unknown], ctx);
    expect(invoke).not.toHaveBeenCalled();
    expect(forged.error).toMatch(/aucune lecture réelle/);
    expect(unknown.status).toBe(STEP_STATUS.FAILED);
  });

  test("échec partiel : chaque écriture porte son propre résultat réel", async () => {
    const [a, b, c] = [uuid(), uuid(), uuid()];
    const recordId = uuid();
    const invoke = jest.fn(async ({ projectId }) => {
      if (projectId === a) return JSON.stringify({ id: recordId });
      if (projectId === b) throw new Error("Project not found");
      return JSON.stringify({ ok: true }); // pas d'enregistrement : pas un succès
    });
    const ctx = ctxFor();
    ctx.observe("project", [{ id: a }, { id: b }, { id: c }]);
    const steps = [writeStep(a), writeStep(b), writeStep(c)];
    await new PlanExecutor({ tools: [{ name: "create_project_action", invoke }] }).runWrites(steps, ctx);
    expect(steps.map((s) => s.status)).toEqual(["done", "failed", "failed"]);
    expect(steps[0].recordId).toBe(recordId);
    expect(steps[1].error).toMatch(/Project not found/);
    expect(steps[2].error).toMatch(/aucun enregistrement/);
  });

  test("délai global dépassé : les écritures restantes ne sont pas lancées", async () => {
    let t = 0;
    const [a, b] = [uuid(), uuid()];
    const invoke = jest.fn(async () => {
      t += 1000;
      return { id: uuid() };
    });
    const ctx = ctxFor({ planTimeoutMs: 500, now: () => t });
    ctx.observe("project", [{ id: a }, { id: b }]);
    const steps = [writeStep(a), writeStep(b)];
    await new PlanExecutor({ tools: [{ name: "create_project_action", invoke }] }).runWrites(steps, ctx);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(steps[1]).toMatchObject({ status: "skipped" });
  });

  test("écriture en délai dépassé : statut timeout et avertissement honnête", async () => {
    const a = uuid();
    const ctx = ctxFor({ stepTimeoutMs: 20 });
    ctx.observe("project", [{ id: a }]);
    const step = writeStep(a);
    await new PlanExecutor({ tools: [{ name: "create_project_action", invoke: () => new Promise(() => {}) }] }).runWrites([step], ctx);
    expect(step.status).toBe(STEP_STATUS.TIMEOUT);
    expect(step.error).toMatch(/a pu aboutir côté serveur/);
  });
});
