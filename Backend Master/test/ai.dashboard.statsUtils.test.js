"use strict";

const { detectNumericOutliers, mean, stdDev } = require("../src/ai/dashboard/statsUtils");

describe("mean/stdDev", () => {
  test("computes the mean", () => {
    expect(mean([1, 2, 3])).toBe(2);
  });

  test("computes the population standard deviation", () => {
    expect(stdDev([2, 4, 4, 4, 5, 5, 7, 9], 5)).toBeCloseTo(2, 5);
  });
});

describe("detectNumericOutliers", () => {
  test("returns [] with fewer than 3 numeric values (a z-score is meaningless on so small a sample)", () => {
    expect(detectNumericOutliers([{ v: 1 }, { v: 2 }], "v")).toEqual([]);
  });

  test("returns [] when every value is identical (zero standard deviation)", () => {
    expect(detectNumericOutliers([{ v: 5 }, { v: 5 }, { v: 5 }], "v")).toEqual([]);
  });

  test("ignores items whose field is missing or non-numeric", () => {
    const items = [{ v: 1 }, { v: 2 }, { v: "not a number" }, { v: null }];
    expect(detectNumericOutliers(items, "v")).toEqual([]);
  });

  test("flags a value clearly outside the rest of the distribution", () => {
    // A single extreme value among too few points distorts the very mean/
    // stddev used to detect it (a known z-score "masking" limitation) — a
    // wider, more realistic sample avoids that here.
    const items = [
      { id: "a", v: 10 }, { id: "b", v: 10 }, { id: "c", v: 10 }, { id: "d", v: 10 },
      { id: "e", v: 10 }, { id: "f", v: 10 }, { id: "g", v: 10 }, { id: "h", v: 10 },
      { id: "outlier", v: 100 },
    ];
    const outliers = detectNumericOutliers(items, "v", { zScoreThreshold: 2 });
    expect(outliers).toHaveLength(1);
    expect(outliers[0].item.id).toBe("outlier");
    expect(outliers[0].zScore).toBeGreaterThan(2);
  });

  test("a higher zScoreThreshold is stricter (fewer or equal outliers)", () => {
    const items = [{ id: "a", v: 10 }, { id: "b", v: 11 }, { id: "c", v: 9 }, { id: "d", v: 10 }, { id: "e", v: 40 }];
    const lenient = detectNumericOutliers(items, "v", { zScoreThreshold: 1 });
    const strict = detectNumericOutliers(items, "v", { zScoreThreshold: 3 });
    expect(strict.length).toBeLessThanOrEqual(lenient.length);
  });
});
