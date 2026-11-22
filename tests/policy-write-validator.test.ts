import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { describe, expect, it } from "vitest";

// spec proofgate-self-escalation, Step 2 (task 3.4): the validator reports PG-IAM-005 with its own text and fix, honors
// allowedPolicyWriters, and a Condition on the statement is still rejected (the CI pattern with a permissions boundary).
// バリデータが、PG-IAM-005を専用の文面で報告し、allowedPolicyWritersを守ります。Conditionつきは、今までどおり拒否します。
type Json = Record<string, unknown>;
const trust = (service: string) => ({
  Statement: [{ Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }],
});
const template = (statement: Json): Json => ({
  Resources: {
    Pipeline: {
      Type: "AWS::IAM::Role",
      Properties: {
        RoleName: "pipeline-role",
        AssumeRolePolicyDocument: trust("ec2.amazonaws.com"),
        Policies: [{ PolicyName: "p", PolicyDocument: { Statement: [statement] } }],
      },
    },
  },
});
function run(t: Json, allowed?: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "proofgate-selfesc-"));
  try {
    const path = join(directory, "template.json");
    writeFileSync(path, JSON.stringify(t));
    const validator = new ProofGateValidator({
      protectedBucketArns: ["arn:aws:s3:::protected"],
      ...(allowed === undefined ? {} : { allowedPolicyWriters: allowed }),
    });
    return validator.validate({ templatePaths: [path] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const SELF = { "Fn::GetAtt": ["Pipeline", "Arn"] };
describe("the validator and PG-IAM-005", () => {
  it("rejects a role that may write a policy to its own role", () => {
    const report = run(template({ Effect: "Allow", Action: "iam:PutRolePolicy", Resource: SELF }));
    expect(report.success).toBe(false);
    const v = report.violations.filter((x) => x.ruleName === "PG-IAM-005");
    expect(v).toHaveLength(1);
    expect(v[0]?.description).toContain(
      "Pipeline can write a policy to its own role (iam:PutRolePolicy)",
    );
    expect(v[0]?.fix).toContain("allowedPolicyWriters");
    expect(v[0]?.violatingResources[0]?.resourceLogicalId).toBe("Pipeline");
    expect(report.violations.some((x) => x.ruleName === "PG-IAM-004")).toBe(false);
  });
  it("accepts the same template when the role is listed in allowedPolicyWriters", () => {
    expect(
      run(template({ Effect: "Allow", Action: "iam:PutRolePolicy", Resource: SELF }), ["Pipeline"])
        .success,
    ).toBe(true);
  });
  it("accepts a role that may write only to another role that nobody can use", () => {
    const t = template({
      Effect: "Allow",
      Action: "iam:PutRolePolicy",
      Resource: "arn:aws:iam::123456789012:role/other",
    });
    expect(run(t).success).toBe(true);
  });
  it("reports an administrator role (Action * on Resource *)", () => {
    const report = run(template({ Effect: "Allow", Action: "*", Resource: "*" }));
    expect(report.violations.map((x) => x.ruleName)).toContain("PG-IAM-005");
  });
  it("reports the creation grant with its own text", () => {
    const report = run(
      template({
        Effect: "Allow",
        Action: ["iam:CreateRole", "iam:AttachRolePolicy"],
        Resource: "arn:aws:iam::*:role/ci-*",
      }),
    );
    const v = report.violations.filter((x) => x.ruleName === "PG-IAM-005");
    expect(v).toHaveLength(1);
    expect(v[0]?.description).toContain("can create a role and attach a policy to it");
  });
  it("still rejects a statement with a Condition (a permissions boundary condition): PG-IAM-003", () => {
    const report = run(
      template({
        Effect: "Allow",
        Action: "iam:AttachRolePolicy",
        Resource: SELF,
        Condition: {
          StringEquals: { "iam:PermissionsBoundary": "arn:aws:iam::123456789012:policy/boundary" },
        },
      }),
    );
    expect(report.success).toBe(false);
    expect(report.violations.map((x) => x.ruleName)).toEqual(["PG-IAM-003"]);
  });
});
