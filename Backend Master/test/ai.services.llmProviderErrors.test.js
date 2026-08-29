"use strict";

// Covers the error-family classification (AI_PROVIDER_AUTH_ERROR/
// AI_PROVIDER_UNAVAILABLE/AI_PROVIDER_TIMEOUT) and the controlled retry
// added while wiring OpenAI as the first real provider — see
// AI-Business-Copilot/08_LLM_PROVIDER_OPENAI.md. axios is mocked
// (jest.mock("axios")) — no real network call, ever.

jest.mock("axios");
const axios = require("axios");

const { OpenAiProvider } = require("../src/ai/services/providers/openAiProvider");
const { AnthropicProvider } = require("../src/ai/services/providers/anthropicProvider");
const { OllamaProvider } = require("../src/ai/services/providers/ollamaProvider");
const {
  classifyProviderHttpError,
  describeProviderHttpError,
  LlmProviderAuthError,
  LlmProviderUnavailableError,
  LlmProviderTimeoutError,
  LlmProviderRequestError,
} = require("../src/ai/services/providers/errors");
const { withControlledRetry, isRetryableProviderError } = require("../src/ai/services/providers/retry");

let postMock;

beforeEach(() => {
  postMock = jest.fn();
  axios.create.mockReturnValue({ post: postMock });
});

describe("classifyProviderHttpError — one raw axios error -> exactly one family", () => {
  test("401/403 -> LlmProviderAuthError", () => {
    expect(classifyProviderHttpError({ response: { status: 401 } }, "OpenAI")).toBeInstanceOf(LlmProviderAuthError);
    expect(classifyProviderHttpError({ response: { status: 403 } }, "OpenAI")).toBeInstanceOf(LlmProviderAuthError);
  });

  test("ECONNABORTED/ETIMEDOUT -> LlmProviderTimeoutError", () => {
    expect(classifyProviderHttpError({ code: "ECONNABORTED" }, "OpenAI")).toBeInstanceOf(LlmProviderTimeoutError);
    expect(classifyProviderHttpError({ code: "ETIMEDOUT" }, "OpenAI")).toBeInstanceOf(LlmProviderTimeoutError);
  });

  test("5xx -> LlmProviderUnavailableError", () => {
    expect(classifyProviderHttpError({ response: { status: 500 } }, "OpenAI")).toBeInstanceOf(LlmProviderUnavailableError);
    expect(classifyProviderHttpError({ response: { status: 503 } }, "OpenAI")).toBeInstanceOf(LlmProviderUnavailableError);
  });

  // Hit live while reproducing AI-Business-Copilot/09_INCIDENT_KPI_AGENT.md
  // (real OpenAI 429 during manual testing) — a rate limit previously fell
  // through to the generic, non-retried LlmProviderRequestError.
  test("429 (rate limit) -> LlmProviderUnavailableError, worth the same bounded retry as a 5xx", () => {
    const result = classifyProviderHttpError({ response: { status: 429 } }, "OpenAI");
    expect(result).toBeInstanceOf(LlmProviderUnavailableError);
    expect(isRetryableProviderError(result)).toBe(true);
  });

  test("no response at all (network-level failure, e.g. DNS/connection-refused) -> LlmProviderUnavailableError", () => {
    expect(classifyProviderHttpError(new Error("getaddrinfo ENOTFOUND api.openai.com"), "OpenAI")).toBeInstanceOf(LlmProviderUnavailableError);
  });

  test("an unrecognised 4xx (e.g. 400 bad request) -> the generic LlmProviderRequestError, never mis-classified as auth/unavailable/timeout", () => {
    const result = classifyProviderHttpError({ response: { status: 400 } }, "OpenAI");
    expect(result).toBeInstanceOf(LlmProviderRequestError);
    expect(result).not.toBeInstanceOf(LlmProviderAuthError);
    expect(result).not.toBeInstanceOf(LlmProviderUnavailableError);
    expect(result).not.toBeInstanceOf(LlmProviderTimeoutError);
  });

  test("every classified error's message is fixed and provider-named — never the raw err.message", () => {
    const raw = { response: { status: 401 }, message: "Authorization: Bearer sk-real-secret-value" };
    const result = classifyProviderHttpError(raw, "OpenAI");
    expect(result.message).not.toContain("sk-real-secret-value");
    expect(result.message).toContain("OpenAI");
  });
});

