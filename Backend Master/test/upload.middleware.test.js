"use strict";

// Regression test: avatar upload endpoints (middleware/upload.js used by
// the dead routes/upload .js, and middleware/upload.middleware.js used by
// the live PUT /users/me/profile) had NO file-type restriction at all —
// any extension (e.g. .svg, .html) was accepted and later served as-is by
// express.static("uploads") with a Content-Type derived from the
// extension: stored XSS on the API's own origin. Fixed by adding the same
// image-only fileFilter pattern already used by every other upload
// middleware in this codebase (hrRequestUpload, maintenanceRequestUpload,
// actionUpload, porPromeshAttachment) — audit sécurité.

function runFileFilter(uploadInstance, filename) {
  return new Promise((resolve) => {
    uploadInstance.fileFilter({}, { originalname: filename }, (err, accepted) => {
      resolve({ err, accepted });
    });
  });
}

describe("middleware/upload.js — avatar fileFilter", () => {
  const { upload, handleUploadError } = require("../src/middleware/upload");

  test.each([".png", ".jpg", ".jpeg", ".webp", ".gif"])("accepts %s", async (ext) => {
    const { err, accepted } = await runFileFilter(upload, `photo${ext}`);
    expect(err).toBeFalsy();
    expect(accepted).toBe(true);
  });

  test.each([".svg", ".html", ".php", ".exe", ""])("rejects %s (the stored-XSS vector this fix closes)", async (ext) => {
    const { err } = await runFileFilter(upload, `evil${ext}`);
    expect(err).toBeInstanceOf(Error);
  });

  test("handleUploadError converts a rejection into a clean 400 JSON response", () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    handleUploadError(new Error("Type de fichier non autorisé."), {}, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test("handleUploadError calls next() when there's no error", () => {
    const next = jest.fn();
    handleUploadError(null, {}, {}, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("middleware/upload.middleware.js — avatar fileFilter (PUT /users/me/profile)", () => {
  const upload = require("../src/middleware/upload.middleware");

  test.each([".png", ".jpg", ".jpeg", ".webp", ".gif"])("accepts %s", async (ext) => {
    const { err, accepted } = await runFileFilter(upload, `photo${ext}`);
    expect(err).toBeFalsy();
    expect(accepted).toBe(true);
  });

  test.each([".svg", ".html", ".php"])("rejects %s", async (ext) => {
    const { err } = await runFileFilter(upload, `evil${ext}`);
    expect(err).toBeInstanceOf(Error);
  });

  test("exposes handleUploadError for clean 400 JSON responses", () => {
    expect(typeof upload.handleUploadError).toBe("function");
  });
});
