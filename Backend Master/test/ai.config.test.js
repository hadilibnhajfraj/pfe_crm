"use strict";

// Direct unit tests for loadAiConfig() — the actual root cause of the
// "AI_COPILOT_ENABLED=true mais le Copilot reste désactivé" incident was
// NOT a parsing bug (Joi's truthy("true")/falsy("false") already handled
// the exact string "true" correctly) but a real .env missing the whole
// AI_COPILOT_*/AI_LLM_* block entirely (undefined -> Joi default -> false).
// This suite hardens the parsing anyway (trim/case-insensitive) so a
// hand-edited value like " TRUE " never falls through to "disabled" the
// same way an entirely absent variable does — and locks in the diagnostic
// log line used to catch this class of incident immediately at boot.

const { loadAiConfig } = require("../src/ai/config");
const { createDefaultAiManager } = require("../src/ai/manager");

// End-to-end from a raw env object (the exact shape `process.env` has once
// dotenv loads the real .env) through to isEnabled()/isRoleAllowed() —
// proves the WIRING across ai.config.js -> AiManager is sound, which a
// pure loadAiConfig() unit test alone would not: the real incident was a
// missing block in the .env file feeding this chain, not a bug inside any
// single function.
describe("createDefaultAiManager — full env-to-gate wiring", () => {
  test("a .env that never defines the AI_COPILOT_* block at all (the real incident) resolves to disabled, not a crash and not a false enable", () => {
    const envWithoutAnyAiCopilotBlock = { PORT: "4000", DB_HOST: "127.0.0.1", JWT_SECRET: "x" };
    const manager = createDefaultAiManager(envWithoutAnyAiCopilotBlock);
    expect(manager.isEnabled()).toBe(false);
    expect(manager.isRoleAllowed("admin")).toBe(false);
  });

  test("a .env with the AI_COPILOT_* block correctly populated (the fix) opens the gate for the allowed roles only", () => {
    const manager = createDefaultAiManager({
      AI_COPILOT_ENABLED: "true",
      AI_COPILOT_ROLES_ALLOWED: "admin,superadmin",
    });
    expect(manager.isEnabled()).toBe(true);
    expect(manager.isRoleAllowed("admin")).toBe(true);
    expect(manager.isRoleAllowed("commercial")).toBe(false);
  });
});

describe("loadAiConfig — AI_COPILOT_ENABLED parsing", () => {
  test.each([
    ["true", true],
    ["false", false],
    [" TRUE ", true], // padded + uppercase — must still enable, never crash
    ["  false  ", false],
    ["True", true],
    ["FALSE", false],
    ["", false],
    ["yes", false], // not a recognised truthy value — fails closed, never a guess
    ["1", false], // same — only the literal word "true" (any case/whitespace) enables
    [undefined, false], // variable entirely absent from .env
  ])("AI_COPILOT_ENABLED=%p -> enabled=%p", (raw, expected) => {
    const env = raw === undefined ? {} : { AI_COPILOT_ENABLED: raw };
    expect(loadAiConfig(env).enabled).toBe(expected);
  });

  test("never uses the `if (!process.env.AI_COPILOT_ENABLED)` anti-pattern — the STRING \"false\" must resolve to disabled, not enabled", () => {
    // A naive `!value` check treats any non-empty string (including the
    // literal word "false") as truthy — this locks in the correct,
    // opposite behavior.
    expect(loadAiConfig({ AI_COPILOT_ENABLED: "false" }).enabled).toBe(false);
  });

  test("an entirely missing .env (no AI_COPILOT_ENABLED key at all) is a controlled, safe default — never a crash", () => {
    expect(() => loadAiConfig({})).not.toThrow();
    expect(loadAiConfig({}).enabled).toBe(false);
  });
});

describe("loadAiConfig — provider fields", () => {
  test("trims provider/model/apiKey and reports absent ones as null, never an empty string", () => {
    const config = loadAiConfig({ AI_LLM_PROVIDER: "  openai  ", AI_LLM_MODEL: " gpt-4o-mini ", AI_LLM_API_KEY: "" });
    expect(config.llm.provider).toBe("openai");
    expect(config.llm.model).toBe("gpt-4o-mini");
    expect(config.llm.apiKey).toBeNull();
  });

  test("no provider configured at all -> every llm field is null", () => {
    const config = loadAiConfig({});
    expect(config.llm).toEqual({ provider: null, model: null, apiKey: null, ollamaBaseUrl: null, ollamaModel: null, ollamaTimeoutMs: null });
  });

  // Ollama-only fields (see providers/ollamaProvider.js,
  // AI-Business-Copilot/20_OLLAMA_PROVIDER.md) — trimmed/nulled exactly
  // like provider/model/apiKey above, never populated for other providers.
  test("trims OLLAMA_BASE_URL/OLLAMA_MODEL and reports absent ones as null", () => {
    const config = loadAiConfig({ OLLAMA_BASE_URL: "  http://localhost:11434  ", OLLAMA_MODEL: " qwen3:8b " });
    expect(config.llm.ollamaBaseUrl).toBe("http://localhost:11434");
    expect(config.llm.ollamaModel).toBe("qwen3:8b");
  });

  // AI-Business-Copilot/23_OLLAMA_TIMEOUT_STABILIZATION.md — read as a
  // plain string then parsed (never Joi.number()): a malformed value must
  // never crash the process at boot, only fall back to the provider's own
  // default (see ollamaProvider.js::DEFAULT_TIMEOUT_MS).
  test("parses a valid OLLAMA_TIMEOUT_MS to a positive integer", () => {
    const config = loadAiConfig({ OLLAMA_TIMEOUT_MS: "180000" });
    expect(config.llm.ollamaTimeoutMs).toBe(180000);
  });

  test("absent OLLAMA_TIMEOUT_MS -> null (falls back to OllamaProvider's own default)", () => {
    const config = loadAiConfig({});
    expect(config.llm.ollamaTimeoutMs).toBeNull();
  });

  test.each([["not-a-number"], ["-500"], ["0"], [""]])("an invalid OLLAMA_TIMEOUT_MS (%p) never crashes — ignored, falls back to null", (raw) => {
    expect(() => loadAiConfig({ OLLAMA_TIMEOUT_MS: raw })).not.toThrow();
    expect(loadAiConfig({ OLLAMA_TIMEOUT_MS: raw }).llm.ollamaTimeoutMs).toBeNull();
  });
});

describe("loadAiConfig — [AI-COPILOT] diagnostic log", () => {
  let infoSpy;

  beforeEach(() => {
    infoSpy = jest.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    infoSpy.mockRestore();
  });

  test("logs a greppable [AI-COPILOT] line with the resolved enabled value on every load", () => {
    loadAiConfig({ AI_COPILOT_ENABLED: "true" });
    const logged = infoSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).toContain("[AI-COPILOT] enabled=true");
  });

  test("the diagnostic log NEVER contains the LLM API key", () => {
    loadAiConfig({ AI_COPILOT_ENABLED: "true", AI_LLM_PROVIDER: "openai", AI_LLM_MODEL: "gpt-4o-mini", AI_LLM_API_KEY: "sk-super-secret-value" });
    const logged = infoSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).not.toContain("sk-super-secret-value");
  });

  test("the diagnostic log NEVER contains the roles-allowed list content, only enabled/provider", () => {
    loadAiConfig({ AI_COPILOT_ENABLED: "true", AI_COPILOT_ROLES_ALLOWED: "admin,superadmin" });
    const logged = infoSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).not.toContain("admin,superadmin");
  });
});
