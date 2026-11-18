import { extractStack } from "@proofgate/extractor";
import { beforeAll, describe, expect, it } from "vitest";
import { readConfig } from "./support/config.js";
import { assertCoverage } from "./support/coverage.js";
import { type ExtractorReport, runExtractorCases } from "./support/extractor-run.js";
import { generateTemplateSpec, requiredTemplateShapes } from "./support/template-gen.js";

const config = readConfig();
const isDefaultRun = config.only === undefined && config.extractorCases >= 1000;

// Extractor-levelの生成テスト。CloudFormation断片を生成し、`extractStack`の結果を、
// 生成レシピから独立に計算した期待（期待モデル、または未対応のsourcePath）と照合します。
// このファイルは本番のcore・cdk-plugin・Leanを使いません（architecture.test.tsが検査します）。
describe("Extractor-level generated fragments", () => {
  let report: ExtractorReport;

  beforeAll(() => {
    const specs =
      config.only === undefined
        ? Array.from({ length: config.extractorCases }, (_, i) =>
            generateTemplateSpec(config.seed, i),
          )
        : [generateTemplateSpec(config.seed, config.only)];
    report = runExtractorCases(specs, extractStack, { seed: config.seed, maxReportsPerKind: 3 });
  }, 120_000);

  it("reaches every fragment kind, shape, poison, and empty case", () => {
    if (!isDefaultRun) return;
    const required = [
      ...requiredTemplateShapes().map((shape) => `shape:${shape}`),
      "kind:supported",
      "kind:poisoned",
      "kind:empty",
    ];
    assertCoverage(report.coverage, required);
  });

  it("reads every supported fragment back as exactly the expected model", () => {
    expect(report.countsByKind["model-mismatch"] ?? 0, report.reports.join("\n\n")).toBe(0);
    expect(report.countsByKind["unexpected-unsupported"] ?? 0, report.reports.join("\n\n")).toBe(0);
  });

  it("rejects every poisoned or empty fragment without returning a model", () => {
    expect(report.countsByKind["model-returned"] ?? 0, report.reports.join("\n\n")).toBe(0);
  });

  it("points each unsupported finding at the poisoned location", () => {
    expect(report.countsByKind["missing-finding"] ?? 0, report.reports.join("\n\n")).toBe(0);
  });

  it("reports a policy variable exactly once, and never for an intrinsic Resource", () => {
    expect(report.countsByKind["variable-finding"] ?? 0, report.reports.join("\n\n")).toBe(0);
  });

  it("has no failure of any kind", () => {
    expect(report.failures, report.reports.join("\n\n")).toBe(0);
  });
});
