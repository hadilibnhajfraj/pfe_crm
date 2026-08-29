"use strict";

const { DashboardService } = require("../src/ai/dashboard/dashboardService");
const { DashboardPermissionError } = require("../src/ai/dashboard/errors");

const ADMIN = { id: "a1", role: "admin" };

function fakeAnalyzer(domain, impl) {
  return { domain, analyze: jest.fn(impl || (async () => ({ domain, alerts: [], recommendations: [], anomalies: [], forecasts: [], risks: [], dataQuality: [], errors: [] }))) };
}

describe("DashboardService.listDomains", () => {
  test("lists every registered analyzer's domain", () => {
    const service = new DashboardService({ analyzers: new Map([["a", fakeAnalyzer("a")], ["b", fakeAnalyzer("b")]]) });
    expect(service.listDomains().sort()).toEqual(["a", "b"]);
  });
});

describe("DashboardService.getSnapshot", () => {
  test("runs every analyzer and aggregates results per domain and by category", async () => {
    const a = fakeAnalyzer("a", async () => ({ domain: "a", alerts: [{ type: "x" }], recommendations: [], anomalies: [], forecasts: [], risks: [], dataQuality: [], errors: [] }));
    const b = fakeAnalyzer("b", async () => ({ domain: "b", alerts: [{ type: "y" }], recommendations: [], anomalies: [], forecasts: [], risks: [], dataQuality: [], errors: [] }));
    const service = new DashboardService({ analyzers: new Map([["a", a], ["b", b]]) });

    const snapshot = await service.getSnapshot({ actingUser: ADMIN });

    expect(typeof snapshot.generatedAt).toBe("string");
    expect(snapshot.domains.a.alerts).toEqual([{ type: "x" }]);
    expect(snapshot.domains.b.alerts).toEqual([{ type: "y" }]);
    expect(snapshot.summary.alerts).toEqual([{ type: "x" }, { type: "y" }]);
  });

  test("an analyzer that throws (e.g. permission denied) is absorbed into that domain's errors, never blocking the others", async () => {
    const failing = fakeAnalyzer("failing", async () => {
      throw new DashboardPermissionError("failing", "user");
    });
    const ok = fakeAnalyzer("ok");
    const service = new DashboardService({ analyzers: new Map([["failing", failing], ["ok", ok]]) });

    const snapshot = await service.getSnapshot({ actingUser: ADMIN });

    expect(snapshot.domains.failing.errors).toEqual([{ message: expect.stringContaining("failing") }]);
    expect(snapshot.domains.ok).toBeDefined();
  });

  test("domains: [...] restricts the snapshot to the requested subset", async () => {
    const a = fakeAnalyzer("a");
    const b = fakeAnalyzer("b");
    const service = new DashboardService({ analyzers: new Map([["a", a], ["b", b]]) });

    const snapshot = await service.getSnapshot({ actingUser: ADMIN, domains: ["a"] });

    expect(Object.keys(snapshot.domains)).toEqual(["a"]);
    expect(b.analyze).not.toHaveBeenCalled();
  });

  test("every one of the 6 requested categories is present in the summary, even with zero analyzers", async () => {
    const service = new DashboardService({ analyzers: new Map() });
    const snapshot = await service.getSnapshot({ actingUser: ADMIN });
    expect(Object.keys(snapshot.summary).sort()).toEqual(["alerts", "anomalies", "dataQuality", "forecasts", "recommendations", "risks"].sort());
  });
});

describe("DashboardService.getDomainSnapshot", () => {
  test("returns null for a domain that isn't registered", async () => {
    const service = new DashboardService({ analyzers: new Map() });
    await expect(service.getDomainSnapshot("ghost", { actingUser: ADMIN })).resolves.toBeNull();
  });

  test("returns the single analyzer's result directly", async () => {
    const a = fakeAnalyzer("a", async () => ({ domain: "a", alerts: [{ type: "z" }], recommendations: [], anomalies: [], forecasts: [], risks: [], dataQuality: [], errors: [] }));
    const service = new DashboardService({ analyzers: new Map([["a", a]]) });
    await expect(service.getDomainSnapshot("a", { actingUser: ADMIN })).resolves.toMatchObject({ alerts: [{ type: "z" }] });
  });

  test("unlike getSnapshot, a permission error PROPAGATES rather than being absorbed — the caller asked for exactly this domain", async () => {
    const failing = fakeAnalyzer("failing", async () => {
      throw new DashboardPermissionError("failing", "user");
    });
    const service = new DashboardService({ analyzers: new Map([["failing", failing]]) });
    await expect(service.getDomainSnapshot("failing", { actingUser: ADMIN })).rejects.toThrow(DashboardPermissionError);
  });
});
