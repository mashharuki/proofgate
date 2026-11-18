import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate/core";
import { describe, expect, it } from "vitest";
import { DEFAULT_SEED } from "./support/config.js";
import {
  type BatchCase,
  buildBatchSource,
  HarnessError,
  InfrastructureError,
  launchesFor,
  leanLaunchCount,
  MAX_CASES_PER_LAUNCH,
  runBatch,
  runBatchSource,
} from "./support/lean-batch.js";
import { BOUNDARY_COUNT, generateCases } from "./support/model-gen.js";

const leanDirectory = join(process.cwd(), "packages/cdk-plugin/lean");
const options = { leanDirectory };
const LEAN_TIMEOUT = 120_000;

/** 実際のTypeScript判定を付けた小さなバッチを作ります。 */
function batch(count: number): BatchCase[] {
  return generateCases(DEFAULT_SEED, BOUNDARY_COUNT)
    .slice(0, count)
    .map((c) => ({
      id: c.id,
      model: c.model,
      config: c.config,
      ts: evaluate(c.model, c.config).length > 0 ? ("unsafe" as const) : ("safe" as const),
    }));
}

// Leanバッチ実行器の判定規則（Property: P9, P11, P12, P13）。
describe("Lean batch runner: building", () => {
  it("rejects a generateLean output of a different shape with a harness error naming the case", () => {
    const cases = batch(3);
    const changed = (model: BatchCase["model"], config: BatchCase["config"]) =>
      `${generateLean(model, config)}-- extra line\n`;
    expect(() => buildBatchSource(cases, changed)).toThrow(HarnessError);
    expect(() => buildBatchSource(cases, changed)).toThrow(`case ${cases[0]?.id}`);
  });

  it("records one line range per case", () => {
    const cases = batch(4);
    const built = buildBatchSource(cases, generateLean);
    expect(built.ranges.map((r) => r.id)).toEqual(cases.map((c) => c.id));
    for (const range of built.ranges) expect(range.end).toBeGreaterThanOrEqual(range.start);
  });
});

describe("Lean batch runner: launches", () => {
  it("needs one launch up to the batch limit and splits evenly above it", () => {
    expect(launchesFor(1)).toBe(1);
    expect(launchesFor(MAX_CASES_PER_LAUNCH)).toBe(1);
    expect(launchesFor(MAX_CASES_PER_LAUNCH + 1)).toBe(2);
    expect(launchesFor(MAX_CASES_PER_LAUNCH * 5)).toBe(5);
  });

  it("does not start Lean for an empty batch", () => {
    const before = leanLaunchCount();
    expect(runBatch([], generateLean, options).verdicts.size).toBe(0);
    expect(leanLaunchCount()).toBe(before);
  });
});

describe("Lean batch runner: classification with real Lean", () => {
  it(
    "reads one verdict per case in a single launch when everything agrees",
    () => {
      const cases = batch(BOUNDARY_COUNT);
      const before = leanLaunchCount();
      const result = runBatch(cases, generateLean, options);
      expect(leanLaunchCount() - before).toBe(1);
      expect(result.failed.size).toBe(0);
      for (const c of cases) expect(result.verdicts.get(c.id), `case ${c.id}`).toBe(c.ts);
    },
    LEAN_TIMEOUT,
  );

  it(
    "attributes a wrong theorem to the right case and still reads the other verdicts",
    () => {
      const cases = batch(5);
      const wrong = cases.map((c, i) =>
        i === 2 ? { ...c, ts: c.ts === "safe" ? ("unsafe" as const) : ("safe" as const) } : c,
      );
      const result = runBatch(wrong, generateLean, options);
      expect([...result.failed]).toEqual([cases[2]?.id]);
      expect(result.verdicts.get(cases[2]?.id as number)).toBe(cases[2]?.ts);
      expect(result.verdicts.size).toBe(5);
    },
    LEAN_TIMEOUT,
  );

  it(
    "fails as infrastructure when an unmapped error appears even though every marker is present",
    () => {
      const built = buildBatchSource(batch(3), generateLean);
      const polluted = { ...built, source: `${built.source}#check noSuchIdentifier\n` };
      expect(() => runBatchSource(polluted, options)).toThrow(InfrastructureError);
      expect(() => runBatchSource(polluted, options)).toThrow("map to no case");
    },
    LEAN_TIMEOUT,
  );

  it(
    "fails as infrastructure when a verdict marker is missing",
    () => {
      const built = buildBatchSource(batch(3), generateLean);
      const lines = built.source.split("\n");
      const index = lines.findIndex((l) => l.startsWith("#eval"));
      lines[index] = "-- marker removed";
      expect(() => runBatchSource({ ...built, source: lines.join("\n") }, options)).toThrow(
        "no verdict marker",
      );
    },
    LEAN_TIMEOUT,
  );

  it(
    "does not assume the rest passes when the error list may be truncated",
    () => {
      const base = batch(1)[0] as BatchCase;
      const many = Array.from({ length: 120 }, (_, id) => ({
        ...base,
        id,
        ts: base.ts === "safe" ? ("unsafe" as const) : ("safe" as const),
      }));
      expect(() => runBatch(many, generateLean, options)).toThrow("truncated");
    },
    LEAN_TIMEOUT,
  );

  it("fails as infrastructure when the Lean project is not built", () => {
    const empty = mkdtempSync(join(tmpdir(), "proofgate-nolake-"));
    try {
      const built = buildBatchSource(batch(1), generateLean);
      expect(() => runBatchSource(built, { leanDirectory: empty })).toThrow("not built");
    } finally {
      rmSync(empty, { recursive: true, force: true });
    }
  });
});
