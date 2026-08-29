"use strict";

const { redact, redactString } = require("../src/ai/utils/secretRedaction");
const secretRedactor = require("../src/ai/security/secretRedactor");

describe("redactString", () => {
  test("redacts a Bearer token, keeping the 'Bearer' prefix visible", () => {
    expect(redactString("Authorization: Bearer abc123.DEF-456_ghi")).toBe("Authorization: Bearer [REDACTED]");
  });

  test("redacts a bare JWT-shaped token (no preceding 'key=') using the JWT-specific pattern", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactString(`session established, id ${jwt} attached`)).toBe("session established, id [REDACTED_JWT] attached");
  });

  test("a JWT preceded by a secret-shaped key is still fully hidden (generic key=value pattern wins)", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redactString(`token=${jwt}`)).toBe("token=[REDACTED]");
  });

  test("redacts only the password portion of a connection string, keeping host/user visible", () => {
    expect(redactString("redis://user:s3cr3t@localhost:6379")).toBe("redis://user:[REDACTED]@localhost:6379");
    expect(redactString("postgresql://admin:hunter2@db.internal:5432/crm")).toBe("postgresql://admin:[REDACTED]@db.internal:5432/crm");
  });

  test("redacts a quoted assignment to a secret-shaped key embedded in a string", () => {
    expect(redactString('config: {"apiKey": "sk-abcdef1234567890"}')).toContain('"apiKey": "[REDACTED]"');
  });

  test("leaves ordinary text untouched", () => {
    const text = "La demande de maintenance MR-42 est toujours en attente.";
    expect(redactString(text)).toBe(text);
  });

  test("passes through non-string values unchanged", () => {
    expect(redactString(42)).toBe(42);
    expect(redactString(null)).toBeNull();
    expect(redactString(undefined)).toBeUndefined();
  });
});

describe("redact (deep, objects/arrays)", () => {
  test("redacts the VALUE of any key whose name looks secret-shaped, regardless of the value's own shape", () => {
    const result = redact({ apiKey: "sk-123", password: "hunter2", role: "admin", token: 42 });
    expect(result).toEqual({ apiKey: "[REDACTED]", password: "[REDACTED]", role: "admin", token: "[REDACTED]" });
  });

  test("redacts recursively through nested objects and arrays", () => {
    const result = redact({ user: { id: "u1", details: { secret: "x" } }, items: [{ token: "y" }, { ok: "z" }] });
    expect(result).toEqual({ user: { id: "u1", details: { secret: "[REDACTED]" } }, items: [{ token: "[REDACTED]" }, { ok: "z" }] });
  });

  test("a container key that itself looks secret-shaped (e.g. 'credentials') is redacted wholesale, not recursed into", () => {
    const result = redact({ credentials: { username: "bob", secret: "x" } });
    expect(result).toEqual({ credentials: "[REDACTED]" });
  });

  test("redacts secret-shaped patterns inside string values even under an innocuous-looking key", () => {
    const result = redact({ message: "connect via redis://user:hunter2@host:6379" });
    expect(result.message).toBe("connect via redis://user:[REDACTED]@host:6379");
  });

  test("redacts an Error's message but preserves its name", () => {
    const jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const err = new TypeError(`request failed unexpectedly, saw ${jwt} in the payload`);
    const result = redact(err);
    expect(result.name).toBe("TypeError");
    expect(result.message).toBe("request failed unexpectedly, saw [REDACTED_JWT] in the payload");
  });

  // AI-Business-Copilot/12_AGENT_FAILURE_DIAGNOSIS.md, étape 1 — avant ce
  // correctif, `redact(err)` construisait un `new Error(...)` dont la
  // `.stack` pointait vers CETTE fonction de redaction, jamais vers
  // l'endroit réel où l'erreur d'origine a été levée : la stack technique
  // demandée pour le diagnostic serveur était donc invisible même dans les
  // logs (voir baseAgent.js::execute(), qui loggue `err` passé par ce même
  // `redact()`).
  test("preserves the ORIGINAL stack trace (redacted), never a synthetic one pointing at the redaction utility itself", () => {
    function throwsDeepInside() {
      throw new Error("boom");
    }
    let original;
    try {
      throwsDeepInside();
    } catch (err) {
      original = err;
    }
    const result = redact(original);
    expect(result.stack).toBe(original.stack);
    expect(result.stack).toContain("throwsDeepInside");
  });

  test("a redacted Error's stack has its own secret-shaped fragments hidden too", () => {
    const err = new Error("boom");
    err.stack = `Error: boom\n    at handler (token=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U:1:1)`;
    const result = redact(err);
    expect(result.stack).toContain("[REDACTED]");
    expect(result.stack).not.toContain("eyJhbGciOiJIUzI1NiJ9");
  });

  // `LangChainWorkflowEngine` enveloppe systématiquement l'erreur d'une
  // étape dans `WorkflowError`, en gardant l'originale dans `.cause`
  // (voir langchain/errors.js) — `classifyAgentError()` dépaquette déjà ce
  // `.cause` pour la CLASSIFICATION ; avant ce correctif, ce même `.cause`
  // n'était JAMAIS visible dans ce qui est LOGGÉ (perdu par `redact()`).
  test("preserves .cause (recursively redacted), so the wrapped original error stays visible in logs", () => {
    const innerJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    const inner = new TypeError(`upstream failed, saw ${innerJwt}`);
    const outer = new Error("workflow step failed", { cause: inner });

    const result = redact(outer);
    expect(result.cause).toBeInstanceOf(Error);
    expect(result.cause.name).toBe("TypeError");
    expect(result.cause.message).toBe("upstream failed, saw [REDACTED_JWT]");
  });

  test("an Error with no .cause is redacted without adding a spurious cause: undefined", () => {
    const err = new Error("boom");
    const result = redact(err);
    expect("cause" in result).toBe(false);
  });

  test("handles a circular reference without throwing or looping forever", () => {
    const obj = { id: "u1" };
    obj.self = obj;
    expect(() => redact(obj)).not.toThrow();
    expect(redact(obj).self).toBe("[CIRCULAR]");
  });

  test("security/secretRedactor.js re-exports the exact same functions as utils/secretRedaction.js", () => {
    expect(secretRedactor.redact).toBe(redact);
    expect(secretRedactor.redactString).toBe(redactString);
  });
});
