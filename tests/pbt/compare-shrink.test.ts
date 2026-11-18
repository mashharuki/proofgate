import type { Violation } from "@proofgate/model";
import { describe, expect, it } from "vitest";
import { explainedTags, isExplained, judgeCase, tsVerdict } from "./support/compare.js";
import { DEFAULT_SEED } from "./support/config.js";
import { HarnessError } from "./support/lean-batch.js";
import { type Case, generateCase, generateCases } from "./support/model-gen.js";
import { oracleVerdict } from "./support/oracle.js";
import { formatCounterexample, formatHarnessError, replayCommand } from "./support/report.js";
import { isValid, reductions, type Shrinkable, shrink, sizeOf } from "./support/shrink.js";

const seed = DEFAULT_SEED;
const all = generateCases(seed, 400);
const firstOf = (category: Case["category"], label?: Case["label"]) =>
  all.find((c) => c.category === category && (label === undefined || c.label === label)) as Case;

const violation = (over: Partial<Violation> = {}): Violation => ({
  ruleId: "PG-IAM-004",
  principalLogicalId: "P",
  targetRoleLogicalId: "T",
  protectedBucketArn: "arn:aws:s3:::b",
  sourcePaths: ["x"],
  explanation: "e",
  ...over,
});

// 比較規則（Property: P5, P6, P7, P9）。
describe("comparison rules", () => {
  it("accepts the expected verdicts", () => {
    const unsafe = firstOf("unsafe");
    expect(judgeCase(unsafe, "unsafe", [violation()], "unsafe")).toEqual([]);
    const safe = firstOf("safe");
    expect(judgeCase(safe, "safe", [], "safe")).toEqual([]);
  });

  it("reports a missed escalation as a soundness failure", () => {
    const found = judgeCase(firstOf("unsafe"), "unsafe", [], "safe");
    expect(found.map((f) => f.kind)).toEqual(["soundness"]);
  });

  it("reports an unexpected unsafe on a safe Case as a false alarm", () => {
    const found = judgeCase(firstOf("safe"), "safe", [violation()], "unsafe");
    expect(found.map((f) => f.kind)).toEqual(["false-alarm"]);
  });

  it("reports a Lean disagreement even when TypeScript is right", () => {
    const found = judgeCase(firstOf("safe"), "safe", [], "unsafe");
    expect(found.map((f) => f.kind)).toEqual(["ts-lean"]);
  });

  it("does not compare Lean when it was not run", () => {
    expect(judgeCase(firstOf("safe"), "safe", [], undefined)).toEqual([]);
  });

  it("treats O1 and O2 disagreement as a harness error", () => {
    expect(() => judgeCase(firstOf("unsafe"), "safe", [], undefined)).toThrow(HarnessError);
  });

  it("accepts a conservative unsafe only when a tagged statement explains it", () => {
    const conservative = firstOf("conservative");
    const path = conservative.witness.paths[0];
    const role = conservative.witness.roles[0];
    const explained = violation(
      path === undefined ? { targetRoleLogicalId: role as string } : { sourcePaths: [path] },
    );
    expect(judgeCase(conservative, "safe", [explained], "unsafe")).toEqual([]);
    expect(judgeCase(conservative, "safe", [], "safe")).toEqual([]);
    const unexplained = violation({ sourcePaths: ["unrelated"], targetRoleLogicalId: "Nobody" });
    expect(judgeCase(conservative, "safe", [unexplained], "unsafe").map((f) => f.kind)).toEqual([
      "unexplained-alarm",
    ]);
    // 1件でも説明できないviolationがあれば、説明可能とは認めません。
    expect(isExplained(conservative, [explained, unexplained])).toBe(false);
    expect(explainedTags(conservative, [explained])).toEqual(conservative.tags);
    expect(explainedTags(conservative, [unexplained])).toEqual([]);
  });

  it("never explains an unsafe verdict on a Case without tags", () => {
    const unsafe = firstOf("unsafe");
    expect(isExplained(unsafe, [violation()])).toBe(false);
    expect(tsVerdict([violation()])).toBe("unsafe");
    expect(tsVerdict([])).toBe("safe");
  });
});

