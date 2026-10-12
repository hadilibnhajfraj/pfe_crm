"use strict";

// Phase 2 — endpoints /ai-copilot/documents : VRAI routeur, VRAI middleware
// multer (mémoire), VRAIE validation, VRAI UserDocumentService. Seuls
// l'authentification (JWT) et la porte « Copilot activé » sont simulées.

jest.mock("../src/middleware/auth.middleware", () => ({
  authRequired: (req, _res, next) => {
    req.user = req.headers["x-test-user"] ? JSON.parse(req.headers["x-test-user"]) : { sub: "alice", role: "commercial", email: "a@cbi.tn" };
    next();
  },
}));

jest.mock("../src/modules/ai-copilot/services/aiCopilotBridge.service", () => {
  const actual = jest.requireActual("../src/modules/ai-copilot/services/aiCopilotBridge.service");
  return { ...actual, canUseAiCopilot: () => ({ allowed: true, reason: null }), sendMessage: jest.fn(async () => ({ answer: "ok" })) };
});

const request = require("supertest");
const express = require("express");
const aiCopilotRoutes = require("../src/modules/ai-copilot/routes/aiCopilot.routes");
const bridge = require("../src/modules/ai-copilot/services/aiCopilotBridge.service");
const { buildPdf, buildDocx } = require("./fixtures/copilotDocumentFixtures");

const ALICE = JSON.stringify({ sub: "alice", role: "commercial", email: "a@cbi.tn" });
const BOB = JSON.stringify({ sub: "bob", role: "admin", email: "b@cbi.tn" });

function app() {
  const a = express();
  a.use(express.json());
  a.use("/ai-copilot", aiCopilotRoutes);
  return a;
}

describe("POST /ai-copilot/documents — envoi sécurisé", () => {
  test("PDF valide → 201 avec métadonnées (jamais le contenu)", async () => {
    const res = await request(app())
      .post("/ai-copilot/documents")
      .set("x-test-user", ALICE)
      .attach("file", buildPdf(["Rapport PROBAR", "Retard"]), { filename: "rapport.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(201);
    expect(res.body.data).toMatchObject({ filename: "rapport.pdf", sourceType: "pdf", pageCount: 2 });
    expect(res.body.data.documentId).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(res.body)).not.toContain("Retard");
  });

  test("DOCX envoyé en application/octet-stream (navigateur) → accepté grâce à la signature", async () => {
    const res = await request(app())
      .post("/ai-copilot/documents")
      .set("x-test-user", ALICE)
      .attach("file", await buildDocx(["Compte rendu"]), { filename: "cr.docx", contentType: "application/octet-stream" });
    expect(res.status).toBe(201);
  });

  test("extension interdite → 400, refusée avant lecture", async () => {
    const res = await request(app()).post("/ai-copilot/documents").set("x-test-user", ALICE).attach("file", Buffer.from("MZ"), "outil.exe");
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("DOCUMENT_TYPE_NOT_ALLOWED");
  });

  test("« .pdf » dont le contenu n'est pas un PDF → 400", async () => {
    const res = await request(app()).post("/ai-copilot/documents").set("x-test-user", ALICE).attach("file", Buffer.from("<html>"), { filename: "faux.pdf", contentType: "application/pdf" });
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("DOCUMENT_TYPE_MISMATCH");
  });

  test("fichier > 10 Mo → 413 (limite multer, flux interrompu)", async () => {
    const res = await request(app()).post("/ai-copilot/documents").set("x-test-user", ALICE).attach("file", Buffer.alloc(10 * 1024 * 1024 + 10, 65), "gros.txt");
    expect(res.status).toBe(413);
    expect(res.body.reason).toBe("DOCUMENT_TOO_LARGE");
  });

  test("aucun fichier → 400", async () => {
    const res = await request(app()).post("/ai-copilot/documents").set("x-test-user", ALICE).field("autre", "x");
    expect(res.status).toBe(400);
    expect(res.body.reason).toBe("DOCUMENT_MISSING");
  });

  test("nom de fichier avec chemin → réduit à un simple libellé", async () => {
    const res = await request(app()).post("/ai-copilot/documents").set("x-test-user", ALICE).attach("file", Buffer.from("note"), { filename: "../../etc/notes.txt", contentType: "text/plain" });
    expect(res.status).toBe(201);
    expect(res.body.data.filename).toBe("notes.txt");
  });
});

describe("GET / DELETE /ai-copilot/documents — cloisonnement par utilisateur", () => {
  test("liste : uniquement ses propres documents ; suppression par un tiers → 404 (même un admin)", async () => {
    const a = app();
    const up = await request(a).post("/ai-copilot/documents").set("x-test-user", ALICE).attach("file", Buffer.from("privé"), { filename: "prive.txt", contentType: "text/plain" });
    const id = up.body.data.documentId;

    const bobList = await request(a).get("/ai-copilot/documents").set("x-test-user", BOB);
    expect(bobList.body.data.map((d) => d.documentId)).not.toContain(id);
    const aliceList = await request(a).get("/ai-copilot/documents").set("x-test-user", ALICE);
    expect(aliceList.body.data.map((d) => d.documentId)).toContain(id);

    expect((await request(a).delete(`/ai-copilot/documents/${id}`).set("x-test-user", BOB)).status).toBe(404);
    expect((await request(a).delete(`/ai-copilot/documents/${id}`).set("x-test-user", ALICE)).status).toBe(200);
    expect((await request(a).delete(`/ai-copilot/documents/${id}`).set("x-test-user", ALICE)).status).toBe(404);
  });
});

describe("POST /ai-copilot/chat — documents joints", () => {
  beforeEach(() => bridge.sendMessage.mockClear());

  test("documentIds transmis au bridge (qui revérifie la propriété) ; entrées malformées ignorées", async () => {
    await request(app()).post("/ai-copilot/chat").set("x-test-user", ALICE).send({ message: "Résume ce fichier.", documentIds: ["d1", 42, "x".repeat(100)] });
    expect(bridge.sendMessage.mock.calls[0][1].documentIds).toEqual(["d1"]);
  });

  test("sans document : contrat d'appel inchangé (aucun champ documentIds)", async () => {
    await request(app()).post("/ai-copilot/chat").set("x-test-user", ALICE).send({ message: "Bonjour" });
    expect(bridge.sendMessage.mock.calls[0][1]).not.toHaveProperty("documentIds");
  });
});
