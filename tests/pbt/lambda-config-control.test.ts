import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";

// Lambda control by configuration update alone (fix found in the trial of 1.1.1).
// lambda:UpdateFunctionConfiguration can change Role and Layers (AWS Lambda API reference,
// UpdateFunctionConfiguration, read 2026-11-20). With iam:PassRole for the target role, a new
// layer can run arbitrary code as that role without lambda:UpdateFunctionCode.
// 設定の更新だけでも、実行ロールとレイヤーを変えられるため、Lambdaを制御できるとみなします。
const config: ProofGateConfig = { protectedBucketArns: ["arn:aws:s3:::protected-bucket"] };
const model = (lambdaActions: readonly string[][]): StackModel => ({
  version: "1",
  roles: [
    {
      logicalId: "Data",
      roleName: "data-role",
      trustServices: ["lambda.amazonaws.com"],
      statements: [
        {
          effect: "Allow",
          actions: ["s3:GetObject"],
          resources: ["arn:aws:s3:::protected-bucket/*"],
          sourcePath: "Resources.Data.Properties.Policies[0].PolicyDocument.Statement[0]",
        },
      ],
    },
    {
      logicalId: "Dev",
      roleName: "dev-role",
      trustServices: ["ec2.amazonaws.com"],
      statements: [
        {
          effect: "Allow",
          actions: ["iam:PassRole"],
          resources: ["arn:aws:iam::123456789012:role/data-role"],
          sourcePath: "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[0]",
        },
        ...lambdaActions.map((actions, i) => ({
          effect: "Allow" as const,
          actions,
          resources: ["arn:aws:lambda:*:*:function:*"],
          sourcePath: `Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[${i + 1}]`,
        })),
      ],
    },
  ],
});
const rows: [string, string[][], "unsafe" | "safe"][] = [
  ["configuration update only", [["lambda:UpdateFunctionConfiguration"]], "unsafe"],
  ["configuration update by a glob", [["lambda:UpdateFunctionConfig*"]], "unsafe"],
  [
    "configuration and code update",
    [["lambda:UpdateFunctionConfiguration"], ["lambda:UpdateFunctionCode"]],
    "unsafe",
  ],
  ["creation", [["lambda:CreateFunction"]], "unsafe"],
  ["code update only (cannot change the role)", [["lambda:UpdateFunctionCode"]], "safe"],
  ["invoke only", [["lambda:InvokeFunction"]], "safe"],
  ["no Lambda action", [], "safe"],
];
describe("Lambda control by configuration update alone", () => {
  for (const [name, actions, expected] of rows) {
    it(`${name}: ${expected}`, () => {
      const m = model(actions);
      expect(oracleVerdict(m, config), "oracle").toBe(expected);
      expect(tsVerdict(evaluate(m, config)), "evaluate").toBe(expected);
    });
  }
  it("cites only the configuration statement as Lambda control when there is no creation", () => {
    const [violation] = evaluate(
      model([["lambda:UpdateFunctionConfiguration"], ["lambda:UpdateFunctionCode"]]),
      config,
    );
    expect(violation?.sourcePaths).toContain(
      "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[1]",
    );
  });
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = rows.map(([, actions], id) => ({
      id,
      model: model(actions),
      config,
      ts: tsVerdict(evaluate(model(actions), config)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 120_000);
});
