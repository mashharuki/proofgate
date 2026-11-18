/**
 * ハーネス自身の自己検査です（design 11、Requirement 6.3）。
 *
 * 意図的に壊した部品（評価器、`generateLean`、オラクル）を、ハーネスが引数として受け取る
 * 関数に差し込み、ハーネスが欠陥を検出することを確かめます。検出できない（テストが通ってしまう）なら、
 * 本物の実装に対する「欠陥なし」という結果も信用できません。
 * 壊した部品はこのファイルの中だけにあり、パッケージには入りません。
 *
 * Lean起動回数（Requirement 4.2。生成比較の上限2回には数えません）:
 * - 評価器とオラクルの変異: 0回（`useLean: false`）
 * - `generateLean`の形式変更: 0回（ソースの組み立てで失敗し、起動前に止まります）
 * - Lean事実の反転、検出のみ（200 Case）: 1回
 * - Lean事実の反転、縮小あり（小さな入力）: 1回に加え、縮小ラウンドごとと最終確認で最大9回
 * - 対応付けられないエラー: 1回
 */
import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, StackModel, Violation } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { type AgreementDeps, runAgreement } from "./support/agreement.js";
import { DEFAULT_SEED } from "./support/config.js";
import {
  buildBatchSource,
  HarnessError,
  InfrastructureError,
  runBatchSource,
} from "./support/lean-batch.js";
import { generateCases } from "./support/model-gen.js";
import { oracleVerdict } from "./support/oracle.js";

const leanDirectory = join(process.cwd(), "packages/cdk-plugin/lean");
const LEAN_TIMEOUT = 180_000;
const real: AgreementDeps = { evaluate, generate: generateLean, leanDirectory };
const options = { seed: DEFAULT_SEED, leanCases: 0, maxReportsPerKind: 1, useLean: false };

/** 評価器だけを調べる、Leanなしの実行です。 */
const runPure = (deps: Partial<AgreementDeps>, count = 400) =>
  runAgreement(generateCases(DEFAULT_SEED, count), { ...real, ...deps }, options);

const kinds = (report: { countsByKind: Readonly<Record<string, number>> }) =>
  Object.keys(report.countsByKind).sort();

/** 報告の「reduced from size X to Y」から縮小前後の大きさを読み取ります。 */
const sizes = (reports: readonly string[]) =>
  reports.map((text) => {
    const match = /reduced from size (\d+) to (\d+)/.exec(text);
    return { before: Number(match?.[1]), after: Number(match?.[2]) };
  });

const reducedModel = (report: string) =>
  JSON.parse(report.trim().split("\n").at(-1) as string) as {
    model: StackModel;
    config: ProofGateConfig;
  };

describe("harness self-check: the real components pass", () => {
  it("finds nothing with the real evaluator and the real oracle (control)", () => {
    const report = runPure({});
    expect(report.counterexamples).toEqual([]);
    expect(report.vitalityMissing).toEqual([]);
  });
});

describe("harness self-check: broken evaluators are detected", () => {
  it("detects an evaluator that ignores PassRole by role-name wildcard, and shrinks it", () => {
    const stripWildcardPassRole = (model: StackModel): StackModel => ({
      ...model,
      roles: model.roles.map((role) => ({
        ...role,
        statements: role.statements.flatMap((statement) => {
          if (!statement.actions.some((action) => /pass/i.test(action))) return [statement];
          const resources = statement.resources.filter((r) => !/role\/[^/]*[*?]/.test(r));
          return resources.length > 0 ? [{ ...statement, resources }] : [];
        }),
      })),
    });
    const report = runPure({ evaluate: (m, c) => evaluate(stripWildcardPassRole(m), c) });
    expect(kinds(report)).toContain("soundness");
    expect(report.reports.length).toBeGreaterThan(0);
    for (const { before, after } of sizes(report.reports))
      expect(after).toBeLessThanOrEqual(before);
  });

  it("detects an evaluator that is safe with three or more roles, and shrinks to three roles", () => {
    const report = runPure({ evaluate: (m, c) => (m.roles.length >= 3 ? [] : evaluate(m, c)) });
    expect(kinds(report)).toContain("soundness");
    for (const { before, after } of sizes(report.reports))
      expect(after).toBeLessThanOrEqual(before);
    for (const text of report.reports) {
      // 3ロール未満では本物の評価器が危険と判定するため、これ以上は小さくなりません。
      expect(reducedModel(text).model.roles).toHaveLength(3);
    }
  });

  it("detects an evaluator that reports an unexplained extra path", () => {
    const fake: Violation = {
      ruleId: "PG-IAM-004",
      principalLogicalId: "Nobody",
      targetRoleLogicalId: "Nobody",
      protectedBucketArn: "arn:aws:s3:::b",
      sourcePaths: ["bogus"],
      explanation: "bogus",
    };
    const noisy = (m: StackModel, c: ProofGateConfig) => {
      const lambda = m.roles.some((r) => r.trustServices.includes("lambda.amazonaws.com"));
      return m.roles.length >= 2 && lambda ? [...evaluate(m, c), fake] : evaluate(m, c);
    };
    const report = runPure({ evaluate: noisy });
    // safe Caseでは誤検出、conservative Caseでは説明できない過剰検出として現れます。
    expect(kinds(report)).toEqual(expect.arrayContaining(["false-alarm", "unexplained-alarm"]));
  });

  it("detects, through tag vitality, an evaluator that never over-approximates a star trust", () => {
    const noStarTrust = (m: StackModel, c: ProofGateConfig) =>
      evaluate(
        {
          ...m,
          roles: m.roles.map((r) => ({
            ...r,
            trustServices: r.trustServices.filter((s) => s !== "*"),
          })),
        },
        c,
      );
    const report = runPure({ evaluate: noStarTrust });
    // 結果は「AWS上安全」と一致するため、個々のCaseの反例にはなりません。タグの有効性検査だけが検出します。
    expect(report.counterexamples).toEqual([]);
    expect(report.vitalityMissing).toEqual(["TRUST_STAR"]);
  });
});

