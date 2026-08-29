"use strict";

const { buildResponseSystemPrompt, RESPONSE_PRINCIPLES, ROLE_TONE_GUIDANCE, SUPPORTED_ROLES } = require("../src/ai/langchain/prompts/responsePrompts");

describe("RESPONSE_PRINCIPLES — principes de base de génération de réponse", () => {
  test.each([
    "professionnelle",
    "naturelle",
    "courte",
    "compréhensible",
    "halluciner",
    "Cite",
    "raisonnement",
  ])("mentionne '%s'", (word) => {
    expect(RESPONSE_PRINCIPLES).toContain(word);
  });
});

describe("ROLE_TONE_GUIDANCE — les 5 rôles demandés", () => {
  test("expose exactement les 5 rôles demandés", () => {
    expect([...SUPPORTED_ROLES].sort()).toEqual(["admin", "commercial", "direction", "maintenance", "rh"].sort());
  });

  test("chaque rôle a une instruction de ton non vide, distincte des autres", () => {
    const values = Object.values(ROLE_TONE_GUIDANCE);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(v.length).toBeGreaterThan(0);
  });
});

describe("buildResponseSystemPrompt", () => {
  test("sans rôle : seuls les principes de base sont présents", () => {
    const prompt = buildResponseSystemPrompt();
    expect(prompt).toBe(RESPONSE_PRINCIPLES);
  });

  test("avec un rôle reconnu : le ton du rôle est ajouté après les principes de base", () => {
    const prompt = buildResponseSystemPrompt({ role: "admin" });
    expect(prompt).toContain(RESPONSE_PRINCIPLES);
    expect(prompt).toContain(ROLE_TONE_GUIDANCE.admin);
    expect(prompt.indexOf(RESPONSE_PRINCIPLES)).toBeLessThan(prompt.indexOf(ROLE_TONE_GUIDANCE.admin));
  });

  test.each(["admin", "commercial", "rh", "maintenance", "direction"])("reconnaît le rôle '%s'", (role) => {
    const prompt = buildResponseSystemPrompt({ role });
    expect(prompt).toContain(ROLE_TONE_GUIDANCE[role]);
  });

  test("insensible à la casse ('Admin' === 'admin')", () => {
    expect(buildResponseSystemPrompt({ role: "Admin" })).toBe(buildResponseSystemPrompt({ role: "admin" }));
  });

  test("un rôle CRM non reconnu (ex. 'responsable_logistique_achat') n'ajoute aucun ton, sans erreur", () => {
    const prompt = buildResponseSystemPrompt({ role: "responsable_logistique_achat" });
    expect(prompt).toBe(RESPONSE_PRINCIPLES);
  });

  test("'extra' (instructions propres à une Chain) est ajouté après les principes ET le ton", () => {
    const prompt = buildResponseSystemPrompt({ role: "commercial", extra: "Instruction spécifique à la Chain." });
    expect(prompt.endsWith("Instruction spécifique à la Chain.")).toBe(true);
  });

  test("sans role ni extra, renvoie exactement RESPONSE_PRINCIPLES (pas de séparateurs superflus)", () => {
    expect(buildResponseSystemPrompt({})).toBe(RESPONSE_PRINCIPLES);
  });
});
