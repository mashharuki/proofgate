import { describe, expect, it } from "vitest";
import { DEFAULT_CASES, DEFAULT_SEED, readConfig } from "./support/config.js";
import { assertCoverage, Coverage } from "./support/coverage.js";
import { createRng, mulberry32, subSeed } from "./support/prng.js";

// PRNG、設定、カバレッジカウンタの基本性質を確認します（Property: P1, P26）。
describe("PBT support: PRNG", () => {
  it("returns the same sequence for the same seed and index", () => {
    const a = createRng(7, 3);
    const b = createRng(7, 3);
    const left = Array.from({ length: 20 }, () => a.next());
    const right = Array.from({ length: 20 }, () => b.next());
    expect(left).toEqual(right);
  });

  it("separates cases by index and by seed", () => {
    expect(subSeed(1, 0)).not.toBe(subSeed(1, 1));
    expect(subSeed(1, 0)).not.toBe(subSeed(2, 0));
  });

  it("keeps values in range", () => {
    const next = mulberry32(42);
    for (let i = 0; i < 1000; i++) {
      const value = next();
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    const rng = createRng(1, 1);
    for (let i = 0; i < 1000; i++) {
      const n = rng.int(2, 5);
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(5);
    }
  });

  it("shuffles without changing the elements or the input", () => {
    const rng = createRng(5, 5);
    const input = [1, 2, 3, 4, 5, 6];
    const output = rng.shuffle(input);
    expect([...output].sort()).toEqual(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("rejects picking from an empty array", () => {
    expect(() => createRng(1, 1).pick([])).toThrow("empty");
  });
});

describe("PBT support: configuration", () => {
  it("uses the fixed defaults", () => {
    const config = readConfig({});
    expect(config.seed).toBe(DEFAULT_SEED);
    expect(config.cases).toBe(DEFAULT_CASES);
    expect(config.only).toBeUndefined();
  });

  it("reads overrides and clamps the Lean case count to the case count", () => {
    const config = readConfig({
      PROOFGATE_PBT_SEED: "99",
      PROOFGATE_PBT_CASES: "300",
      PROOFGATE_PBT_LEAN_CASES: "5000",
      PROOFGATE_PBT_ONLY: "12",
    });
    expect(config).toMatchObject({ seed: 99, cases: 300, leanCases: 300, only: 12 });
  });

  it.each([
    ["PROOFGATE_PBT_SEED", "abc"],
    ["PROOFGATE_PBT_CASES", "-1"],
    ["PROOFGATE_PBT_CASES", "0"],
    ["PROOFGATE_PBT_LEAN_CASES", "1.5"],
    ["PROOFGATE_PBT_ONLY", "x"],
  ])("fails on an invalid %s value %s instead of using a default", (name, value) => {
    expect(() => readConfig({ [name]: value })).toThrow(name);
  });
});

describe("PBT support: coverage counters", () => {
  it("counts, reports missing keys, and fails on zero", () => {
    const coverage = new Coverage();
    coverage.add("a");
    coverage.add("a");
    coverage.add("b");
    expect(coverage.get("a")).toBe(2);
    expect(coverage.get("zzz")).toBe(0);
    expect(coverage.missing(["a", "b", "c"])).toEqual(["c"]);
    expect(coverage.summary()).toBe("a=2\nb=1");
    expect(() => assertCoverage(coverage, ["a", "c"])).toThrow("c");
    expect(() => assertCoverage(coverage, ["a", "b"])).not.toThrow();
  });
});