describe("harness self-check: a broken oracle is a harness error", () => {
  it("fails with O1 differs from O2 when the oracle ignores Action letter case", () => {
    const caseSensitive = (m: StackModel, c: ProofGateConfig) =>
      oracleVerdict(
        {
          ...m,
          roles: m.roles.map((r) => ({
            ...r,
            statements: r.statements.map((s) => ({
              ...s,
              actions: s.actions.filter((a) => a === a.toLowerCase()),
            })),
          })),
        },
        c,
      );
    // 空のActionを持つStatementがモデルに残っても、オラクルの比較に影響しません。
    expect(() => runPure({ oracle: caseSensitive })).toThrow(HarnessError);
    expect(() => runPure({ oracle: caseSensitive })).toThrow("O1");
  });
});

describe("harness self-check: broken generateLean output", () => {
  const flip = (text: string) =>
    text.replace(
      /targetCanAccess := (true|false)/g,
      (_, value: string) => `targetCanAccess := ${value === "true" ? "false" : "true"}`,
    );
  /** すべてのモジュールで反転します（縮小の検査用。呼び出し順に依存しません）。 */
  const flipAccess = (model: StackModel, config: ProofGateConfig) =>
    flip(generateLean(model, config));
  /**
   * 4つに1つのモジュールだけ反転します。全件を反転すると不一致が約100件を超え、
   * 「エラー一覧が打ち切られたかもしれない」という基盤障害として扱われるためです（これも正しい挙動です）。
   */
  const flipEveryFourth = () => {
    let calls = 0;
    return (model: StackModel, config: ProofGateConfig) => {
      const text = generateLean(model, config);
      return calls++ % 4 === 0 ? flip(text) : text;
    };
  };

  it(
    "detects a flipped Lean fact in one launch for 200 Cases",
    () => {
      const report = runAgreement(
        generateCases(DEFAULT_SEED, 200),
        { ...real, generate: flipEveryFourth() },
        { seed: DEFAULT_SEED, leanCases: 200, maxReportsPerKind: 0 },
      );
      expect(kinds(report)).toContain("ts-lean");
      expect(report.launches).toBe(1);
      expect(report.leanChecked).toBe(200);
    },
    LEAN_TIMEOUT,
  );

  it(
    "treats a systematic flip across the whole batch as a possibly truncated error list",
    () => {
      expect(() =>
        runAgreement(
          generateCases(DEFAULT_SEED, 400),
          { ...real, generate: flipAccess },
          { seed: DEFAULT_SEED, leanCases: 400, maxReportsPerKind: 0 },
        ),
      ).toThrow(InfrastructureError);
    },
    LEAN_TIMEOUT,
  );

  it(
    "shrinks a TypeScript and Lean disagreement without making it larger",
    () => {
      const report = runAgreement(
        generateCases(DEFAULT_SEED, 40),
        { ...real, generate: flipAccess },
        { seed: DEFAULT_SEED, leanCases: 40, maxReportsPerKind: 1 },
      );
      expect(kinds(report)).toContain("ts-lean");
      expect(report.reports.length).toBeGreaterThan(0);
      for (const { before, after } of sizes(report.reports))
        expect(after).toBeLessThanOrEqual(before);
    },
    LEAN_TIMEOUT,
  );

  it("stops with a harness error naming the case when the output shape changes", () => {
    const changed = (model: StackModel, config: ProofGateConfig) =>
      `${generateLean(model, config)}-- extra line\n`;
    const run = () =>
      runAgreement(
        generateCases(DEFAULT_SEED, 5),
        { ...real, generate: changed },
        { seed: DEFAULT_SEED, leanCases: 5, maxReportsPerKind: 0 },
      );
    expect(run).toThrow(HarnessError);
    expect(run).toThrow("case 0");
  });

  it(
    "does not accept a run with every marker present but an error outside any case",
    () => {
      const cases = generateCases(DEFAULT_SEED, 3).map((c) => ({
        id: c.id,
        model: c.model,
        config: c.config,
        ts: evaluate(c.model, c.config).length > 0 ? ("unsafe" as const) : ("safe" as const),
      }));
      const built = buildBatchSource(cases, generateLean);
      const polluted = { ...built, source: `${built.source}#check noSuchIdentifier\n` };
      expect(() => runBatchSource(polluted, { leanDirectory })).toThrow(InfrastructureError);
    },
    LEAN_TIMEOUT,
  );
});
