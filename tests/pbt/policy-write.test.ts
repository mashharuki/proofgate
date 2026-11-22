import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, RoleModel, StackModel, StatementModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";

// spec proofgate-self-escalation, Step 2 (tasks 3.4 and 3.5): roles that change IAM themselves (PG-IAM-005). Every row is
// checked by the independent oracle, the evaluator, and Lean (one launch).
// ロール自身がIAMを書き換える経路（PG-IAM-005）です。独立オラクル、評価器、Leanの3者で確かめます。
const BUCKET = "arn:aws:s3:::protected-bucket";
const config: ProofGateConfig = { protectedBucketArns: [BUCKET] };
const ACCOUNT = "123456789012";
const arn = (name: string) => `arn:aws:iam::${ACCOUNT}:role/${name}`;
const statement = (
  actions: string[],
  resources: string[],
  id: string,
  i: number,
): StatementModel => ({
  effect: "Allow",
  actions,
  resources,
  sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[${i}]`,
});
const dev = (statements: [string[], string[]][], named = true): RoleModel => ({
  logicalId: "Dev",
  ...(named ? { roleName: "dev-role" } : {}),
  trustServices: ["ec2.amazonaws.com"],
  statements: statements.map(([actions, resources], i) => statement(actions, resources, "Dev", i)),
});
const data: RoleModel = {
  logicalId: "Data",
  roleName: "data-role",
  trustServices: ["lambda.amazonaws.com"],
  statements: [statement(["s3:GetObject"], [`${BUCKET}/*`], "Data", 0)],
};
const other: RoleModel = {
  logicalId: "Other",
  roleName: "other-role",
  trustServices: ["lambda.amazonaws.com"],
  statements: [statement(["logs:PutLogEvents"], ["*"], "Other", 0)],
};
const model = (...roles: RoleModel[]): StackModel => ({ version: "1", roles });
const WRITE = ["iam:PutRolePolicy"];
const ATTACH = ["iam:AttachRolePolicy"];
type Row = readonly [
  name: string,
  model: StackModel,
  config: ProofGateConfig,
  expected: "unsafe" | "safe",
];
const row = (
  name: string,
  m: StackModel,
  expected: "unsafe" | "safe",
  cfg: ProofGateConfig = config,
): Row => [name, m, cfg, expected];
const rows: Row[] = [
  // Self-grant.
  row("PutRolePolicy on the own ARN", model(dev([[WRITE, [arn("dev-role")]]])), "unsafe"),
  row("AttachRolePolicy on the own ARN", model(dev([[ATTACH, [arn("dev-role")]]])), "unsafe"),
  row("PutRolePolicy on *", model(dev([[WRITE, ["*"]]])), "unsafe"),
  row("PutRolePolicy on role/*", model(dev([[WRITE, ["arn:aws:iam::*:role/*"]]])), "unsafe"),
  row("PutRolePolicy on every IAM ARN", model(dev([[WRITE, ["arn:aws:iam::*:*"]]])), "unsafe"),
  row(
    "PutRolePolicy on a name prefix of the own name",
    model(dev([[WRITE, [arn("dev-*")]]])),
    "unsafe",
  ),
  row(
    "PutRolePolicy on a name with a question mark",
    model(dev([[WRITE, [arn("dev-rol?")]]])),
    "unsafe",
  ),
  row("iam:Put* (glob)", model(dev([[["iam:Put*"], [arn("dev-role")]]])), "unsafe"),
  row("iam:* (service star)", model(dev([[["iam:*"], [arn("dev-role")]]])), "unsafe"),
  row("* (every action) on *", model(dev([[["*"], ["*"]]])), "unsafe"),
  row(
    "mixed case IAM:putrolepolicy",
    model(dev([[["IAM:putrolepolicy"], [arn("dev-role")]]])),
    "unsafe",
  ),
  row(
    "one of two Resources denotes the role",
    model(dev([[WRITE, [arn("other-role"), arn("dev-role")]]])),
    "unsafe",
  ),
  row(
    "a self-grant with no access to the bucket (reported all the same)",
    model(dev([[WRITE, [arn("dev-role")]]]), data),
    "unsafe",
  ),
  row(
    "an unnamed role: its opaque name",
    model(dev([[WRITE, [arn("_generated_Dev")]]], false)),
    "unsafe",
  ),
  row(
    "an unnamed role: a wildcard in the name part may match",
    model(dev([[WRITE, [arn("dev-*")]]], false)),
    "unsafe",
  ),
  row(
    "an unnamed role: another literal name",
    model(dev([[WRITE, [arn("other-role")]]], false)),
    "safe",
  ),
  row("another role only", model(dev([[WRITE, [arn("other-role")]]]), other), "safe"),
  row("a name prefix of other roles", model(dev([[WRITE, [arn("ci-*")]]])), "safe"),
  row("an S3 ARN", model(dev([[WRITE, ["arn:aws:s3:::dev-role"]]])), "safe"),
  row("a bare role name (not an ARN, not counted)", model(dev([[WRITE, ["dev-role"]]])), "safe"),
  row("a bare logical ID (not counted)", model(dev([[WRITE, ["Dev"]]])), "safe"),
  row(
    "an action that only reads",
    model(dev([[["iam:GetRolePolicy", "iam:ListRolePolicies"], ["*"]]])),
    "safe",
  ),
  row(
    "an action that removes",
    model(dev([[["iam:DeleteRolePolicy", "iam:DetachRolePolicy"], ["*"]]])),
    "safe",
  ),
  row(
    "an action on users",
    model(dev([[["iam:PutUserPolicy", "iam:AttachUserPolicy"], ["*"]]])),
    "safe",
  ),
  row(
    "a permissions boundary action (not in the table)",
    model(dev([[["iam:PutRolePermissionsBoundary"], ["*"]]])),
    "safe",
  ),
  row("no IAM action", model(dev([[["s3:ListBucket"], ["*"]]])), "safe"),
  // Take-over.
  row(
    "UpdateAssumeRolePolicy on a role that reaches the bucket",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-role")]]]), data),
    "unsafe",
  ),
  row(
    "UpdateAssumeRolePolicy on * with a role that reaches the bucket",
    model(dev([[["iam:UpdateAssumeRolePolicy"], ["*"]]]), data),
    "unsafe",
  ),
  row(
    "UpdateAssumeRolePolicy on a name prefix of that role",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-*")]]]), data),
    "unsafe",
  ),
  row(
    "UpdateAssumeRolePolicy on a role that cannot reach the bucket",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("other-role")]]]), other),
    "safe",
  ),
  row(
    "UpdateAssumeRolePolicy on another role than the one that reaches the bucket",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("other-role")]]]), data, other),
    "safe",
  ),
  row(
    "UpdateAssumeRolePolicy on the own role (nothing new)",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("dev-role")]]])),
    "safe",
  ),
  row(
    "the role that reaches the bucket by a bucket-policy action",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-role")]]]), {
      ...data,
      statements: [statement(["s3:PutBucketPolicy"], [BUCKET], "Data", 0)],
    }),
    "unsafe",
  ),
  row(
    "the role that is taken over reaches another bucket only",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-role")]]]), {
      ...data,
      statements: [statement(["s3:GetObject"], ["arn:aws:s3:::other/*"], "Data", 0)],
    }),
    "safe",
  ),
  row(
    "UpdateAssumeRolePolicy on the own role that reaches the bucket (nothing new)",
    model({
      ...dev([[["iam:UpdateAssumeRolePolicy"], [arn("dev-role")]]]),
      statements: [
        statement(["iam:UpdateAssumeRolePolicy"], [arn("dev-role")], "Dev", 0),
        statement(["s3:GetObject"], [`${BUCKET}/*`], "Dev", 1),
      ],
    }),
    "safe",
  ),
  // Creation grant.
  row(
    "CreateRole and AttachRolePolicy on the same prefix",
    model(dev([[["iam:CreateRole", "iam:AttachRolePolicy"], [arn("ci-*")]]])),
    "unsafe",
  ),
  row(
    "CreateRole and PutRolePolicy in two statements",
    model(
      dev([
        [["iam:CreateRole"], [arn("ci-*")]],
        [WRITE, [arn("ci-*")]],
      ]),
    ),
    "unsafe",
  ),
  row(
    "CreateRole on * and a prefix for the policy",
    model(
      dev([
        [["iam:CreateRole"], ["*"]],
        [ATTACH, [arn("ci-*")]],
      ]),
    ),
    "unsafe",
  ),
  row(
    "CreateRole and AttachRolePolicy on disjoint prefixes",
    model(
      dev([
        [["iam:CreateRole"], [arn("ci-*")]],
        [ATTACH, [arn("data-*")]],
      ]),
    ),
    "safe",
  ),
  // RS-70: with `*` for the account the prefixes are not disjoint. CreateRole accepts a Path of the characters
  // \u0021 to \u007E, colon included (IAM API Reference, CreateRole, read 2026-11-23). The role created with
  // Path "/ci-a:role/data-/" has the ARN "arn:aws:iam::<account>:role/ci-a:role/data-/<name>", which matches both
  // patterns (the account `*` takes "<account>:role/ci-a"). A role of the template with a non-default Path is
  // already rejected by the extractor, so only the created role can have such an ARN.
  // アカウントが`*`だと、作成するロールのパスにコロンを入れて、両方のパターンに一致するARNを作れます。
  row(
    "CreateRole and AttachRolePolicy on prefixes, account * (a created path may hold a colon)",
    model(
      dev([
        [["iam:CreateRole"], ["arn:aws:iam::*:role/ci-*"]],
        [ATTACH, ["arn:aws:iam::*:role/data-*"]],
      ]),
    ),
    "unsafe",
  ),
  row(
    "CreateRole and AttachRolePolicy on the same prefix, account *",
    model(
      dev([
        [["iam:CreateRole"], ["arn:aws:iam::*:role/ci-*"]],
        [ATTACH, ["arn:aws:iam::*:role/ci-*"]],
      ]),
    ),
    "unsafe",
  ),
  row(
    "CreateRole on role/ci-* and AttachRolePolicy on role/*, account *",
    model(
      dev([
        [["iam:CreateRole"], ["arn:aws:iam::*:role/ci-*"]],
        [ATTACH, ["arn:aws:iam::*:role/*"]],
      ]),
    ),
    "unsafe",
  ),
  row("CreateRole alone", model(dev([[["iam:CreateRole"], ["*"]]])), "safe"),
  row(
    "AttachRolePolicy on a prefix without CreateRole",
    model(dev([[ATTACH, [arn("ci-*")]]])),
    "safe",
  ),
  row(
    "CreateRole and AttachRolePolicy on an S3 ARN (not a role)",
    model(dev([[["iam:CreateRole", "iam:AttachRolePolicy"], ["arn:aws:s3:::ci-x"]]])),
    "safe",
  ),
  // Exemptions.
  row(
    "self-grant, listed in allowedPolicyWriters",
    model(dev([[WRITE, [arn("dev-role")]]])),
    "safe",
    { ...config, allowedPolicyWriters: ["Dev"] },
  ),
  row(
    "take-over, the principal listed in allowedPolicyWriters",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-role")]]]), data),
    "safe",
    { ...config, allowedPolicyWriters: ["Dev"] },
  ),
  row(
    "creation grant, listed in allowedPolicyWriters",
    model(dev([[["iam:CreateRole", "iam:AttachRolePolicy"], [arn("ci-*")]]])),
    "safe",
    { ...config, allowedPolicyWriters: ["Dev"] },
  ),
  row(
    "another role listed in allowedPolicyWriters",
    model(dev([[WRITE, [arn("dev-role")]]]), other),
    "unsafe",
    { ...config, allowedPolicyWriters: ["Other"] },
  ),
  row("an ID that matches no role is ignored", model(dev([[WRITE, [arn("dev-role")]]])), "unsafe", {
    ...config,
    allowedPolicyWriters: ["Nobody"],
  }),
  row(
    "allowedPassRoleTargets does not exempt a self-grant",
    model(dev([[WRITE, [arn("dev-role")]]])),
    "unsafe",
    { ...config, allowedPassRoleTargets: ["Dev"] },
  ),
  row(
    "take-over, the target listed in allowedPassRoleTargets",
    model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-role")]]]), data),
    "safe",
    { ...config, allowedPassRoleTargets: ["Data"] },
  ),
];

describe("roles that change IAM themselves (PG-IAM-005)", () => {
  for (const [name, m, cfg, expected] of rows) {
    it(`${name}: ${expected}`, () => {
      expect(oracleVerdict(m, cfg), "oracle").toBe(expected);
      expect(tsVerdict(evaluate(m, cfg)), "evaluate").toBe(expected);
    });
  }
  it("reports a self-grant once per protected bucket, with the rule ID PG-IAM-005", () => {
    const two = { protectedBucketArns: [BUCKET, "arn:aws:s3:::second"] };
    const violations = evaluate(model(dev([[WRITE, [arn("dev-role")]]])), two);
    expect(
      violations.map((v) => [
        v.ruleId,
        v.principalLogicalId,
        v.targetRoleLogicalId,
        v.protectedBucketArn,
      ]),
    ).toEqual([
      ["PG-IAM-005", "Dev", "Dev", BUCKET],
      ["PG-IAM-005", "Dev", "Dev", "arn:aws:s3:::second"],
    ]);
    const [first] = violations;
    expect(first?.explanation).toContain("Dev can write a policy to its own role");
    expect(first?.explanation).toContain("iam:PutRolePolicy");
    expect(first?.explanation).toContain(BUCKET);
    expect(first?.sourcePaths).toEqual([
      "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[0]",
    ]);
    expect(first?.resourceLogicalId).toBeUndefined();
  });
  it("reports a take-over with the role that is taken over, and its statement that reaches the bucket", () => {
    const [v] = evaluate(
      model(dev([[["iam:UpdateAssumeRolePolicy"], [arn("data-role")]]]), data),
      config,
    );
    expect(v?.ruleId).toBe("PG-IAM-005");
    expect(v?.targetRoleLogicalId).toBe("Data");
    expect(v?.explanation).toContain("Dev can rewrite the trust policy of Data");
    expect(v?.sourcePaths).toEqual([
      "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[0]",
      "Resources.Data.Properties.Policies[0].PolicyDocument.Statement[0]",
    ]);
  });
  it("reports a creation grant once, and a self-grant covers it", () => {
    const [v] = evaluate(
      model(dev([[["iam:CreateRole", "iam:AttachRolePolicy"], [arn("ci-*")]]])),
      config,
    );
    expect(v?.explanation).toContain("Dev can create a role and attach a policy to it");
    const covered = evaluate(
      model(dev([[["iam:CreateRole", "iam:AttachRolePolicy"], ["*"]]])),
      config,
    );
    expect(covered).toHaveLength(1);
    expect(covered[0]?.explanation).toContain("Dev can write a policy to its own role");
  });
  it("leaves the PassRole violations as they were (PG-IAM-004)", () => {
    const passRole: StackModel = model(
      { ...data },
      dev([
        [["iam:PassRole"], [arn("data-role")]],
        [["lambda:CreateFunction"], ["*"]],
      ]),
    );
    expect(evaluate(passRole, config).map((v) => v.ruleId)).toEqual(["PG-IAM-004"]);
  });
  it("generates the third Lean list and the third theorem", () => {
    const lean = generateLean(model(dev([[WRITE, [arn("dev-role")]]])), config);
    expect(lean).toContain("def generatedPolicyWrite : List ProofGate.PolicyWritePath :=");
    expect(lean).toContain('shape := "self-grant"');
    expect(lean).toContain("canWrite := true");
    expect(lean).toContain("reachesAfterWrite := true");
    expect(lean).toContain("notExempt := true");
    expect(lean).toContain(
      "theorem generatedPolicyWriteIsSafe : ProofGate.safePolicyWrite generatedPolicyWrite = true",
    );
    expect(lean).toContain("theorem generatedStackIsSafe : ProofGate.safe generatedPaths = true");
  });
  it("emits an exempt row with notExempt := false", () => {
    const lean = generateLean(model(dev([[WRITE, [arn("dev-role")]]])), {
      ...config,
      allowedPolicyWriters: ["Dev"],
    });
    expect(lean).toContain("notExempt := false");
    expect(lean).not.toContain("notExempt := true");
  });
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = rows.map(([, m, cfg], id) => ({
      id,
      model: m,
      config: cfg,
      ts: tsVerdict(evaluate(m, cfg)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
    for (const [index, [name, , , expected]] of rows.entries()) {
      expect(result.verdicts.get(index), name).toBe(expected);
    }
  }, 120_000);
});
