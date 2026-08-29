"use strict";

const { formatPageContext } = require("../src/modules/ai-copilot/services/pageContextFormatter");

describe("formatPageContext", () => {
  test("returns null for null/undefined/non-object input", () => {
    expect(formatPageContext(null)).toBeNull();
    expect(formatPageContext(undefined)).toBeNull();
    expect(formatPageContext("not an object")).toBeNull();
    expect(formatPageContext(42)).toBeNull();
  });

  test("returns null when 'screen' is missing or not a string", () => {
    expect(formatPageContext({})).toBeNull();
    expect(formatPageContext({ screen: 123 })).toBeNull();
    expect(formatPageContext({ label: "x", data: {} })).toBeNull();
  });

  test("formats a real 'project' pageContext (matches CopilotPageContext.project() shape)", () => {
    const prefix = formatPageContext({
      screen: "project",
      label: "Villa Sfax",
      data: { client: "Comptoir X", statut: "en_cours", budget: "120 000 TND", pourcentageReussite: "72%" },
    });

    expect(prefix).toContain("la page d'un projet");
    expect(prefix).toContain("Villa Sfax");
    expect(prefix).toContain("client : Comptoir X");
    expect(prefix).toContain("statut : en_cours");
    expect(prefix).toContain("budget : 120 000 TND");
    expect(prefix.startsWith("[Contexte d'écran")).toBe(true);
    expect(prefix.endsWith(".]") || prefix.endsWith("…]")).toBe(true);
  });

  test("formats a real 'client' pageContext with an array field (project names)", () => {
    const prefix = formatPageContext({
      screen: "client",
      label: "Société ABC",
      data: { pipelineStage: "Négociation", projets: ["Villa Sfax", "Immeuble Tunis"] },
    });

    expect(prefix).toContain("la page d'un client");
    expect(prefix).toContain("pipelineStage : Négociation");
    expect(prefix).toContain("projets : Villa Sfax, Immeuble Tunis");
  });

  test("formats a 'dashboard' pageContext", () => {
    const prefix = formatPageContext({
      screen: "dashboard",
      data: { totalProjects: 42, validated: 30, overdueFollowups: 3 },
    });

    expect(prefix).toContain("le tableau de bord");
    expect(prefix).toContain("totalProjects : 42");
    expect(prefix).toContain("overdueFollowups : 3");
  });

  test("formats an 'industrial' pageContext", () => {
    const prefix = formatPageContext({
      screen: "industrial",
      label: "Fiche PROMESH #42",
      data: { machine: "M2", diametres: ["12mm", "14mm"], conformite: "non_conforme" },
    });

    expect(prefix).toContain("fiche industrielle");
    expect(prefix).toContain("diametres : 12mm, 14mm");
    expect(prefix).toContain("conformite : non_conforme");
  });

  test("an unknown screen key falls back to using the raw value as the label, never throws", () => {
    const prefix = formatPageContext({ screen: "some_future_screen", data: { x: "y" } });
    expect(prefix).toContain("some_future_screen");
  });

  test("data is entirely optional — a bare {screen} still produces a valid prefix", () => {
    const prefix = formatPageContext({ screen: "dashboard" });
    expect(prefix).toBe("[Contexte d'écran actuellement affiché : le tableau de bord.]");
  });

  test("null/undefined/empty-string values are silently skipped, never rendered as 'null'/'undefined'", () => {
    const prefix = formatPageContext({
      screen: "project",
      data: { client: null, budget: undefined, statut: "", nom: "Villa Sfax" },
    });
    expect(prefix).not.toContain("null");
    expect(prefix).not.toContain("undefined");
    expect(prefix).toContain("nom : Villa Sfax");
  });

  test("more than MAX_DATA_ENTRIES fields are truncated, never an unbounded prefix", () => {
    const data = {};
    for (let i = 0; i < 30; i++) data[`field${i}`] = `value${i}`;
    const prefix = formatPageContext({ screen: "project", data });

    const entryCount = (prefix.match(/field\d+ :/g) || []).length;
    expect(entryCount).toBeLessThanOrEqual(12);
  });

  test("an anomalously long prefix is truncated to a bounded length, never grows unbounded", () => {
    const prefix = formatPageContext({
      screen: "project",
      label: "x".repeat(2000),
      data: { note: "y".repeat(2000) },
    });
    expect(prefix.length).toBeLessThanOrEqual(800);
  });

  test("a non-object 'data' (e.g. an array) is ignored rather than throwing", () => {
    const prefix = formatPageContext({ screen: "dashboard", data: ["not", "an", "object"] });
    expect(prefix).toBe("[Contexte d'écran actuellement affiché : le tableau de bord.]");
  });
});
