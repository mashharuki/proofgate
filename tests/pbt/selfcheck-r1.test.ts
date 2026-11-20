import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import type { ExtractionResult, ProofGateConfig, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { runExtractorCases } from "./support/extractor-run.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { generateTemplateSpec } from "./support/template-gen.js";

// spec proofgate-cdk-construct-support, Property P12 (design 8.4): deliberately broken versions of R1
// must be detected by the generated tests. Also Property P7 for opaque bucket names, with Lean.
// R1を意図的に壊した実装（ミュータント）が、生成テストで検出されることを確かめます。
const SEED = 1347571526;
const specs = Array.from({ length: 400 }, (_, i) => generateTemplateSpec(SEED, i));

/** テンプレートを書き換えてから抽出する、壊れた抽出器を作ります。 */
const rewriting =
  (rewrite: (value: unknown) => unknown) =>
  (template: unknown): ExtractionResult =>
    extractStack(rewrite(structuredClone(template)));
/** JSONの中の値を、条件に合うものだけ置き換えます。 */
function replaceDeep(value: unknown, pick: (v: Record<string, unknown>) => unknown): unknown {
  if (Array.isArray(value)) return value.map((v) => replaceDeep(v, pick));
  if (value === null || typeof value !== "object") return value;
  const replaced = pick(value as Record<string, unknown>);
  if (replaced !== undefined) return replaced;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, replaceDeep(v, pick)]),
  );
}
const mutants: [string, (template: unknown) => ExtractionResult][] = [
  [
    "resolves a GetAtt to the empty string",
    rewriting((t) => replaceDeep(t, (v) => ("Fn::GetAtt" in v ? "" : undefined))),
  ],
  [
    "reads an unknown part (a pseudo-parameter) as nothing",
    rewriting((t) =>
      replaceDeep(t, (v) =>
        typeof v.Ref === "string" && v.Ref.startsWith("AWS::") ? "" : undefined,
      ),
    ),
  ],
  [
    "drops a resolved alternative (keeps one partition only)",
    (template) => {
      const result = extractStack(template);
      if (result.model === undefined) return result;
      const model: StackModel = {
        ...result.model,
        roles: result.model.roles.map((role) => ({
          ...role,
          statements: role.statements.map((s) => ({
            ...s,
            resources: s.resources.filter((r) => !/^arn:aws-(cn|us-gov):/.test(r)),
          })),
        })),
      };
      return { ...result, model };
    },
  ],
  [
    "drops a statement whose Resource was resolved",
    rewriting((t) =>
      replaceDeep(t, (v) =>
        v.PolicyName === "resolvable"
          ? { PolicyName: "resolvable", PolicyDocument: { Statement: [] } }
          : undefined,
      ),
    ),
  ],
];

describe("self-check of R1: broken extractors are detected", () => {
  it("finds nothing with the real extractor (control)", () => {
    const report = runExtractorCases(specs, extractStack, { seed: SEED, maxReportsPerKind: 0 });
    expect(report.failures).toBe(0);
  });
  for (const [name, mutant] of mutants) {
    it(`detects an extractor that ${name}`, () => {
      const report = runExtractorCases(specs, mutant, { seed: SEED, maxReportsPerKind: 0 });
      expect(report.failures).toBeGreaterThan(0);
    });
  }
});

describe("opaque bucket names (P7), with TypeScript and Lean", () => {
  const model = (resource: string): StackModel => ({
    version: "1",
    roles: [
      {
        logicalId: "Exec",
        trustServices: ["lambda.amazonaws.com"],
        statements: [
          { effect: "Allow", actions: ["s3:GetObject"], resources: [resource], sourcePath: "s3" },
        ],
      },
      {
        logicalId: "Dev",
        trustServices: ["ec2.amazonaws.com"],
        statements: [
          { effect: "Allow", actions: ["iam:PassRole"], resources: ["*"], sourcePath: "pass" },
          {
            effect: "Allow",
            actions: ["lambda:CreateFunction"],
            resources: ["*"],
            sourcePath: "lambda",
          },
        ],
      },
    ],
  });
  const rows: [string, string, "unsafe" | "safe"][] = [
    ["arn:aws:s3:::_generated_Data/*", "arn:aws:s3:::protected", "safe"],
    ["arn:aws-cn:s3:::_generated_Data/*", "arn:aws:s3:::protected", "safe"],
    ["arn:aws:s3:::_generated_Data/*", "arn:aws:s3:::protected-*", "unsafe"],
    ["arn:aws:s3:::_generated_Data/*", "arn:aws:s3:::protecte?", "unsafe"],
    // 生成名を`*`と読むため、バケットレベルのARNも`arn:aws:s3:::*`となり、決定済みの規則で届くとみなします（過剰検出）。
    // The opaque name is read as `*`, so this bucket-level ARN becomes `arn:aws:s3:::*`, which counts (over-approximation).
    ["arn:aws:s3:::_generated_Data", "arn:aws:s3:::protected-*", "unsafe"],
    ["arn:aws:s3:::protected/*", "arn:aws:s3:::protected", "unsafe"],
  ];
  const ignoresOpaqueRule = (m: StackModel, c: ProofGateConfig) =>
    evaluate(
      m,
      // ミュータント: 保護バケットのワイルドカードを消して、不透明な名前の規則を効かなくします。
      { ...c, protectedBucketArns: c.protectedBucketArns.map((a) => a.replace(/[*?]/g, "x")) },
    );
  for (const [resource, protectedArn, expected] of rows) {
    it(`${resource} against ${protectedArn}: ${expected}`, () => {
      expect(tsVerdict(evaluate(model(resource), { protectedBucketArns: [protectedArn] }))).toBe(
        expected,
      );
    });
  }
  it("detects an evaluator that ignores the opaque rule", () => {
    const differs = rows.some(
      ([r, p, expected]) =>
        tsVerdict(ignoresOpaqueRule(model(r), { protectedBucketArns: [p] })) !== expected,
    );
    expect(differs).toBe(true);
  });
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = rows.map(([r, p], id) => {
      const config = { protectedBucketArns: [p] };
      return { id, model: model(r), config, ts: tsVerdict(evaluate(model(r), config)) };
    });
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 120_000);
});
