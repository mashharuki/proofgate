import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";

// spec proofgate-brushup, Step 2 (Requirement 1): complete S3 access.
// A role that can pass to Lambda and reaches the protected bucket counts as having access when it holds
// an action that takes the S3 `object` resource (on the object set) or a bucket action that can give
// others access, copy, or expire every object (on the bucket ARN itself). 1.1.2 counted only
// GetObject, PutObject, DeleteObject. The expected values below come from the AWS Service
// Authorization Reference for Amazon S3 (read 2026-11-21), not from the evaluator.
// S3アクセスの完全な判定です。期待値はAWSのドキュメントから書いています。
const PB = "arn:aws:s3:::protected-bucket";
const config: ProofGateConfig = { protectedBucketArns: [PB] };
const model = (actions: string[], resources: string[]): StackModel => ({
  version: "1",
  roles: [
    {
      logicalId: "Data",
      roleName: "data-role",
      trustServices: ["lambda.amazonaws.com"],
      statements: [{ effect: "Allow", actions, resources, sourcePath: "Resources.Data.s3" }],
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
          sourcePath: "Resources.Dev.pass",
        },
        {
          effect: "Allow",
          actions: ["lambda:CreateFunction"],
          resources: ["*"],
          sourcePath: "Resources.Dev.lambda",
        },
      ],
    },
  ],
});
const OBJECTS = [`${PB}/*`];
const rows: [string, string[], string[], "unsafe" | "safe"][] = [
  // Actions that take the object resource, on the object set.
  ["GetObject (unchanged)", ["s3:GetObject"], OBJECTS, "unsafe"],
  ["GetObjectVersion", ["s3:GetObjectVersion"], OBJECTS, "unsafe"],
  ["GetObjectAcl", ["s3:GetObjectAcl"], OBJECTS, "unsafe"],
  ["DeleteObjectVersion", ["s3:DeleteObjectVersion"], OBJECTS, "unsafe"],
  ["PutObjectAcl", ["s3:PutObjectAcl"], OBJECTS, "unsafe"],
  ["PutObjectVersionAcl", ["s3:PutObjectVersionAcl"], OBJECTS, "unsafe"],
  ["ReplicateObject", ["s3:ReplicateObject"], OBJECTS, "unsafe"],
  ["RestoreObject", ["s3:RestoreObject"], OBJECTS, "unsafe"],
  ["AbortMultipartUpload", ["s3:AbortMultipartUpload"], OBJECTS, "unsafe"],
  ["a glob over versions", ["s3:*ObjectVersion"], OBJECTS, "unsafe"],
  ["mixed case", ["S3:getobjectversion"], OBJECTS, "unsafe"],
  // Bucket actions that can give others access, copy, or expire every object, on the bucket ARN.
  ["PutBucketPolicy on the bucket", ["s3:PutBucketPolicy"], [PB], "unsafe"],
  ["DeleteBucketPolicy on the bucket", ["s3:DeleteBucketPolicy"], [PB], "unsafe"],
  ["PutBucketAcl on the bucket", ["s3:PutBucketAcl"], [PB], "unsafe"],
  ["PutBucketOwnershipControls on the bucket", ["s3:PutBucketOwnershipControls"], [PB], "unsafe"],
  ["PutBucketPublicAccessBlock on the bucket", ["s3:PutBucketPublicAccessBlock"], [PB], "unsafe"],
  ["PutReplicationConfiguration on the bucket", ["s3:PutReplicationConfiguration"], [PB], "unsafe"],
  ["PutLifecycleConfiguration on the bucket", ["s3:PutLifecycleConfiguration"], [PB], "unsafe"],
  [
    "PutBucketPolicy through a wildcard Resource",
    ["s3:PutBucketPolicy"],
    ["arn:aws:s3:::*"],
    "unsafe",
  ],
  [
    "PutBucketPolicy through a bucket wildcard",
    ["s3:PutBucketPolicy"],
    ["arn:aws:s3:::protected-*"],
    "unsafe",
  ],
  ["s3:Put* covers PutBucketPolicy", ["s3:Put*"], [PB], "unsafe"],
  // Not access.
  ["an object action on the bucket ARN alone", ["s3:GetObjectVersion"], [PB], "safe"],
  [
    "a bucket action on the object set (wrong resource type)",
    ["s3:PutBucketPolicy"],
    OBJECTS,
    "safe",
  ],
  [
    "PutBucketPolicy on another bucket",
    ["s3:PutBucketPolicy"],
    ["arn:aws:s3:::other-bucket"],
    "safe",
  ],
  [
    "GetObjectVersion on another bucket",
    ["s3:GetObjectVersion"],
    ["arn:aws:s3:::other-bucket/*"],
    "safe",
  ],
  ["ListBucket (not data access)", ["s3:ListBucket"], [PB], "safe"],
  ["GetBucketPolicy (reads the policy only)", ["s3:GetBucketPolicy"], [PB], "safe"],
  ["PutBucketTagging", ["s3:PutBucketTagging"], [PB], "safe"],
  ["PutBucketVersioning", ["s3:PutBucketVersioning"], [PB], "safe"],
  ["a made-up action", ["s3:FrobnicateObject"], OBJECTS, "safe"],
  ["another service", ["dynamodb:GetItem"], OBJECTS, "safe"],
];
describe("S3 access: object actions and bucket grant actions", () => {
  for (const [name, actions, resources, expected] of rows) {
    it(`${name}: ${expected}`, () => {
      const m = model(actions, resources);
      expect(oracleVerdict(m, config), "oracle").toBe(expected);
      expect(tsVerdict(evaluate(m, config)), "evaluate").toBe(expected);
    });
  }
  it("treats a protected ARN with a trailing slash as the bucket", () => {
    const withSlash: ProofGateConfig = { protectedBucketArns: [`${PB}/`] };
    const m = model(["s3:PutBucketPolicy"], [PB]);
    expect(oracleVerdict(m, withSlash), "oracle").toBe("unsafe");
    expect(tsVerdict(evaluate(m, withSlash)), "evaluate").toBe("unsafe");
  });
  it("cites the S3 statement of the target role in the violation", () => {
    const [violation] = evaluate(model(["s3:PutBucketPolicy"], [PB]), config);
    expect(violation?.sourcePaths).toContain("Resources.Data.s3");
  });
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = rows.map(([, actions, resources], id) => ({
      id,
      model: model(actions, resources),
      config,
      ts: tsVerdict(evaluate(model(actions, resources), config)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 120_000);
});
