"use strict";

// Phase 2 — documents joints au Copilot : extraction (5 formats), validation,
// cloisonnement par propriétaire, limites, journalisation. Même pipeline RAG
// que la documentation (createRagPipeline), collection dédiée.

const os = require("os");
const JSZip = require("jszip");
const { createRagPipeline } = require("../src/ai/rag/pipeline");
const { extractDocumentText } = require("../src/ai/rag/ingestion/bufferLoaders");
const { UserDocumentService } = require("../src/ai/rag/userDocumentService");
const { validateCopilotDocument, sanitizeFilename } = require("../src/modules/ai-copilot/services/copilotDocumentValidation");
const { buildPdf, buildDocx, buildXlsx } = require("./fixtures/copilotDocumentFixtures");

function pipeline() {
  return createRagPipeline({ allowedRoots: [os.tmpdir()] });
}

describe("Extraction de texte — 5 formats, en mémoire", () => {
  test("PDF : texte page par page (pages conservées pour les citations)", async () => {
    const r = await extractDocumentText(buildPdf(["Rapport PROBAR", "Retard de livraison"]), "pdf");
    expect(r.sourceType).toBe("pdf");
    expect(r.pages).toEqual(["Rapport PROBAR", "Retard de livraison"]);
    expect(r.pageLabels).toEqual(["page 1", "page 2"]);
  });

  test("DOCX : paragraphes, accents et entités XML décodés", async () => {
    const r = await extractDocumentText(await buildDocx(["Compte rendu", "Problème : panne PROMESH & retard"]), "docx");
    expect(r.text).toBe("Compte rendu\nProblème : panne PROMESH & retard");
  });

  test("XLSX (lu avec exceljs) : une page par feuille, « en-tête : valeur » par ligne", async () => {
    const r = await extractDocumentText(await buildXlsx({ Suivi: [["Projet", "Statut"], ["Sfax Port", "En cours"]], Notes: [["Remarque"], ["RAS"]] }), "xlsx");
    expect(r.pageLabels).toEqual(["Suivi", "Notes"]);
    expect(r.pages[0]).toContain("Projet : Sfax Port | Statut : En cours");
  });

  test("CSV (séparateur ; ou ,) et TXT UTF-8 (BOM retiré)", async () => {
    expect((await extractDocumentText(Buffer.from("Projet;Statut\nSfax;En cours\n"), "csv")).text).toContain("Projet : Sfax | Statut : En cours");
    expect((await extractDocumentText(Buffer.from("a,b\n1,2"), "csv")).text).toContain("a : 1 | b : 2");
    expect((await extractDocumentText(Buffer.from("\uFEFFBonjour équipe"), "txt")).text).toBe("Bonjour équipe");
  });

  test("PDF sans texte (scanné/vide) → erreur honnête DOCUMENT_NO_TEXT", async () => {
    await expect(extractDocumentText(buildPdf([""]), "pdf")).rejects.toMatchObject({ code: "DOCUMENT_NO_TEXT", status: 422 });
  });

  test("PDF corrompu → DOCUMENT_UNREADABLE (jamais une exception brute)", async () => {
    await expect(extractDocumentText(Buffer.from("%PDF-1.4 pas vraiment un pdf"), "pdf")).rejects.toMatchObject({ code: "DOCUMENT_UNREADABLE" });
  });

  test("anti « zip bomb » : taille décompressée déclarée bornée AVANT lecture", async () => {
    const zip = new JSZip();
    zip.file("word/document.xml", "0".repeat(45 * 1024 * 1024));
    const bomb = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    expect(bomb.length).toBeLessThan(1024 * 1024); // petit fichier…
    await expect(extractDocumentText(bomb, "docx")).rejects.toMatchObject({ code: "DOCUMENT_TOO_LARGE", status: 413 }); // …refusé
  });

  test("TXT binaire (octet NUL) → refusé", async () => {
    await expect(extractDocumentText(Buffer.from([0x48, 0x00, 0x49]), "txt")).rejects.toMatchObject({ code: "DOCUMENT_TYPE_MISMATCH" });
  });
});

