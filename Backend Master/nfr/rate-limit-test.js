"use strict";
// Audit non fonctionnel — SÉCURITÉ : vérifie la protection anti force brute de
// POST /auth/signin (express-rate-limit). Envoie des tentatives avec un mauvais
// mot de passe jusqu'au premier refus HTTP 429 et relève le seuil réel.
//   node nfr/rate-limit-test.js        (à lancer juste après un redémarrage de l'instance de test)
const fs = require("fs");
const U = process.env.BASE_URL || "http://127.0.0.1:4100";
const MAX = 40;

(async () => {
  const attempts = [];
  let first429 = null;
  for (let i = 1; i <= MAX; i++) {
    const r = await fetch(`${U}/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "qa.commercial@qa-probar.com", password: `MauvaisMotDePasse${i}` }),
    });
    attempts.push({ n: i, status: r.status, limit: r.headers.get("ratelimit-limit"), remaining: r.headers.get("ratelimit-remaining"), retryAfter: r.headers.get("retry-after") });
    if (r.status === 429 && first429 === null) first429 = i;
    if (first429 !== null && i >= first429 + 2) break;
  }
  // Après blocage, même le bon mot de passe doit être refusé.
  const good = await fetch(`${U}/auth/signin`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "qa.commercial@qa-probar.com", password: process.env.QA_PASSWORD || "QaAudit#2026" }),
  });
  const report = {
    measuredAt: new Date().toISOString(),
    target: `${U}/auth/signin`,
    attemptsSent: attempts.length,
    acceptedBeforeBlock: first429 === null ? null : first429 - 1,
    firstBlockedAttempt: first429,
    declaredLimitHeader: attempts[0].limit,
    retryAfterSeconds: first429 ? attempts[first429 - 1].retryAfter : null,
    validPasswordWhileBlocked: good.status,
    blocked: first429 !== null,
    attempts,
  };
  fs.writeFileSync("reports/env/rate-limit-results.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, attempts: undefined }));
})();
