"use strict";

// « Quels projets nécessitent une relance ? » doit atteindre l'agent projets
// avec le filtre « sans relance », et non l'agent des contacts commerciaux.
// Détecteur d'intentions et extracteur d'entités RÉELS ; aucune base, aucun
// modèle, aucun réseau.

const { createLexicalIntentDetector } = require("../src/ai/orchestrator/intentDetector");
const { extractEntities } = require("../src/ai/orchestrator/entityExtractor");
const { applyCommercialRelanceOverride, isAboutProjectsOnly } = require("../src/ai/orchestrator/commercialRelanceOverride");

const detector = createLexicalIntentDetector();
const intentOf = async (message) => (await detector.detect(message, {})).name;

describe("routage — relance de PROJETS", () => {
  test.each([
    "Quels projets nécessitent une relance ?",
    "Quels projets dois-je relancer ?",
    "Projets à relancer",
    "Y a-t-il des projets sans relance ?",
    "Quels projets n'ont pas été relancés depuis 30 jours ?",
  ])("« %s » → projects", async (message) => {
    expect(await intentOf(message)).toBe("projects");
  });
});

describe("routage — relance de CONTACTS : comportement d'origine conservé", () => {
  test.each([
    "Quels sont mes clients en retard de relance ?",
    "Quels clients dois-je relancer cette semaine ?",
    "Montre-moi mes relances prioritaires",
    "Quels contacts nécessitent une relance ?",
    "Relance les clients.",
    // Nomme un projet ET des clients : la question porte sur les clients.
    "Relance les clients du projet Alpha",
  ])("« %s » → commercial_contacts", async (message) => {
    expect(await intentOf(message)).toBe("commercial_contacts");
  });
});

describe("applyCommercialRelanceOverride", () => {
  const catalog = new Map([["projects", {}], ["commercial_contacts", {}]]);

  test("ne touche jamais une autre clé que projects", () => {
    expect(applyCommercialRelanceOverride("Quels projets nécessitent une relance ?", "dashboard", catalog)).toBe("dashboard");
    expect(applyCommercialRelanceOverride("clients en retard de relance", "commercial_contacts", catalog)).toBe("commercial_contacts");
  });

  test("sans le mot relance, projects reste projects", () => {
    expect(applyCommercialRelanceOverride("Quels projets sont en retard ?", "projects", catalog)).toBe("projects");
  });

  test("sans commercial_contacts au catalogue, aucune bascule", () => {
    expect(applyCommercialRelanceOverride("clients en retard de relance", "projects", new Map([["projects", {}]]))).toBe("projects");
  });

  test("isAboutProjectsOnly : projet nommé et aucun client, contact ni prospect", () => {
    expect(isAboutProjectsOnly("Quels projets nécessitent une relance ?")).toBe(true);
    expect(isAboutProjectsOnly("Relance les clients du projet Alpha")).toBe(false);
    expect(isAboutProjectsOnly("Mes relances prioritaires")).toBe(false);
  });
});

describe("extraction — besoin de relance exprimé à l'affirmative", () => {
  test.each([
    ["Quels projets nécessitent une relance ?", 30],
    ["Quels projets dois-je relancer ?", 30],
    ["Projets à relancer", 30],
    ["Quels projets ont besoin d'une relance ?", 30],
    ["Quels projets n'ont pas été relancés depuis 15 jours ?", 15],
  ])("« %s » → filtre sans relance depuis %i jours", (message, days) => {
    expect(extractEntities(message).relance).toEqual({ notRelancedWithinDays: days });
  });

  test("une question sur des clients ou des contacts garde son interprétation", () => {
    const week = extractEntities("Quels clients dois-je relancer cette semaine ?");
    expect(week.relance).toBeNull();
    expect(week.period).not.toBeNull();
    expect(extractEntities("Quels contacts nécessitent une relance ?").relance).toBeNull();
  });

  test("une question projet sans notion de relance n'active pas le filtre", () => {
    expect(extractEntities("Quels projets sont en retard ?").relance).toBeNull();
    expect(extractEntities("Combien de projets par statut ?").relance).toBeNull();
  });
});
