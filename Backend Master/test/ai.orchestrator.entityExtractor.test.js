"use strict";

// Phase 1 — compréhension naturelle : extraction DÉTERMINISTE des entités et
// paramètres (orchestrator/entityExtractor.js). Aucune valeur inventée : un
// statut n'est reconnu que s'il fait partie des 11 valeurs réelles du CRM.

const { extractEntities, RECENT_DAYS } = require("../src/ai/orchestrator/entityExtractor");
const { KNOWN_STATUS_VALUES } = require("../src/ai/reasoning/projectStatuses");

const NOW = new Date("2026-09-30T10:00:00"); // mercredi

describe("entityExtractor — entités et paramètres", () => {
  test("« Montre-moi les projets PROBAR créés ce mois-ci par Ahmed » → structure interne attendue", () => {
    const e = extractEntities("Montre-moi les projets PROBAR créés ce mois-ci par Ahmed", { now: NOW });
    expect(e.entityType).toBe("project");
    expect(e.product).toBe("PROBAR");
    expect(e.period.key).toBe("this_month");
    expect(e.period.from.getDate()).toBe(1);
    expect(e.person).toBe("Ahmed");
    expect(e.hasFilters).toBe(true);
  });

  test.each([
    ["Quels sont mes projets ?"],
    ["Montre-moi les projets que je suis actuellement en train de suivre."],
    ["Je veux voir les projets dont je m'occupe."],
    ["Quels projets sont actuellement sous ma responsabilité ?"],
    ["Quels dossiers sont à ma charge ?"],
  ])("%s → entité projet, périmètre « mine »", (message) => {
    const e = extractEntities(message, { now: NOW });
    expect(e.entityType).toBe("project");
    expect(e.ownership).toBe("mine");
  });

  test("synonymes métier : dossiers / affaires / chantiers = projets", () => {
    for (const word of ["dossiers", "affaires", "chantiers"]) {
      expect(extractEntities(`Liste mes ${word}`, { now: NOW }).entityType).toBe("project");
    }
  });

  test("statuts : seules les valeurs réelles du CRM, pluriel/accents tolérés", () => {
    expect(extractEntities("Quels sont ceux qui sont encore en cours ?").status).toBe("En cours");
    expect(extractEntities("Les projets terminés").status).toBe("Terminé");
    expect(extractEntities("les projets en negociation").status).toBe("Négociation");
    expect(extractEntities("les projets gelés").status).toBeNull(); // valeur inexistante → jamais devinée
    for (const value of KNOWN_STATUS_VALUES) {
      expect(extractEntities(`statut ${value}`).status).toBe(value);
    }
  });

  test("« n'ont pas été relancés récemment » → filtre relance (30 jours par défaut, jamais caché)", () => {
    const e = extractEntities("Et lesquels n'ont pas été relancés récemment ?", { now: NOW });
    expect(e.relance).toEqual({ notRelancedWithinDays: RECENT_DAYS });
    expect(e.period).toBeNull(); // « récemment » décrit la relance, pas une date de création
    expect(e.reference).toEqual({ kind: "set", marker: "lesquels" });
  });

  test("« sans relance depuis 45 jours » → délai explicite repris tel quel", () => {
    expect(extractEntities("Les projets sans relance depuis 45 jours").relance).toEqual({ notRelancedWithinDays: 45 });
  });

  test("références : celui-ci / celui-là (une entité) vs ceux-ci / les précédents / les projets concernés (un ensemble)", () => {
    expect(extractEntities("Ajoute une relance pour celui-ci").reference).toEqual({ kind: "single", marker: "celui-ci" });
    expect(extractEntities("Et celui-là ?").reference.kind).toBe("single");
    expect(extractEntities("Montre les précédents").reference.kind).toBe("set");
    expect(extractEntities("Relance les projets concernés").reference.kind).toBe("set");
    expect(extractEntities("Ceux de cette semaine").reference.kind).toBe("set");
  });

  test("ordinaux : le deuxième, la 3e, le dernier", () => {
    expect(extractEntities("Et le deuxième ?").ordinal).toBe(2);
    expect(extractEntities("Montre la 3e").ordinal).toBe(3);
    expect(extractEntities("Et le dernier ?").ordinal).toBe(-1);
  });

  test("périodes : aujourd'hui, cette semaine (depuis lundi), 7 derniers jours", () => {
    expect(extractEntities("les projets d'aujourd'hui", { now: NOW }).period.key).toBe("today");
    const week = extractEntities("Ceux de cette semaine", { now: NOW }).period;
    expect(week.key).toBe("this_week");
    expect(week.from.getDay()).toBe(1); // lundi
    const last = extractEntities("les projets des 7 derniers jours", { now: NOW }).period;
    expect(last).toMatchObject({ key: "last_n_days", days: 7 });
  });

  test("référence d'enregistrement, quantité, nom de fichier", () => {
    expect(extractEntities("Montre le projet PR-125").recordRef).toBe("PR-125");
    expect(extractEntities("les 5 premiers projets").quantity).toBe(5);
    expect(extractEntities("Résume le fichier rapport_q3.pdf").filename).toBe("rapport_q3.pdf");
  });

  test("message neutre → aucun champ inventé", () => {
    const e = extractEntities("Bonjour, tu vas bien ?", { now: NOW });
    expect(e).toMatchObject({ entityType: null, status: null, period: null, relance: null, product: null, person: null, ordinal: null, reference: null, hasFilters: false });
  });
});
