import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// spec proofgate-brushup, Step 3 (Requirement 3): a template without IAM resources is accepted.
// "Accepted" means "no IAM principal in this template", not "proved safe": Lean is not run and nothing is reported.
// The cases that must stay rejected (nested stacks, transforms, malformed entries, roles without statements) are
// fail-closed hardening found while implementing; the design only said "no AWS::IAM:: resource".
// IAMリソースのないテンプレートは、検査するプリンシパルがないため、受理します（証明済みという意味ではありません）。
type Json = Record<string, unknown>;
const bucket = { Type: "AWS::S3::Bucket", Properties: { BucketName: "b" } };
const lambdaTrust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const roleWithStatement = {
  Type: "AWS::IAM::Role",
  Properties: {
    AssumeRolePolicyDocument: lambdaTrust,
    Policies: [
      {
        PolicyName: "p",
        PolicyDocument: {
          Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::x/*" }],
        },
      },
    ],
  },
};

describe("extractor: a template without IAM resources", () => {
  const accepted: [string, Json][] = [
    [
      "a bucket and a function",
      { Resources: { B: bucket, F: { Type: "AWS::Lambda::Function", Properties: {} } } },
    ],
    [
      "a Cognito user pool",
      { Resources: { Pool: { Type: "AWS::Cognito::UserPool", Properties: {} } } },
    ],
    [
      "a CloudFront distribution",
      { Resources: { Cdn: { Type: "AWS::CloudFront::Distribution", Properties: {} } } },
    ],
    ["an empty Resources object", { Resources: {} }],
    [
      "parameters and outputs next to resources",
      {
        Parameters: { P: { Type: "String" } },
        Outputs: { O: { Value: "x" } },
        Resources: { B: bucket },
      },
    ],
    [
      "a type that only looks like IAM",
      { Resources: { X: { Type: "AWS::IAMish::Thing", Properties: {} } } },
    ],
  ];
  for (const [name, template] of accepted) {
    it(`accepts ${name} with an empty model and no finding`, () => {
      const result = extractStack(template);
      expect(result.unsupported).toEqual([]);
      expect(result.model).toEqual({ version: "1", roles: [] });
    });
  }
  const rejected: [string, unknown, string][] = [
    [
      "a template without Resources",
      { Outputs: {} },
      "CloudFormation Resources object is required",
    ],
    [
      "a nested stack (its roles are in another template)",
      {
        Resources: {
          Child: {
            Type: "AWS::CloudFormation::Stack",
            Properties: { TemplateURL: "https://x/y.json" },
          },
        },
      },
      "No IAM roles were found; refusing a vacuous proof",
    ],
    [
      "a top-level Transform (it can create roles at deploy time)",
      { Transform: "AWS::Serverless-2016-10-31", Resources: { B: bucket } },
      "No IAM roles were found; refusing a vacuous proof",
    ],
    [
      "a SAM function",
      { Resources: { F: { Type: "AWS::Serverless::Function", Properties: {} } } },
      "No IAM roles were found; refusing a vacuous proof",
    ],
    [
      "an Fn::Transform macro",
      {
        Resources: {
          B: { Type: "AWS::S3::Bucket", Properties: { "Fn::Transform": { Name: "AWS::Include" } } },
        },
      },
      "No IAM roles were found; refusing a vacuous proof",
    ],
    [
      "a resource entry that is not an object",
      { Resources: { Odd: "x" } },
      "No IAM roles were found; refusing a vacuous proof",
    ],
    [
      "a resource without a readable Type",
      { Resources: { Odd: { Type: { Ref: "T" } } } },
      "No IAM roles were found; refusing a vacuous proof",
    ],
    [
      "an IAM policy without a role",
      {
        Resources: {
          P: {
            Type: "AWS::IAM::Policy",
            Properties: { PolicyDocument: { Statement: [] }, Roles: [{ Ref: "Missing" }] },
          },
        },
      },
      "Only local role Ref targets are supported",
    ],
    [
      "an IAM user",
      { Resources: { U: { Type: "AWS::IAM::User", Properties: {} } } },
      "AWS::IAM::User is not supported in the first vertical slice",
    ],
    [
      // Step 5 reads instance profiles (design 5.3); a profile with no readable role is still rejected.
      // The expected reason changed with Step 5 (listed for the user's approval).
      "an instance profile without a readable role",
      { Resources: { P: { Type: "AWS::IAM::InstanceProfile", Properties: { Roles: [] } } } },
      "Instance profile Roles must be local role Refs or literal role names",
    ],
    [
      "a role with no readable statement (answer 1 of the requirements)",
      {
        Resources: {
          R: { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: lambdaTrust } },
        },
      },
      "No supported IAM policy statements were found; refusing a vacuous proof",
    ],
  ];
  for (const [name, template, reason] of rejected) {
    it(`still rejects ${name}`, () => {
      const result = extractStack(template);
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual(expect.objectContaining({ reason }));
    });
  }
  it("does not change a template that has a role with a statement", () => {
    const result = extractStack({ Resources: { R: roleWithStatement, B: bucket } });
    expect(result.unsupported).toEqual([]);
    expect(result.model?.roles).toHaveLength(1);
  });
});

describe("validator: a template without IAM resources", () => {
  const write = (directory: string, name: string, template: unknown) => {
    const path = join(directory, name);
    writeFileSync(path, JSON.stringify(template));
    return path;
  };
  /** A Lean directory that is not built: if Lean were started, the report would hold a PG-IAM-003 finding. */
  const withDirectory = <T>(run: (directory: string, leanDirectory: string) => T): T => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-roleless-"));
    const leanDirectory = mkdtempSync(join(tmpdir(), "proofgate-nolean-"));
    try {
      return run(directory, leanDirectory);
    } finally {
      rmSync(directory, { recursive: true, force: true });
      rmSync(leanDirectory, { recursive: true, force: true });
    }
  };
  const validate = (
    leanDirectory: string,
    templatePaths: string[],
    protectedBucketArns = ["arn:aws:s3:::protected"],
  ) =>
    new ProofGateValidator({ protectedBucketArns, leanDirectory }).validate({
      templatePaths,
    } as Parameters<ProofGateValidator["validate"]>[0]);

  it("reports nothing and does not start Lean", () => {
    withDirectory((directory, leanDirectory) => {
      const path = write(directory, "a.template.json", { Resources: { B: bucket } });
      expect(validate(leanDirectory, [path])).toEqual({ success: true, violations: [] });
    });
  });
  it("still checks the other templates of the same assembly", () => {
    withDirectory((directory, leanDirectory) => {
      const roleless = write(directory, "a.template.json", { Resources: { B: bucket } });
      const unsupported = write(directory, "b.template.json", {
        Resources: { U: { Type: "AWS::IAM::User", Properties: {} } },
      });
      const report = validate(leanDirectory, [roleless, unsupported]);
      expect(report.success).toBe(false);
      // The IAM user template gives three findings (unsupported resource, no role, no statement), all of its own.
      expect(report.violations.length).toBeGreaterThan(0);
      for (const violation of report.violations) {
        expect(violation.ruleName).toBe("PG-IAM-003");
        expect(violation.violatingResources[0]?.templatePath).toBe(unsupported);
      }
    });
  });
  it("still rejects an empty protected bucket configuration", () => {
    withDirectory((directory, leanDirectory) => {
      const path = write(directory, "a.template.json", { Resources: { B: bucket } });
      const report = validate(leanDirectory, [path], []);
      expect(report.success).toBe(false);
      expect(report.violations[0]).toMatchObject({ ruleName: "PG-IAM-003" });
    });
  });
  it("still rejects an unreadable template and a nested stack", () => {
    withDirectory((directory, leanDirectory) => {
      const broken = join(directory, "broken.template.json");
      writeFileSync(broken, "{not-json");
      const nested = write(directory, "n.template.json", {
        Resources: {
          Child: {
            Type: "AWS::CloudFormation::Stack",
            Properties: { TemplateURL: "https://x/y.json" },
          },
        },
      });
      for (const path of [broken, nested]) {
        const report = validate(leanDirectory, [path]);
        expect(report.success, path).toBe(false);
        expect(report.violations[0]).toMatchObject({ ruleName: "PG-IAM-003" });
      }
    });
  });
});