// AI-Business-Copilot/13_LLM_QUOTA_ROOT_CAUSE.md — `classifyProviderHttpError`
// (ci-dessus) reste volontairement générique pour la réponse UTILISATEUR ;
// `describeProviderHttpError` est un utilitaire SÉPARÉ, réservé aux LOGS
// SERVEUR, qui garde le corps réel de la réponse du fournisseur (jamais un
// secret — la clé API ne voyage que dans l'en-tête de la requête, jamais
// échoée dans une réponse d'erreur) : c'est ce corps qui a permis de
// diagnostiquer la cause exacte (quota OpenAI épuisé, `insufficient_quota`/
// `credit_balance_exhausted`) sans avoir à rejouer un appel HTTP séparé.
describe("describeProviderHttpError — le VRAI corps de réponse pour les logs serveur (jamais pour l'utilisateur)", () => {
  test("un corps d'erreur réel du fournisseur (ex. quota OpenAI épuisé) est préservé intégralement", () => {
    const raw = {
      response: {
        status: 429,
        data: { error: { message: "You have no credits remaining.", type: "insufficient_quota", code: "credit_balance_exhausted" } },
      },
    };
    const described = describeProviderHttpError(raw);
    expect(described).toContain("status=429");
    expect(described).toContain("insufficient_quota");
    expect(described).toContain("credit_balance_exhausted");
  });

  test("sans corps de réponse (échec réseau), retombe sur err.message", () => {
    const described = describeProviderHttpError(new Error("getaddrinfo ENOTFOUND api.openai.com"));
    expect(described).toContain("status=n/a");
    expect(described).toContain("getaddrinfo ENOTFOUND");
  });

  test("ne contient jamais la clé API — un en-tête Authorization ne fait jamais partie du corps de réponse", () => {
    const raw = { response: { status: 401, data: { error: { message: "Incorrect API key provided" } } } };
    const described = describeProviderHttpError(raw);
    expect(described).not.toMatch(/Bearer|sk-/);
  });
});

describe("OpenAiProvider — journalise le VRAI corps de réponse (status + détail), pas seulement err.message", () => {
  test("un 429 avec un corps d'erreur détaillé est journalisé avec ce détail, jamais seulement 'Request failed with status code 429'", async () => {
    const loggerModule = require("../src/utils/logger");
    const errorSpy = jest.spyOn(loggerModule, "error").mockImplementation(() => {});

    const axiosError = new Error("Request failed with status code 429");
    axiosError.response = {
      status: 429,
      data: { error: { message: "You have no credits remaining.", type: "insufficient_quota", code: "credit_balance_exhausted" } },
    };
    postMock.mockRejectedValue(axiosError);
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini" });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmProviderUnavailableError);

    const logged = errorSpy.mock.calls.map((args) => args.join(" ")).join("\n");
    expect(logged).toContain("insufficient_quota");
    expect(logged).toContain("credit_balance_exhausted");
    errorSpy.mockRestore();
  });
});

describe("isRetryableProviderError", () => {
  test("unavailable/timeout are retryable, auth/generic are not", () => {
    expect(isRetryableProviderError(new LlmProviderUnavailableError("OpenAI"))).toBe(true);
    expect(isRetryableProviderError(new LlmProviderTimeoutError("OpenAI"))).toBe(true);
    expect(isRetryableProviderError(new LlmProviderAuthError("OpenAI"))).toBe(false);
    expect(isRetryableProviderError(new LlmProviderRequestError("OpenAI"))).toBe(false);
    expect(isRetryableProviderError(new Error("plain"))).toBe(false);
  });
});

