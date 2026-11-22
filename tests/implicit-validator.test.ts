import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { describe, expect, it } from "vitest";

// spec proofgate-implicit-role-paths, Step 3 (task 5.5): the validator reports the path without iam:PassRole as PG-IAM-004
// with its own text, a resource with an unknown role as PG-IAM-003, and honors allowedPassRoleTargets.
// バリデータが、PassRoleの要らない経路を専用の文面でPG-IAM-004、ロール不明のリソースをPG-IAM-003として報告します。
type Json = Record<string, unknown>;
const trust = (service: string) => ({
  Statement: [{ Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }],
});
const policy = (action: string, resource: unknown) => [
  {
    PolicyName: "p",
    PolicyDocument: { Statement: [{ Effect: "Allow", Action: action, Resource: resource }] },
  },
];
function template(functionRole: unknown, devActions: string, devResource: unknown = "*"): Json {
  return {
    Resources: {
      DataRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          RoleName: "data-role",
          AssumeRolePolicyDocument: trust("lambda.amazonaws.com"),
          Policies: policy("s3:GetObject", "arn:aws:s3:::protected/*"),
        },
      },
      DevRole: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: trust("ec2.amazonaws.com"),
          Policies: policy(devActions, devResource),
        },
      },
      Fn: {
        Type: "AWS::Lambda::Function",
        Properties: { FunctionName: "fn-a", Role: functionRole },
      },
    },
  };
}
function run(t: Json, allowed?: string[]) {
  const directory = mkdtempSync(join(tmpdir(), "proofgate-implicit-"));
  try {
    const path = join(directory, "template.json");
    writeFileSync(path, JSON.stringify(t));
    const validator = new ProofGateValidator({
      protectedBucketArns: ["arn:aws:s3:::protected"],
      ...(allowed === undefined ? {} : { allowedPassRoleTargets: allowed }),
    });
    return validator.validate({ templatePaths: [path] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const GETATT = { "Fn::GetAtt": ["DataRole", "Arn"] };

describe("the validator and paths without iam:PassRole", () => {
  it("rejects a principal that can change a function whose role reaches the bucket", () => {
    const report = run(template(GETATT, "lambda:UpdateFunctionCode"));
    expect(report.success).toBe(false);
    const v = report.violations.filter((x) => x.ruleName === "PG-IAM-004");
    expect(v).toHaveLength(1);
    expect(v[0]?.description).toContain("DevRole can change Fn (lambda:UpdateFunctionCode)");
    expect(v[0]?.description).toContain("which runs as DataRole");
    expect(v[0]?.fix).toContain("Remove the permission to change Fn from DevRole");
    expect(v[0]?.fix).toContain("allowedPassRoleTargets");
    expect(v[0]?.violatingResources[0]?.resourceLogicalId).toBe("DevRole");
    expect(v[0]?.violatingResources[0]?.locations).toContain("Resources.Fn.Properties.Role");
  });
  it("accepts the same template when the action does not change the function", () => {
    expect(run(template(GETATT, "lambda:InvokeFunction")).success).toBe(true);
  });
  it("accepts it when the function Resource is another function", () => {
    const other = "arn:aws:lambda:us-east-1:123456789012:function:fn-b";
    expect(run(template(GETATT, "lambda:UpdateFunctionCode", other)).success).toBe(true);
  });
  it("accepts it when the role is listed in allowedPassRoleTargets (decision 1)", () => {
    expect(run(template(GETATT, "lambda:UpdateFunctionCode"), ["DataRole"]).success).toBe(true);
  });
  it("rejects with PG-IAM-003 when the role cannot be identified and a principal can change the function", () => {
    const report = run(template({ Ref: "RoleParameter" }, "lambda:UpdateFunctionCode"));
    expect(report.success).toBe(false);
    const v = report.violations.filter((x) => x.ruleName === "PG-IAM-003");
    expect(v).toHaveLength(1);
    expect(v[0]?.description).toBe(
      "Unsupported IAM syntax: Fn runs as a role that ProofGate cannot identify, and a principal can change it",
    );
    expect(v[0]?.violatingResources[0]?.resourceLogicalId).toBe("Fn");
    expect(report.violations.some((x) => x.ruleName === "PG-IAM-004")).toBe(false);
  });
  it("accepts a function with an unknown role when nobody can change it", () => {
    expect(run(template({ Ref: "RoleParameter" }, "lambda:InvokeFunction")).success).toBe(true);
  });
});