describe("Validation du fichier téléversé", () => {
  const file = (originalname, buffer, mimetype = "application/octet-stream") => ({ originalname, mimetype, buffer, size: buffer.length });

  test("formats acceptés : extension + MIME + signature cohérents", async () => {
    expect(validateCopilotDocument(file("r.pdf", buildPdf(["x"]), "application/pdf"))).toEqual({ kind: "pdf", filename: "r.pdf" });
    expect(validateCopilotDocument(file("c.docx", await buildDocx(["x"])))).toMatchObject({ kind: "docx" });
    expect(validateCopilotDocument(file("t.xlsx", await buildXlsx({ A: [["x"]] })))).toMatchObject({ kind: "xlsx" });
    expect(validateCopilotDocument(file("d.csv", Buffer.from("a;b"), "text/csv"))).toMatchObject({ kind: "csv" });
    expect(validateCopilotDocument(file("n.txt", Buffer.from("note"), "text/plain"))).toMatchObject({ kind: "txt" });
  });

  test.each([
    ["script.exe", Buffer.from("MZ..."), "DOCUMENT_TYPE_NOT_ALLOWED"],
    // Les images sont désormais acceptées (lues par OCR) — mais seulement si le
    // contenu est réellement une image : ici, trois octets de texte.
    ["image.png", Buffer.from("PNG"), "DOCUMENT_TYPE_MISMATCH"],
    ["photo.gif", Buffer.from("GIF89a"), "DOCUMENT_TYPE_NOT_ALLOWED"],
    ["faux.pdf", Buffer.from("pas un pdf"), "DOCUMENT_TYPE_MISMATCH"],
    ["archive.txt", Buffer.from([0x50, 0x4b, 0x03, 0x04, 1, 2]), "DOCUMENT_TYPE_MISMATCH"],
    ["vide.txt", Buffer.alloc(0), "DOCUMENT_EMPTY"],
  ])("%s → %s", (name, buffer, code) => {
    expect(() => validateCopilotDocument(file(name, buffer))).toThrow(expect.objectContaining({ code }));
  });

  test("MIME déclaré incohérent avec l'extension → refusé", () => {
    expect(() => validateCopilotDocument(file("r.pdf", buildPdf(["x"]), "text/html"))).toThrow(expect.objectContaining({ code: "DOCUMENT_TYPE_MISMATCH" }));
  });

  test("fichier > 10 Mo → 413", () => {
    expect(() => validateCopilotDocument(file("gros.txt", Buffer.alloc(10 * 1024 * 1024 + 1, 65)))).toThrow(expect.objectContaining({ code: "DOCUMENT_TOO_LARGE", status: 413 }));
  });

  test("nom de fichier : jamais un chemin (traversée, caractères de contrôle, longueur)", () => {
    expect(sanitizeFilename("../../etc/passwd.txt")).toBe("passwd.txt");
    expect(sanitizeFilename("C:\\Windows\\system32\\evil.pdf")).toBe("evil.pdf");
    expect(sanitizeFilename("rap\u0000port<1>.pdf")).toBe("rap_port_1_.pdf");
    expect(sanitizeFilename(".htaccess.txt")).toBe("htaccess.txt");
    expect(sanitizeFilename(`${"a".repeat(300)}.pdf`)).toHaveLength(120);
  });
});

