"use strict";

const {
  extractMeetingSlots,
  formatSlotsForInstruction,
  isMeetingComplete,
  missingMeetingFields,
  buildMeetingDateTimes,
  extractEmail,
  extractSubject,
  extractDate,
  extractTime,
  extractDuration,
} = require("../src/ai/agents/meetingSlotExtractor");

// Référence fixe (2026-08-15) pour que "demain"/"17 août" (sans année) se
// résolvent de façon déterministe dans les tests — indépendant de la date
// réelle d'exécution.
const REF = new Date("2026-08-15T09:00:00.000Z");

describe("extractEmail/extractSubject/extractDate/extractTime/extractDuration — extracteurs individuels", () => {
  test("extractEmail capture une adresse email valide", () => {
    expect(extractEmail("hadil.ibnhajfraj@gmail.com et programmer le projet cbi10")).toBe("hadil.ibnhajfraj@gmail.com");
    expect(extractEmail("aucun email ici")).toBeNull();
  });

  test("extractSubject via un marqueur explicite 'sujet'", () => {
    expect(extractSubject("sujet : réunion projet cbi10")).toBe("réunion projet cbi10");
    expect(extractSubject("sujet réunion projet cbi10")).toBe("réunion projet cbi10");
  });

  test("extractSubject retombe sur une mention 'projet X' si aucun marqueur explicite", () => {
    expect(extractSubject("programmer le projet cbi10 pour une date le 17/08/2026")).toBe("projet cbi10");
  });

  test("extractSubject renvoie null sans marqueur ni mention de projet", () => {
    expect(extractSubject("le 17/08/2026 à 12h")).toBeNull();
  });

  test("extractDate — format numérique jj/mm/aaaa", () => {
    expect(extractDate("le 17/08/2026 à 12h", REF)).toBe("2026-08-17");
  });

  test("extractDate — format numérique jj/mm SANS année : résout la prochaine occurrence future", () => {
    expect(extractDate("le 17/08 à 12h", REF)).toBe("2026-08-17");
  });

  test("extractDate — jj/mm déjà passé cette année => année suivante", () => {
    expect(extractDate("le 01/01", REF)).toBe("2027-01-01");
  });

  test("extractDate — 'le 17 août' (toutes lettres, sans année)", () => {
    expect(extractDate("le 17 août à midi", REF)).toBe("2026-08-17");
  });

  test("extractDate — 'demain'", () => {
    expect(extractDate("demain à 12h", REF)).toBe("2026-08-16");
  });

  test("extractDate — 'aujourd'hui'", () => {
    expect(extractDate("aujourd'hui à 12h", REF)).toBe("2026-08-15");
  });

  test("extractTime — 'midi'/'minuit'", () => {
    expect(extractTime("le 17 août à midi")).toBe("12:00");
    expect(extractTime("rappel à minuit")).toBe("00:00");
  });

  test("extractTime — 'HHh', 'HHhMM', 'HH:MM'", () => {
    expect(extractTime("à 12h")).toBe("12:00");
    expect(extractTime("à 12h30")).toBe("12:30");
    expect(extractTime("à 12:30")).toBe("12:30");
  });

  test("extractDuration — uniquement sur un marqueur explicite 'durée', jamais deviné", () => {
    expect(extractDuration("durée : 1 heure")).toBe("1 heures");
    expect(extractDuration("durée 30 minutes")).toBe("30 minutes");
    expect(extractDuration("réunion de 1 heure")).toBeNull();
  });
});

describe("extractMeetingSlots — TEST 1 (toutes les infos dans un seul message)", () => {
  test("email + sujet('projet cbi10') + date + heure de début en un seul tour ; fin/durée restent absents", () => {
    const slots = extractMeetingSlots(
      ["Programmer une réunion", "hadil.ibnhajfraj@gmail.com et programmer le projet cbi10 pour une date le 17/08/2026 à 12h"],
      REF
    );
    expect(slots.email).toBe("hadil.ibnhajfraj@gmail.com");
    expect(slots.subject).toContain("cbi10");
    expect(slots.startDate).toBe("2026-08-17");
    expect(slots.startTime).toBe("12:00");
    expect(slots.endDate).toBeNull();
    expect(slots.endTime).toBeNull();
    expect(slots.duration).toBeNull();
  });
});

describe("extractMeetingSlots — TEST 2 (informations réparties sur plusieurs tours, cumulatives)", () => {
  test("email (tour 2) + date/heure (tour 3) + sujet (tour 4) restent TOUS connus après le tour 4", () => {
    const messages = ["Programmer une réunion", "email hadil.ibnhajfraj@gmail.com", "le 17 août à midi", "sujet : réunion projet cbi10"];
    const slots = extractMeetingSlots(messages, REF);
    expect(slots.email).toBe("hadil.ibnhajfraj@gmail.com");
    expect(slots.startDate).toBe("2026-08-17");
    expect(slots.startTime).toBe("12:00");
    expect(slots.subject).toBe("réunion projet cbi10");
  });

  test("un champ trouvé à un tour reste connu au tour suivant même si ce tour ne le répète pas (cumulatif)", () => {
    const afterTurn2 = extractMeetingSlots(["Programmer une réunion", "email hadil.ibnhajfraj@gmail.com"], REF);
    expect(afterTurn2.email).toBe("hadil.ibnhajfraj@gmail.com");
    const afterTurn3 = extractMeetingSlots(["Programmer une réunion", "email hadil.ibnhajfraj@gmail.com", "le 17 août à midi"], REF);
    // Le tour 3 ne mentionne pas l'email : il doit rester connu.
    expect(afterTurn3.email).toBe("hadil.ibnhajfraj@gmail.com");
    expect(afterTurn3.startDate).toBe("2026-08-17");
  });
});

