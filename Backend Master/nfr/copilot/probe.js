const U = "http://127.0.0.1:4100";
(async () => {
  const role = process.argv[2] || "commercial"; const msg = process.argv[3] || "Quels sont mes projets ?";
  const r = await fetch(U + "/auth/signin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: `qa.${role}@qa-probar.com`, password: "QaAudit#2026" }) });
  const { accessToken } = await r.json();
  const t0 = Date.now();
  const c = await fetch(U + "/ai-copilot/chat", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` }, body: JSON.stringify({ message: msg }) });
  const j = await c.json();
  console.log("HTTP", c.status, "ms", Date.now() - t0);
  console.log(JSON.stringify(j, null, 1).slice(0, 2600));
})();
