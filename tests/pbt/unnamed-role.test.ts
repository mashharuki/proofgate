import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, RoleModel, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";

// spec proofgate-cdk-construct-support, rule R0 (Property P6). A role without RoleName is a PassRole
// target for a wildcard pattern and for its opaque name, and not for a literal name of another role.
// RoleNameのないロールは、ワイルドカードのPatternと不透明な名前では対象になり、他のロールのリテラルでは対象になりません。
// 独立オラクル、TypeScript、Leanの3者が、名前なし・名前ありの両方で一致することを確認します。
const config: ProofGateConfig = { protectedBucketArns: ["arn:aws:s3:::protected-bucket"] };
const ACCOUNT = "123456789012";
const role = (name: "named" | "unnamed"): RoleModel => ({
  logicalId: "Data",
  ...(name === "named" ? { roleName: "data-role" } : {}),
  trustServices: ["lambda.amazonaws.com"],
  statements: [
    {
      effect: "Allow",
      actions: ["s3:GetObject"],
      resources: ["arn:aws:s3:::protected-bucket/*"],
      sourcePath: "Resources.Data.Properties.Policies[0].PolicyDocument.Statement[0]",
    },
  ],
});
const model = (resource: string, name: "named" | "unnamed"): StackModel => ({
  version: "1",
  roles: [
    role(name),
    {
      logicalId: "Dev",
      trustServices: ["ec2.amazonaws.com"],
      statements: [
        {
          effect: "Allow",
          actions: ["iam:PassRole"],
          resources: [resource],
          sourcePath: "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[0]",
        },
        {
          effect: "Allow",
          actions: ["lambda:CreateFunction"],
          resources: ["*"],
          sourcePath: "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[1]",
        },
      ],
    },
  ],
});
const role_ = (name: string) => `arn:aws:iam::${ACCOUNT}:role/${name}`;
/** [Resource, 名前なしの期待, 名前ありの期待] */
const table: readonly [string, "unsafe" | "safe", "unsafe" | "safe"][] = [
  ["*", "unsafe", "unsafe"],
  [role_("*"), "unsafe", "unsafe"],
  ["arn:aws:iam::*:role/MyStack-*", "unsafe", "safe"],
  ["arn:*:iam::*:role/Xat?-*", "unsafe", "safe"],
  ["arn:*:iam::*:role/data-rol?", "unsafe", "unsafe"],
  [role_("data-role"), "safe", "unsafe"],
  [role_("other-role"), "safe", "safe"],
  [role_("_generated_Data"), "unsafe", "safe"],
  [role_("_generated_Other"), "safe", "safe"],
  ["arn:aws:s3:::*", "safe", "safe"],
];
const cases = table.flatMap(([resource, unnamed, named], index) => [
  { id: index * 2, resource, name: "unnamed" as const, expected: unnamed },
  { id: index * 2 + 1, resource, name: "named" as const, expected: named },
]);
describe("an unnamed role as a PassRole target (R0)", () => {
  for (const c of cases) {
    it(`${c.name} role, Resource ${c.resource}: ${c.expected}`, () => {
      const m = model(c.resource, c.name);
      expect(oracleVerdict(m, config), "oracle").toBe(c.expected);
      expect(tsVerdict(evaluate(m, config)), "evaluate").toBe(c.expected);
    });
  }
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = cases.map((c) => {
      const m = model(c.resource, c.name);
      return { id: c.id, model: m, config, ts: tsVerdict(evaluate(m, config)) };
    });
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 120_000);
});