describe("extractMeetingSlots — TEST 5 (ne jamais fabriquer une heure de fin/durée)", () => {
  test("email + date + heure de début récupérés ; endTime/duration restent null (jamais inventés)", () => {
    const slots = extractMeetingSlots(["Programmer une réunion", "hadil.ibnhajfraj@gmail.com le 17 août à 12h"], REF);
    expect(slots.email).toBe("hadil.ibnhajfraj@gmail.com");
    expect(slots.startDate).toBe("2026-08-17");
    expect(slots.startTime).toBe("12:00");
    expect(slots.endTime).toBeNull();
    expect(slots.duration).toBeNull();
  });
});

describe("extractMeetingSlots — heure/date de FIN uniquement sur un marqueur explicite", () => {
  test("'jusqu'à 14h' après une heure de début est traité comme une heure de FIN, jamais une correction du début", () => {
    const slots = extractMeetingSlots(["à 12h", "jusqu'à 14h"], REF);
    expect(slots.startTime).toBe("12:00");
    expect(slots.endTime).toBe("14:00");
  });

  test("sans marqueur de fin, une heure mentionnée à nouveau MET À JOUR l'heure de début (l'utilisateur corrige)", () => {
    const slots = extractMeetingSlots(["à 12h", "en fait plutôt à 14h"], REF);
    expect(slots.startTime).toBe("14:00");
    expect(slots.endTime).toBeNull();
  });
});

describe("formatSlotsForInstruction — le bloc envoyé au modèle", () => {
  test("liste les champs connus et les champs réellement manquants, jamais l'email comme 'manquant' (non requis)", () => {
    const slots = extractMeetingSlots(["hadil.ibnhajfraj@gmail.com et programmer le projet cbi10 pour une date le 17/08/2026 à 12h"], REF);
    const text = formatSlotsForInstruction(slots);
    expect(text).toContain("hadil.ibnhajfraj@gmail.com");
    expect(text).toContain("cbi10");
    expect(text).toContain("2026-08-17");
    expect(text).toContain("12:00");
    expect(text).toMatch(/heure de fin.*durée/i);
    expect(text).not.toMatch(/email.*manquant/i);
  });

  // AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md — quand tout
  // est connu, ce texte ne demande plus au MODÈLE de récapituler/appeler
  // create_calendar_event (c'est désormais l'agent, jamais le LLM, qui
  // propose un PendingAction — voir meetingAgent.js) ; seule l'absence de
  // "manquantes" compte encore ici.
  test("quand tout est connu, ne liste plus rien comme manquant (le récapitulatif/la confirmation sont désormais composés par l'agent, pas demandés au LLM)", () => {
    const slots = extractMeetingSlots(
      ["hadil.ibnhajfraj@gmail.com, sujet projet cbi10, le 17/08/2026 à 12h, jusqu'à 13h"],
      REF
    );
    const text = formatSlotsForInstruction(slots);
    expect(text).toMatch(/toutes les informations requises sont connues/i);
    expect(text).not.toMatch(/encore réellement manquantes/i);
  });
});

describe("isMeetingComplete/missingMeetingFields — même règle que formatSlotsForInstruction, source unique (AI-Business-Copilot/29_MEETING_AGENT_CRM_CALENDAR_LINK.md)", () => {
  test("incomplet tant qu'il manque le sujet, la date, l'heure de début, OU (l'heure de fin ET la durée)", () => {
    expect(isMeetingComplete(extractMeetingSlots(["Programmer une réunion"], REF))).toBe(false);
    expect(isMeetingComplete(extractMeetingSlots(["hadil.ibnhajfraj@gmail.com le 17 août à 12h"], REF))).toBe(false); // pas de sujet, pas de fin/durée
  });

  test("complet dès que sujet+date+début+ (fin OU durée) sont connus — email JAMAIS requis", () => {
    const slots = extractMeetingSlots(["sujet projet cbi10, le 17/08/2026 à 12h, durée : 1 heure"], REF);
    expect(missingMeetingFields(slots)).toEqual([]);
    expect(isMeetingComplete(slots)).toBe(true);
  });
});

describe("buildMeetingDateTimes — construit start/endDateTime EXCLUSIVEMENT depuis l'état fusionné, jamais du texte du LLM", () => {
  test("avec une heure de fin explicite", () => {
    const slots = extractMeetingSlots(["le 17/08/2026 à 12h, jusqu'à 13h30"], REF);
    expect(buildMeetingDateTimes(slots)).toEqual({ startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:30:00" });
  });

  test("avec une durée : calcule endDateTime par addition, jamais deviné autrement", () => {
    const slots = extractMeetingSlots(["le 17/08/2026 à 12h, durée : 90 minutes"], REF);
    expect(buildMeetingDateTimes(slots)).toEqual({ startDateTime: "2026-08-17T12:00:00", endDateTime: "2026-08-17T13:30:00" });
  });

  test("retourne null si les informations sont insuffisantes (jamais une heure de fin inventée)", () => {
    const slots = extractMeetingSlots(["le 17/08/2026 à 12h"], REF);
    expect(buildMeetingDateTimes(slots)).toBeNull();
  });
});
