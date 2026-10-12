"use strict";

// Règles communes aux fiches de production (PROMESH et PROBAR) : date de
// création en fuseau métier, cohérence des heures à la validation, durée,
// détection d'une valeur vide. Aucune base.

const {
  POSTES_CROSSING_MIDNIGHT,
  businessDateTime,
  timeToSeconds,
  dateOnly,
  validateFicheTimes,
  ficheDurationMinutes,
  isBlankValue,
} = require("../src/modules/production/services/ficheRules");

const TZ = "Africa/Tunis"; // UTC+1, sans heure d'été

describe("businessDateTime — date et heure du même instant, fuseau métier", () => {
  test("en journée : même jour qu'en heure universelle", () => {
    expect(businessDateTime(new Date("2026-07-17T12:30:27Z"), TZ)).toEqual({ date: "2026-07-17", time: "13:30:27" });
  });

  test("00 h 04 locale : la fiche est datée du jour qui commence, pas de la veille", () => {
    // Cas réel des fiches n° 76 et 77 : créées le 18/07 à 00 h 04, datées du 17/07.
    expect(businessDateTime(new Date("2026-07-17T23:04:31Z"), TZ)).toEqual({ date: "2026-07-18", time: "00:04:31" });
  });

  test("minuit pile et 00 h 59 min 59 s", () => {
    expect(businessDateTime(new Date("2026-07-17T23:00:00Z"), TZ)).toEqual({ date: "2026-07-18", time: "00:00:00" });
    expect(businessDateTime(new Date("2026-07-17T23:59:59Z"), TZ)).toEqual({ date: "2026-07-18", time: "00:59:59" });
  });

  test("23 h 59 min 59 s locale : encore le jour même", () => {
    expect(businessDateTime(new Date("2026-07-17T22:59:59Z"), TZ)).toEqual({ date: "2026-07-17", time: "23:59:59" });
  });

  test("changement de mois et d'année", () => {
    expect(businessDateTime(new Date("2026-07-31T23:30:00Z"), TZ).date).toBe("2026-08-01");
    expect(businessDateTime(new Date("2026-12-31T23:30:00Z"), TZ).date).toBe("2027-01-01");
  });

  test("29 février d'une année bissextile", () => {
    expect(businessDateTime(new Date("2028-02-28T23:10:00Z"), TZ).date).toBe("2028-02-29");
  });

  test("la date et l'heure ne dépendent pas du fuseau du serveur", () => {
    const instant = new Date("2026-07-17T23:04:31Z");
    expect(businessDateTime(instant, "UTC")).toEqual({ date: "2026-07-17", time: "23:04:31" });
    expect(businessDateTime(instant, TZ)).toEqual({ date: "2026-07-18", time: "00:04:31" });
  });
});

describe("timeToSeconds / dateOnly", () => {
  test("accepte HH:MM et HH:MM:SS", () => {
    expect(timeToSeconds("00:00")).toBe(0);
    expect(timeToSeconds("06:30")).toBe(23400);
    expect(timeToSeconds("23:59:59")).toBe(86399);
  });

  test("refuse les valeurs absentes ou illisibles", () => {
    for (const v of [null, undefined, "", "24:00", "7:5", "12h30", "abc"]) expect(timeToSeconds(v)).toBeNull();
  });

  test("dateOnly lit une chaîne, une date ISO ou un objet Date", () => {
    expect(dateOnly("2026-07-17")).toBe("2026-07-17");
    expect(dateOnly("2026-07-17T10:00:00.000Z")).toBe("2026-07-17");
    expect(dateOnly(new Date("2026-07-17T00:00:00Z"))).toBe("2026-07-17");
    expect(dateOnly(null)).toBeNull();
  });
});