describe("withControlledRetry", () => {
  test("succeeds on the first attempt without ever calling wait()", async () => {
    const wait = jest.fn();
    const fn = jest.fn().mockResolvedValue("ok");
    await expect(withControlledRetry(fn, { wait })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  test("retries exactly once on a retryable failure, then succeeds — never a third attempt", async () => {
    const wait = jest.fn().mockResolvedValue(undefined);
    const fn = jest.fn().mockRejectedValueOnce(new LlmProviderUnavailableError("OpenAI")).mockResolvedValueOnce("ok on retry");
    await expect(withControlledRetry(fn, { wait })).resolves.toBe("ok on retry");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledTimes(1);
  });

  test("a NON-retryable failure (auth) is thrown immediately — never retried, never calls wait()", async () => {
    const wait = jest.fn();
    const authError = new LlmProviderAuthError("OpenAI");
    const fn = jest.fn().mockRejectedValue(authError);
    await expect(withControlledRetry(fn, { wait })).rejects.toBe(authError);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });

  test("a retryable failure that NEVER succeeds still stops at the configured attempt count — never unbounded", async () => {
    const wait = jest.fn().mockResolvedValue(undefined);
    const persistentError = new LlmProviderTimeoutError("OpenAI");
    const fn = jest.fn().mockRejectedValue(persistentError);
    await expect(withControlledRetry(fn, { attempts: 2, wait })).rejects.toBe(persistentError);
    expect(fn).toHaveBeenCalledTimes(2);
  });
});

describe("OpenAiProvider — end-to-end error classification + controlled retry (mocked axios, injected wait)", () => {
  const fastRetry = () => ({ wait: jest.fn().mockResolvedValue(undefined) });

  test("a 401 response never retries and rejects with LlmProviderAuthError, never leaking the key", async () => {
    postMock.mockRejectedValue({ response: { status: 401, data: { error: "invalid_api_key" } } });
    const provider = new OpenAiProvider({ apiKey: "sk-real-secret", model: "gpt-4o-mini", retry: fastRetry() });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmProviderAuthError);
    expect(postMock).toHaveBeenCalledTimes(1); // never retried
  });

  test("a transient 503 retries once, then succeeds with the real completion text", async () => {
    postMock
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { choices: [{ message: { content: "Copilot opérationnel." } }] } });
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini", retry: fastRetry() });

    await expect(provider.complete([{ role: "user", content: "hi" }])).resolves.toBe("Copilot opérationnel.");
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  test("token usage is logged (visibility) but never changes the string return contract", async () => {
    const infoSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    postMock.mockResolvedValue({
      data: { choices: [{ message: { content: "ok" } }], usage: { prompt_tokens: 12, completion_tokens: 3, total_tokens: 15 } },
    });
    const provider = new OpenAiProvider({ apiKey: "sk-test", model: "gpt-4o-mini", retry: fastRetry() });

    const result = await provider.complete([{ role: "user", content: "hi" }]);
    expect(result).toBe("ok"); // contract unchanged — a plain string, never an object
    expect(infoSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("token usage: prompt=12 completion=3 total=15");
    infoSpy.mockRestore();
  });
});

// Mirrors the "OpenAiProvider — end-to-end error classification + controlled
// retry" block above: AnthropicProvider shares the exact same
// classifyProviderHttpError/withControlledRetry machinery (see
// anthropicProvider.js's own header comment), so it must behave identically
// on the same three axes — added alongside the Anthropic provider work
// (see AI-Business-Copilot/19_ANTHROPIC_PROVIDER.md).
describe("AnthropicProvider — end-to-end error classification + controlled retry (mocked axios, injected wait)", () => {
  const fastRetry = () => ({ wait: jest.fn().mockResolvedValue(undefined) });

  test("a 401 response never retries and rejects with LlmProviderAuthError, never leaking the key", async () => {
    postMock.mockRejectedValue({ response: { status: 401, data: { error: "invalid_api_key" } } });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-real-secret", model: "claude-3-5-sonnet-latest", retry: fastRetry() });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmProviderAuthError);
    expect(postMock).toHaveBeenCalledTimes(1); // never retried
  });

  test("a transient 503 retries once, then succeeds with the real completion text", async () => {
    postMock
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { content: [{ type: "text", text: "Copilot opérationnel." }] } });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest", retry: fastRetry() });

    await expect(provider.complete([{ role: "user", content: "hi" }])).resolves.toBe("Copilot opérationnel.");
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  test("token usage is logged (visibility) but never changes the string return contract", async () => {
    const infoSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    postMock.mockResolvedValue({
      data: { content: [{ type: "text", text: "ok" }], usage: { input_tokens: 12, output_tokens: 3 } },
    });
    const provider = new AnthropicProvider({ apiKey: "sk-ant-test", model: "claude-3-5-sonnet-latest", retry: fastRetry() });

    const result = await provider.complete([{ role: "user", content: "hi" }]);
    expect(result).toBe("ok"); // contract unchanged — a plain string, never an object
    expect(infoSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("token usage: input=12 output=3");
    infoSpy.mockRestore();
  });
});

// Mirrors the two blocks above for OllamaProvider — same shared
// classifyProviderHttpError/withControlledRetry machinery, but the two
// failure modes actually worth exercising here are Ollama-specific (no
// auth exists to reject, so 401 is not a real scenario for this provider):
// the server not running (connection refused — retried, like any other
// network-level failure) and a model that hasn't been pulled locally (404 —
// never retried, retrying would never make a missing model appear). Added
// alongside the Ollama provider work (see
// AI-Business-Copilot/20_OLLAMA_PROVIDER.md).
describe("OllamaProvider — end-to-end error classification + controlled retry (mocked axios, injected wait)", () => {
  const fastRetry = () => ({ wait: jest.fn().mockResolvedValue(undefined) });

  test("Ollama not running (connection refused) is retried once, then succeeds", async () => {
    postMock
      .mockRejectedValueOnce(Object.assign(new Error("connect ECONNREFUSED 127.0.0.1:11434"), { code: "ECONNREFUSED" }))
      .mockResolvedValueOnce({ data: { message: { role: "assistant", content: "Copilot opérationnel." }, done: true } });
    const provider = new OllamaProvider({ model: "qwen3:8b", retry: fastRetry() });

    await expect(provider.complete([{ role: "user", content: "hi" }])).resolves.toBe("Copilot opérationnel.");
    expect(postMock).toHaveBeenCalledTimes(2);
  });

  test("a model that hasn't been pulled (404) is never retried and rejects with the generic LlmProviderRequestError", async () => {
    postMock.mockRejectedValue({ response: { status: 404, data: { error: 'model "qwen3:8b" not found, try pulling it first' } } });
    const provider = new OllamaProvider({ model: "qwen3:8b", retry: fastRetry() });

    await expect(provider.complete([{ role: "user", content: "hi" }])).rejects.toBeInstanceOf(LlmProviderRequestError);
    expect(postMock).toHaveBeenCalledTimes(1); // never retried — a missing model won't appear on retry
  });

  test("token usage (prompt_eval_count/eval_count) is logged but never changes the string return contract", async () => {
    const infoSpy = jest.spyOn(console, "log").mockImplementation(() => {});
    postMock.mockResolvedValue({
      data: { message: { role: "assistant", content: "ok" }, done: true, prompt_eval_count: 12, eval_count: 3 },
    });
    const provider = new OllamaProvider({ model: "qwen3:8b", retry: fastRetry() });

    const result = await provider.complete([{ role: "user", content: "hi" }]);
    expect(result).toBe("ok");
    expect(infoSpy.mock.calls.map((c) => c.join(" ")).join("\n")).toContain("token usage: prompt=12 completion=3");
    infoSpy.mockRestore();
  });
});
