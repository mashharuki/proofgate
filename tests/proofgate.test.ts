import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import type { StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";

const protectedBucketArn = "arn:aws:s3:::proofgate-protected-data";
// CloudFormationを経由しないUnit Testで共有する、最小の危険モデルです。
const vulnerableModel: StackModel = {
  version: "1",
  roles: [
    {
      logicalId: "DeveloperRole",
      roleName: "developer",
      trustServices: ["ec2.amazonaws.com"],
      statements: [
        {
          effect: "Allow",
          actions: ["iam:PassRole"],
          resources: ["arn:aws:iam::*:role/data-role"],
          sourcePath: "pass",
        },
        {
          effect: "Allow",
          actions: ["lambda:CreateFunction"],
          resources: ["*"],
          sourcePath: "lambda",
        },
      ],
    },
    {
      logicalId: "DataRole",
      roleName: "data-role",
      trustServices: ["lambda.amazonaws.com"],
      statements: [
        {
          effect: "Allow",
          actions: ["s3:GetObject"],
          resources: [`${protectedBucketArn}/*`],
          sourcePath: "s3",
        },
      ],
    },
  ],
};

// 有限モデル上の経路検出と、Lean生成結果の意味を固定します。
describe("ProofGate finite model", () => {
  it("finds the PassRole + Lambda + protected S3 path", () => {
    expect(evaluate(vulnerableModel, { protectedBucketArns: [protectedBucketArn] })).toMatchObject([
      {
        ruleId: "PG-IAM-004",
        principalLogicalId: "DeveloperRole",
        targetRoleLogicalId: "DataRole",
      },
    ]);
  });

  it("matches a literal account-specific PassRole ARN", () => {
    const accountSpecific: StackModel = {
      ...vulnerableModel,
      roles: [
        {
          ...vulnerableModel.roles[0],
          statements: [
            {
              effect: "Allow",
              actions: ["iam:PassRole"],
              resources: ["arn:aws:iam::123456789012:role/data-role"],
              sourcePath: "pass",
            },
            vulnerableModel.roles[0].statements[1],
          ],
        },
        vulnerableModel.roles[1],
      ],
    };
    expect(evaluate(accountSpecific, { protectedBucketArns: [protectedBucketArn] })).toHaveLength(
      1,
    );
  });

  it("does not report a path when PassRole is absent", () => {
    const safe: StackModel = {
      ...vulnerableModel,
      roles: [
        { ...vulnerableModel.roles[0], statements: vulnerableModel.roles[0].statements.slice(1) },
        vulnerableModel.roles[1],
      ],
    };
    expect(evaluate(safe, { protectedBucketArns: [protectedBucketArn] })).toEqual([]);
  });

  it("does not report a path when the target role does not trust Lambda", () => {
    const nonLambdaTarget: StackModel = {
      ...vulnerableModel,
      roles: [
        vulnerableModel.roles[0],
        { ...vulnerableModel.roles[1], trustServices: ["ec2.amazonaws.com"] },
      ],
    };
    expect(evaluate(nonLambdaTarget, { protectedBucketArns: [protectedBucketArn] })).toEqual([]);
  });

  it("generates a Lean theorem that rejects the vulnerable model", () => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-test-"));
    const file = join(directory, "Generated.lean");
    writeFileSync(
      file,
      generateLean(vulnerableModel, { protectedBucketArns: [protectedBucketArn] }),
    );
    const result = spawnSync("lake", ["env", "lean", file], {
      cwd: resolve("packages/cdk-plugin/lean"),
      encoding: "utf8",
    });
    rmSync(directory, { recursive: true, force: true });
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}\n${result.stderr}`).toContain("ProofGate.safe generatedPaths = true");
  });

  it("emits an explicit Lean decision marker", () => {
    expect(generateLean(vulnerableModel, { protectedBucketArns: [protectedBucketArn] })).toContain(
      "PROOFGATE_UNSAFE",
    );
  });
});

// 未対応IAM構文を見逃さず、出典付きでFail Closedにする境界を検査します。
describe("CloudFormation extractor", () => {
  it("fails closed on unsupported Condition", () => {
    const result = extractStack({
      Resources: {
        Role: {
          Type: "AWS::IAM::Role",
          Properties: {
            Policies: [
              {
                PolicyDocument: {
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "s3:GetObject",
                      Resource: "*",
                      Condition: { StringEquals: {} },
                    },
                  ],
                },
              },
            ],
          },
        },
      },
    });
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ reason: "Condition is not supported" }),
    );
  });

  it("extracts Lambda service trust", () => {
    const result = extractStack(singleRoleTemplate());
    expect(result.unsupported).toEqual([]);
    expect(result.model?.roles[0].trustServices).toEqual(["lambda.amazonaws.com"]);
  });

  it("fails closed on a Condition in the role trust policy", () => {
    const template = singleRoleTemplate() as {
      Resources: {
        DataRole: {
          Properties: { AssumeRolePolicyDocument: { Statement: Array<Record<string, unknown>> } };
        };
      };
    };
    template.Resources.DataRole.Properties.AssumeRolePolicyDocument.Statement[0].Condition = {
      StringEquals: { "aws:SourceAccount": "123456789012" },
    };
    const result = extractStack(template);
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ reason: "Condition is not supported in trust policies" }),
    );
  });

  it("fails closed on unsupported IAM resource types", () => {
    const result = extractStack({
      Resources: { User: { Type: "AWS::IAM::User", Properties: {} } },
    });
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({
        reason: "AWS::IAM::User is not supported in the first vertical slice",
      }),
    );
  });
});

// 設定・テンプレート・Lean実行環境の障害が、必ずPG-IAM-003になることを検査します。
describe("CDK plugin fail-closed behavior", () => {
  it("rejects an empty protected bucket configuration", () => {
    const validator = new ProofGateValidator({ protectedBucketArns: [] });
    const report = validator.validate({ templatePaths: ["unused.json"] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);
    expect(report.success).toBe(false);
    expect(report.violations[0]).toMatchObject({
      ruleName: "PG-IAM-003",
      description: expect.stringContaining("vacuous proof"),
    });
  });

  it("reports a Lean toolchain error instead of treating it as an unsafe theorem", () => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-plugin-test-"));
    const templatePath = join(directory, "template.json");
    writeFileSync(templatePath, JSON.stringify(singleRoleTemplate()));
    const validator = new ProofGateValidator({
      protectedBucketArns: [protectedBucketArn],
      leanDirectory: join(directory, "missing-lean"),
    });
    const report = validator.validate({ templatePaths: [templatePath] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);
    rmSync(directory, { recursive: true, force: true });
    expect(report.success).toBe(false);
    expect(report.violations).toHaveLength(1);
    expect(report.violations[0]).toMatchObject({
      ruleName: "PG-IAM-003",
      description: expect.stringContaining("Lean verification failed to execute"),
    });
  });

  it("builds packaged Lean sources automatically before verification", () => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-lean-build-test-"));
    const leanDirectory = join(directory, "lean");
    const templatePath = join(directory, "template.json");
    // `.lake`を含めずにコピーし、インストール直後と同じ未ビルド状態を再現します。
    cpSync(resolve("packages/cdk-plugin/lean"), leanDirectory, {
      recursive: true,
      filter: (source) => basename(source) !== ".lake",
    });
    writeFileSync(templatePath, JSON.stringify(singleRoleTemplate()));

    const validator = new ProofGateValidator({
      protectedBucketArns: [protectedBucketArn],
      leanDirectory,
    });
    const report = validator.validate({ templatePaths: [templatePath] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);

    rmSync(directory, { recursive: true, force: true });
    expect(report).toEqual({ success: true, violations: [] });
  });

  it("reports malformed synthesized templates as PG-IAM-003", () => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-template-test-"));
    const templatePath = join(directory, "template.json");
    writeFileSync(templatePath, "{not-json");
    const validator = new ProofGateValidator({ protectedBucketArns: [protectedBucketArn] });
    const report = validator.validate({ templatePaths: [templatePath] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);
    rmSync(directory, { recursive: true, force: true });
    expect(report.success).toBe(false);
    expect(report.violations[0]).toMatchObject({
      ruleName: "PG-IAM-003",
      description: expect.stringContaining("could not be read or parsed"),
    });
  });
});

// 実際のcdk synthを使い、プラグイン有効時だけ危険なアプリが拒否されることを確認します。
describe("CDK integration", () => {
  it("allows both apps without ProofGate and only the safe app with ProofGate", () => {
    const run = (app: "safe-app" | "vulnerable-app", script: "synth" | "synth:proofgate") =>
      spawnSync("pnpm", ["--filter", `@proofgate-cdk/${app}`, script], {
        cwd: resolve("."),
        encoding: "utf8",
      });

    expect(run("safe-app", "synth").status).toBe(0);
    expect(run("vulnerable-app", "synth").status).toBe(0);
    expect(run("safe-app", "synth:proofgate").status).toBe(0);
    const rejected = run("vulnerable-app", "synth:proofgate");
    expect(rejected.status).not.toBe(0);
    expect(`${rejected.stdout}\n${rejected.stderr}`).toContain("PG-IAM-004");
  }, 30_000);
});

/** Extractorテストで共有する、Lambdaから引き受け可能な単一ロールのCloudFormationです。 */
function singleRoleTemplate(): unknown {
  return {
    Resources: {
      DataRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "data-role",
          AssumeRolePolicyDocument: {
            Statement: [
              {
                Effect: "Allow",
                Action: "sts:AssumeRole",
                Principal: { Service: "lambda.amazonaws.com" },
              },
            ],
          },
          Policies: [
            {
              PolicyDocument: {
                Statement: [
                  { Effect: "Allow", Action: "s3:GetObject", Resource: `${protectedBucketArn}/*` },
                ],
              },
            },
          ],
        },
      },
    },
  };
}