describe("validateFicheTimes — contrôle fait à la validation de la fiche", () => {
  const NOW = new Date("2026-07-17T12:00:00Z");
  const check = (fiche) => validateFicheTimes(fiche, NOW);

  test("cas normal : poste du matin, fin après le début", () => {
    expect(check({ date: "2026-07-17", heureDebut: "06:00", heureFin: "14:00", poste: "matin" })).toEqual([]);
  });

  test("fin = début : refusé (un brouillon naît ainsi, il doit être complété avant validation)", () => {
    const errors = check({ date: "2026-07-17", heureDebut: "10:22:10", heureFin: "10:22:10", poste: "matin" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/différente de l'heure de début/);
  });

  test("fin = début à la minute près mais secondes différentes : accepté", () => {
    expect(check({ date: "2026-07-17", heureDebut: "10:22:10", heureFin: "10:22:40", poste: "matin" })).toEqual([]);
  });

  test("poste du matin, fin avant le début : refusé", () => {
    // Cas réel de la fiche n° 59 : 10 h 26 → 00 h 26 au poste du matin.
    const errors = check({ date: "2026-06-30", heureDebut: "10:26:08", heureFin: "00:26:00", poste: "matin" });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/seul un poste de nuit/);
  });

  test("poste de nuit, fin le lendemain : accepté", () => {
    expect(check({ date: "2026-07-16", heureDebut: "22:00", heureFin: "06:00", poste: "nuit" })).toEqual([]);
  });

  test("poste de nuit sans passage à minuit : accepté", () => {
    expect(check({ date: "2026-07-16", heureDebut: "18:00", heureFin: "23:30", poste: "nuit" })).toEqual([]);
    expect(check({ date: "2026-07-17", heureDebut: "00:10", heureFin: "05:45", poste: "nuit" })).toEqual([]);
  });

  test("poste de nuit, fin = début : refusé comme pour tout poste", () => {
    expect(check({ date: "2026-07-16", heureDebut: "22:00", heureFin: "22:00", poste: "nuit" })).toHaveLength(1);
  });

  test("poste absent ou inconnu : traité comme un poste qui ne passe pas minuit", () => {
    expect(check({ date: "2026-07-17", heureDebut: "22:00", heureFin: "06:00", poste: null })).toHaveLength(1);
    expect(check({ date: "2026-07-17", heureDebut: "22:00", heureFin: "06:00", poste: "soir" })).toHaveLength(1);
  });

  test("seul le poste de nuit est déclaré comme pouvant passer minuit", () => {
    expect(POSTES_CROSSING_MIDNIGHT).toEqual(["nuit"]);
  });

  test("date dans le futur : refusée ; date du jour et dates passées : acceptées", () => {
    const fiche = { heureDebut: "06:00", heureFin: "14:00", poste: "matin" };
    expect(check({ ...fiche, date: "2026-07-18" })[0]).toMatch(/dans le futur/);
    expect(check({ ...fiche, date: "2026-07-17" })).toEqual([]);
    expect(check({ ...fiche, date: "2026-01-01" })).toEqual([]);
  });

  test("date limite : à 00 h 30 locale, la date du jour qui commence n'est pas « dans le futur »", () => {
    const justAfterMidnight = new Date("2026-07-17T23:30:00Z"); // 18/07 00 h 30 à Tunis
    const fiche = { heureDebut: "00:10", heureFin: "00:25", poste: "nuit" };
    expect(validateFicheTimes({ ...fiche, date: "2026-07-18" }, justAfterMidnight)).toEqual([]);
    expect(validateFicheTimes({ ...fiche, date: "2026-07-19" }, justAfterMidnight)).toHaveLength(1);
  });

  test("heures obligatoires (PROMESH) : absentes ou illisibles → erreur", () => {
    expect(check({ date: "2026-07-17", heureDebut: null, heureFin: null, poste: "matin" })).toHaveLength(1);
    expect(check({ date: "2026-07-17", heureDebut: "06:00", heureFin: "", poste: "matin" })).toHaveLength(1);
    expect(check({ date: "2026-07-17", heureDebut: "6h", heureFin: "14:00", poste: "matin" })).toHaveLength(1);
  });

  test("heures facultatives (PROBAR) : absentes → aucune erreur ; une seule saisie → erreur ; les deux → contrôlées", () => {
    const base = { date: "2026-07-17", poste: "matin", heuresObligatoires: false };
    expect(check({ ...base, heureDebut: undefined, heureFin: undefined })).toEqual([]);
    expect(check({ ...base, heureDebut: "", heureFin: "" })).toEqual([]);
    expect(check({ ...base, heureDebut: "09:22", heureFin: "" })).toHaveLength(1);
    expect(check({ ...base, heureDebut: "09:22", heureFin: "11:22" })).toEqual([]);
    expect(check({ ...base, heureDebut: "11:39", heureFin: "01:39" })).toHaveLength(1);
  });

  test("plusieurs problèmes sont tous signalés", () => {
    expect(check({ date: "2026-07-30", heureDebut: "10:00", heureFin: "10:00", poste: "matin" })).toHaveLength(2);
  });
});

describe("ficheDurationMinutes", () => {
  test("même jour", () => expect(ficheDurationMinutes({ heureDebut: "06:00", heureFin: "14:00" })).toBe(480));
  test("fin le lendemain", () => expect(ficheDurationMinutes({ heureDebut: "22:00", heureFin: "06:00" })).toBe(480));
  test("juste avant et juste après minuit", () => expect(ficheDurationMinutes({ heureDebut: "23:59", heureFin: "00:01" })).toBe(2));
  test("fin = début ou heure absente : durée inconnue", () => {
    expect(ficheDurationMinutes({ heureDebut: "10:00", heureFin: "10:00" })).toBeNull();
    expect(ficheDurationMinutes({ heureDebut: "10:00", heureFin: null })).toBeNull();
  });
});

describe("isBlankValue", () => {
  test("vide", () => {
    for (const v of [null, undefined, "", "   ", [], {}, { a: "", b: { c: null } }, [{ x: "" }], [null, ""]]) expect(isBlankValue(v)).toBe(true);
  });
  test("renseigné", () => {
    for (const v of ["x", 0, 12.5, false, { a: "", b: { c: "test" } }, [{ x: 1 }]]) expect(isBlankValue(v)).toBe(false);
  });
});
