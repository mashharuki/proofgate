import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate/core";
import { beforeAll, describe, expect, it } from "vitest";
import { type AgreementReport, runAgreement } from "./support/agreement.js";
import { readConfig } from "./support/config.js";
import { assertCoverage } from "./support/coverage.js";
import { HarnessError } from "./support/lean-batch.js";
import {
  CATEGORIES,
  generateCase,
  generateCases,
  requiredCoverageKeys,
  TAGS,
} from "./support/model-gen.js";
import { formatHarnessError } from "./support/report.js";

const config = readConfig();
const leanDirectory = join(process.cwd(), "packages/cdk-plugin/lean");
const isDefaultRun = config.only === undefined && config.cases >= 2000;

// Model-levelの3者比較（O2、TypeScript、Lean）。Lean判定は、TypeScriptが計算した
// 4つの事実とLeanの論理の一致を検査するもので、IAMステートメントの独立した検証ではありません。
describe("Model-level agreement (oracle, TypeScript, Lean)", () => {
  let report: AgreementReport;
  let harnessError: string | undefined;

  beforeAll(() => {
    const cases =
      config.only === undefined
        ? generateCases(config.seed, config.cases)
        : [generateCase(config.seed, config.only)];
    try {
      report = runAgreement(
        cases,
        { evaluate, generate: generateLean, leanDirectory },
        { seed: config.seed, leanCases: config.leanCases, maxReportsPerKind: 3 },
      );
      const summary = Object.entries(report.countsByKind)
        .map(([kind, n]) => `${kind}=${n}`)
        .join(" ");
      console.log(
        `PBT model-level: seed=${config.seed} cases=${cases.length} leanChecked=${report.leanChecked} leanLaunches=${report.launches} counterexamples=[${summary}]`,
      );
      console.log(`PBT coverage:\n${report.coverage.summary()}`);
    } catch (error) {
      if (!(error instanceof HarnessError)) throw error;
      harnessError = formatHarnessError(config.seed, undefined, error.message);
    }
  }, 180_000);

  it("has no harness error (O1 equals O2, generateLean shape is as expected)", () => {
    expect(harnessError).toBeUndefined();
  });

  it("reaches every required category, tag, form, and Lean-checked category", () => {
    if (!isDefaultRun) return;
    const required = [
      ...requiredCoverageKeys(),
      ...TAGS.map((tag) => `tag-explained:${tag}`),
      ...CATEGORIES.map((category) => `lean:category:${category}`),
    ];
    assertCoverage(report.coverage, required);
  });

  it("observes an explained TS-unsafe Case for every over-approximation tag", () => {
    if (!isDefaultRun) return;
    expect(report.vitalityMissing).toEqual([]);
  });

  it("uses at most 2 Lean launches for the whole case set, whatever the case count", () => {
    expect(report.launches).toBeLessThanOrEqual(2);
  });

  it("finds no counterexample: oracle, TypeScript, and Lean agree on every Case", () => {
    const counts = JSON.stringify(report.countsByKind);
    expect(report.counterexamples.length, `${counts}\n\n${report.reports.join("\n\n")}`).toBe(0);
  });
});