// 縮小器（Property: P17, P18）。実際のオラクルを「元の不一致が残る」条件に使います。
describe("shrinker", () => {
  const unsafeCase = all.find((c) => c.category === "unsafe" && c.model.roles.length === 4) as Case;
  const start: Shrinkable = { model: unsafeCase.model, config: unsafeCase.config };
  const stillUnsafe = (s: Shrinkable) => oracleVerdict(s.model, s.config) === "unsafe";

  it("only proposes valid StackModels", () => {
    for (const c of all.slice(0, 120)) {
      const candidates = reductions({ model: c.model, config: c.config });
      for (const candidate of candidates) expect(isValid(candidate)).toBe(true);
    }
  });

  it("keeps the failure, stays valid, and reduces the size", () => {
    expect(stillUnsafe(start)).toBe(true);
    const result = shrink(start, {
      maxRounds: 200,
      check: (candidates) => candidates.map(stillUnsafe),
      confirm: stillUnsafe,
    });
    expect(result.confirmed).toBe(true);
    expect(isValid(result.result)).toBe(true);
    expect(stillUnsafe(result.result)).toBe(true);
    expect(result.sizeAfter).toBeLessThan(result.sizeBefore);
    expect(result.sizeAfter).toBe(sizeOf(result.result));
    // 4条件を成立させるには、2ロールと少数のStatementが必要です。
    expect(result.result.model.roles.length).toBe(2);
  });

  it("never returns something larger than its input", () => {
    for (const c of all.filter((x) => x.label === "unsafe").slice(0, 25)) {
      const s: Shrinkable = { model: c.model, config: c.config };
      const result = shrink(s, {
        maxRounds: 200,
        check: (candidates) => candidates.map(stillUnsafe),
        confirm: stillUnsafe,
      });
      expect(result.sizeAfter).toBeLessThanOrEqual(result.sizeBefore);
    }
  });

  it("stops after the round limit", () => {
    const result = shrink(start, {
      maxRounds: 1,
      check: (candidates) => candidates.map(stillUnsafe),
      confirm: stillUnsafe,
    });
    expect(result.rounds).toBe(1);
    expect(result.sizeBefore - result.sizeAfter).toBeGreaterThan(0);
  });

  it("falls back to the last confirmed Case when the final confirmation fails", () => {
    let confirmations = 0;
    const result = shrink(start, {
      maxRounds: 200,
      check: (candidates) => candidates.map(stillUnsafe),
      // 縮小しきった最初の確認だけ失敗させ、1つ前の候補が採用されることを確かめます。
      confirm: (s) => {
        confirmations += 1;
        return confirmations > 1 && stillUnsafe(s);
      },
    });
    expect(confirmations).toBeGreaterThan(1);
    expect(result.confirmed).toBe(true);
    expect(result.sizeAfter).toBeGreaterThan(0);
  });

  it("returns the original Case, unconfirmed, when nothing can be confirmed", () => {
    const result = shrink(start, {
      maxRounds: 5,
      check: (candidates) => candidates.map(() => true),
      confirm: () => false,
    });
    expect(result.confirmed).toBe(false);
    expect(result.result).toBe(start);
  });

  it("offers the literal prefix of a wildcard as a reduction", () => {
    const resources = (s: Shrinkable) =>
      s.model.roles.flatMap((r) => r.statements.flatMap((st) => st.resources));
    const withWildcard = all.find((c) =>
      c.model.roles.some((r) =>
        r.statements.some((st) => st.resources.some((x) => x.includes("?"))),
      ),
    ) as Case;
    const original = resources(withWildcard);
    const wildcard = original.find((x) => x.includes("?")) as string;
    const prefix = wildcard.slice(0, wildcard.search(/[*?]/));
    const candidates = reductions({ model: withWildcard.model, config: withWildcard.config });
    expect(candidates.some((candidate) => resources(candidate).includes(prefix))).toBe(true);
  });
});

describe("report formatting", () => {
  const counterexample = judgeCase(firstOf("unsafe"), "unsafe", [], undefined).concat(
    judgeCase(firstOf("unsafe"), "unsafe", [], "safe"),
  )[0];

  it("includes the seed, case index, verdicts, and a replay command", () => {
    const text = formatCounterexample(
      "model",
      123,
      counterexample as NonNullable<typeof counterexample>,
    );
    expect(text).toContain("seed=123");
    expect(text).toContain(`case=${counterexample?.caseId}`);
    expect(text).toContain("soundness");
    expect(text).toContain("PROOFGATE_PBT_SEED=123");
    expect(text).toContain("PROOFGATE_PBT_ONLY=");
    expect(replayCommand("extractor", 5, 7)).toContain("extractor.test.ts");
  });

  it("shows the reduced Case as JSON and says whether it was confirmed", () => {
    const small: Shrinkable = {
      model: generateCase(seed, 0).model,
      config: generateCase(seed, 0).config,
    };
    const confirmed = formatCounterexample(
      "model",
      1,
      counterexample as NonNullable<typeof counterexample>,
      {
        result: small,
        rounds: 2,
        confirmed: true,
        sizeBefore: 20,
        sizeAfter: 5,
      },
    );
    expect(confirmed).toContain("reduced from size 20 to 5");
    expect(confirmed).toContain(JSON.stringify(small));
    const unconfirmed = formatCounterexample(
      "model",
      1,
      counterexample as NonNullable<typeof counterexample>,
      {
        result: small,
        rounds: 0,
        confirmed: false,
        sizeBefore: 20,
        sizeAfter: 20,
      },
    );
    expect(unconfirmed).toContain("could not be confirmed");
  });

  it("labels harness errors separately from product defects", () => {
    expect(formatHarnessError(9, 4, "O1 differs from O2")).toContain(
      "HARNESS ERROR (not a product defect)",
    );
  });
});