describe("UserDocumentService — un document n'est visible QUE par son propriétaire", () => {
  test("indexation dans la collection dédiée, métadonnées conservées, documentation intacte", async () => {
    const rag = pipeline();
    const doc = await rag.userDocumentService.addDocument({ ownerId: "alice", filename: "rapport.pdf", kind: "pdf", buffer: buildPdf(["Rapport PROBAR", "Retard de livraison Sfax"]) });
    expect(doc).toMatchObject({ filename: "rapport.pdf", sourceType: "pdf", pageCount: 2, chunkCount: 2 });
    expect(rag.vectorStore.size("user_documents")).toBe(2);
    expect(rag.vectorStore.size("documentation")).toBe(0);
    const { results } = await rag.userDocumentService.search("alice", [doc.documentId], "retard de livraison");
    expect(results[0]).toMatchObject({ documentId: doc.documentId, filename: "rapport.pdf", page: 2 });
  });

  test("un autre utilisateur ne peut ni chercher, ni lire, ni lister, ni supprimer, ni joindre le document", async () => {
    const rag = pipeline();
    const svc = rag.userDocumentService;
    const doc = await svc.addDocument({ ownerId: "alice", filename: "secret.txt", kind: "txt", buffer: Buffer.from("Budget confidentiel 500000") });
    expect((await svc.search("bob", [doc.documentId], "budget")).results).toEqual([]);
    expect(svc.getDocument("bob", doc.documentId)).toBeNull();
    expect(await svc.listDocuments("bob")).toEqual([]);
    expect(svc.filterOwned("bob", [doc.documentId])).toEqual([]);
    expect(await svc.removeDocument("bob", doc.documentId)).toBe(false);
    expect((await svc.representativeChunks("bob", doc.documentId)).chunks).toEqual([]);
    // Le document d'Alice est intact.
    expect(svc.getDocument("alice", doc.documentId)).not.toBeNull();
  });

  test("la recherche ne mélange jamais les documents de deux utilisateurs", async () => {
    const svc = pipeline().userDocumentService;
    const a = await svc.addDocument({ ownerId: "alice", filename: "a.txt", kind: "txt", buffer: Buffer.from("Panne machine PROMESH 3") });
    const b = await svc.addDocument({ ownerId: "bob", filename: "b.txt", kind: "txt", buffer: Buffer.from("Panne machine PROMESH 4") });
    const { results } = await svc.search("alice", [a.documentId, b.documentId], "panne machine");
    expect(results.map((r) => r.documentId)).toEqual([a.documentId]);
  });

  test("suppression par le propriétaire : chunks retirés du vector store", async () => {
    const rag = pipeline();
    const doc = await rag.userDocumentService.addDocument({ ownerId: "alice", filename: "a.txt", kind: "txt", buffer: Buffer.from("contenu") });
    expect(await rag.userDocumentService.removeDocument("alice", doc.documentId)).toBe(true);
    expect(rag.vectorStore.size("user_documents")).toBe(0);
  });

  test("expiration (TTL) : document et chunks purgés", async () => {
    let now = 0;
    const rag = pipeline();
    const svc = new UserDocumentService({ ingestionService: rag.ingestionService, retrievalService: rag.userDocumentService.retrievalService, vectorStore: rag.vectorStore, ttlMs: 1000, clock: () => now });
    const doc = await svc.addDocument({ ownerId: "alice", filename: "a.txt", kind: "txt", buffer: Buffer.from("contenu") });
    now = 5000;
    expect(svc.getDocument("alice", doc.documentId)).toBeNull();
    expect(await svc.listDocuments("alice")).toEqual([]);
    expect(rag.vectorStore.size("user_documents")).toBe(0);
  });

  test("quota de documents par utilisateur → 429 explicite", async () => {
    const rag = pipeline();
    const svc = new UserDocumentService({ ingestionService: rag.ingestionService, retrievalService: rag.userDocumentService.retrievalService, vectorStore: rag.vectorStore, maxDocumentsPerUser: 1 });
    await svc.addDocument({ ownerId: "alice", filename: "a.txt", kind: "txt", buffer: Buffer.from("un") });
    await expect(svc.addDocument({ ownerId: "alice", filename: "b.txt", kind: "txt", buffer: Buffer.from("deux") })).rejects.toMatchObject({ code: "DOCUMENT_LIMIT", status: 429 });
    await expect(svc.addDocument({ ownerId: "bob", filename: "c.txt", kind: "txt", buffer: Buffer.from("trois") })).resolves.toBeTruthy();
  });

  test("résumé : échantillon BORNÉ d'extraits répartis, jamais le document entier", async () => {
    const svc = pipeline().userDocumentService;
    const text = Array.from({ length: 60 }, (_v, i) => `Paragraphe ${i + 1}. ${"Contenu technique détaillé. ".repeat(12)}`).join("\n\n");
    const doc = await svc.addDocument({ ownerId: "alice", filename: "long.txt", kind: "txt", buffer: Buffer.from(text) });
    const { chunks, total } = await svc.representativeChunks("alice", doc.documentId, 8);
    expect(total).toBeGreaterThan(8);
    expect(chunks).toHaveLength(8);
    expect(chunks[0].text).toContain("Paragraphe 1.");
  });

  test("journalisation : jamais le nom du fichier ni son contenu, ni la question posée", async () => {
    const spy = jest.spyOn(console, "log").mockImplementation(() => {});
    try {
      const svc = pipeline().userDocumentService;
      const doc = await svc.addDocument({ ownerId: "alice", filename: "salaires_confidentiels.txt", kind: "txt", buffer: Buffer.from("Salaire de Karim : 4200") });
      await svc.search("alice", [doc.documentId], "salaire de Karim");
      const logged = spy.mock.calls.flat().join("\n");
      expect(logged).not.toMatch(/salaires_confidentiels|Karim|4200/);
      expect(logged).toContain(doc.documentId);
    } finally {
      spy.mockRestore();
    }
  });
});
