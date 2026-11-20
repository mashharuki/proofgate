import { evaluate } from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// spec proofgate-cdk-construct-support, rule R1: the value resolver (design 4.1) and opaque names (design 5).
// 値リゾルバ（Fn::Join、疑似パラメータ、同一テンプレート内のRef・GetAtt）と不透明な名前を確認します。
type Json = Record<string, unknown>;
const GENERIC = "Action and Resource must be literal strings or arrays of strings";
const lambdaTrust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const ec2Trust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const join = (...parts: unknown[]) => ({ "Fn::Join": ["", parts] });
const ref = (Ref: string) => ({ Ref });
const getAtt = (id: string, attribute: unknown) => ({ "Fn::GetAtt": [id, attribute] });

/** 1つのロールの1つのStatementに、指定したResourceを置いたテンプレートです。 */
function template(resource: unknown, extra: Record<string, Json> = {}, action = "s3:GetObject") {
  return {
    Resources: {
      Reader: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: lambdaTrust,
          Policies: [
            {
              PolicyName: "p",
              PolicyDocument: {
                Statement: [{ Effect: "Allow", Action: action, Resource: resource }],
              },
            },
          ],
        },
      },
      ...extra,
    },
  };
}
const bucketNamed = { Type: "AWS::S3::Bucket", Properties: { BucketName: "my-data" } };
const bucketUnnamed = { Type: "AWS::S3::Bucket", Properties: {} };
const roleNamed = {
  Type: "AWS::IAM::Role",
  Properties: { RoleName: "data-role", AssumeRolePolicyDocument: lambdaTrust },
};
const roleUnnamed = {
  Type: "AWS::IAM::Role",
  Properties: { AssumeRolePolicyDocument: lambdaTrust },
};
const queue = { Type: "AWS::SQS::Queue", Properties: {} };

const resolved = (resource: unknown, extra: Record<string, Json> = {}) => {
  const result = extractStack(template(resource, extra));
  return result.model?.roles.find((r) => r.logicalId === "Reader")?.statements[0]?.resources;
};

describe("R1: resolved values", () => {
  const cases: [string, unknown, Record<string, Json>, string[]][] = [
    ["a Fn::Join of literals", join("arn:aws:s3:::b/", "*"), {}, ["arn:aws:s3:::b/*"]],
    [
      "a Join with a separator",
      { "Fn::Join": ["/", ["arn:aws:s3:::b", "key"]] },
      {},
      ["arn:aws:s3:::b/key"],
    ],
    ["a nested Join", join("arn:aws:s3:::", join("b", "/*")), {}, ["arn:aws:s3:::b/*"]],
    [
      "the partition, region, account id, and URL suffix",
      join(
        "arn:",
        ref("AWS::Partition"),
        ":x:",
        ref("AWS::Region"),
        ":",
        ref("AWS::AccountId"),
        ":",
        ref("AWS::URLSuffix"),
      ),
      {},
      ["arn:aws:x:*:*:*", "arn:aws-cn:x:*:*:*", "arn:aws-us-gov:x:*:*:*"],
    ],
    ["Ref to a bucket with a name", ref("Data"), { Data: bucketNamed }, ["my-data"]],
    [
      "Ref to a bucket without a name (opaque)",
      ref("Data"),
      { Data: bucketUnnamed },
      ["_generated_Data"],
    ],
    [
      "GetAtt Arn of a bucket with a name",
      getAtt("Data", "Arn"),
      { Data: bucketNamed },
      ["arn:aws:s3:::my-data", "arn:aws-cn:s3:::my-data", "arn:aws-us-gov:s3:::my-data"],
    ],
    [
      "GetAtt Arn of a bucket without a name (opaque)",
      join(getAtt("Data", "Arn"), "/*"),
      { Data: bucketUnnamed },
      [
        "arn:aws:s3:::_generated_Data/*",
        "arn:aws-cn:s3:::_generated_Data/*",
        "arn:aws-us-gov:s3:::_generated_Data/*",
      ],
    ],
    [
      "GetAtt Arn of a role with a name",
      getAtt("Target", "Arn"),
      { Target: roleNamed },
      [
        "arn:aws:iam::*:role/data-role",
        "arn:aws-cn:iam::*:role/data-role",
        "arn:aws-us-gov:iam::*:role/data-role",
      ],
    ],
    [
      "GetAtt Arn of a role without a name (opaque)",
      getAtt("Target", "Arn"),
      { Target: roleUnnamed },
      [
        "arn:aws:iam::*:role/_generated_Target",
        "arn:aws-cn:iam::*:role/_generated_Target",
        "arn:aws-us-gov:iam::*:role/_generated_Target",
      ],
    ],
    [
      "Ref to a role",
      join("arn:aws:iam::*:role/", ref("Target")),
      { Target: roleNamed },
      ["arn:aws:iam::*:role/data-role"],
    ],
    ["Ref to another resource", ref("Jobs"), { Jobs: queue }, ["*"]],
    ["GetAtt of another resource", getAtt("Jobs", "Arn"), { Jobs: queue }, ["*"]],
    [
      "an array with literals and values",
      ["arn:aws:s3:::b", getAtt("Jobs", "Arn")],
      { Jobs: queue },
      ["arn:aws:s3:::b", "*"],
    ],
  ];
  for (const [name, resource, extra, expected] of cases) {
    it(`reads ${name}`, () => {
      const result = extractStack(template(resource, extra));
      expect(result.unsupported).toEqual([]);
      expect(resolved(resource, extra)).toEqual(expected);
    });
  }
});

describe("R1: values that stay unsupported", () => {
  const cases: [string, unknown, Record<string, Json>][] = [
    ["a parameter", ref("BucketParameter"), {}],
    ["a Ref to a name that is not in the template", ref("Nothing"), {}],
    ["the stack name", join("arn:aws:s3:::", ref("AWS::StackName")), {}],
    ["AWS::NoValue", join("arn:aws:s3:::b", ref("AWS::NoValue")), {}],
    ["Fn::ImportValue", { "Fn::ImportValue": "x" }, {}],
    // biome-ignore lint/suspicious/noTemplateCurlyInString: CloudFormation Fn::Sub text
    ["Fn::Sub", { "Fn::Sub": "arn:aws:s3:::${Bucket}/*" }, {}],
    ["Fn::If", { "Fn::If": ["C", "a", "b"] }, {}],
    ["Fn::Select", { "Fn::Select": [0, ["a"]] }, {}],
    ["GetAtt to a name that is not in the template", getAtt("Nothing", "Arn"), {}],
    ["another attribute of a bucket", getAtt("Data", "DomainName"), { Data: bucketNamed }],
    ["another attribute of a role", getAtt("Target", "RoleId"), { Target: roleNamed }],
    ["GetAtt in the string form", { "Fn::GetAtt": "Data.Arn" }, { Data: bucketNamed }],
    [
      "GetAtt with an attribute that is not a string",
      getAtt("Jobs", { Ref: "X" }),
      { Jobs: queue },
    ],
    ["a Join whose parts are not an array", { "Fn::Join": ["", "x"] }, {}],
    ["a Join whose separator is not a string", { "Fn::Join": [1, ["a"]] }, {}],
    ["one unsupported part in a Join", join("arn:aws:s3:::b/", ref("BucketParameter")), {}],
    ["an object with two keys", { Ref: "Jobs", "Fn::GetAtt": ["Jobs", "Arn"] }, { Jobs: queue }],
    [
      "a bucket whose name is an intrinsic",
      getAtt("Data", "Arn"),
      { Data: { Type: "AWS::S3::Bucket", Properties: { BucketName: ref("NameParameter") } } },
    ],
    ["a number", 1, {}],
  ];
  for (const [name, resource, extra] of cases) {
    it(`rejects ${name} with the unchanged reason, and returns no model`, () => {
      const result = extractStack(template(resource, extra));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual({
        sourcePath: "Resources.Reader.Properties.Policies[0].PolicyDocument.Statement[0]",
        reason: GENERIC,
      });
    });
  }
  it("keeps the Action literal-only", () => {
    const result = extractStack(template("*", {}, undefined));
    expect(result.model).toBeDefined();
    const bad = template("*");
    (
      (bad.Resources.Reader.Properties.Policies[0] as Json).PolicyDocument as { Statement: Json[] }
    ).Statement[0] = {
      Effect: "Allow",
      Action: join("s3:", "GetObject"),
      Resource: "*",
    };
    expect(extractStack(bad).model).toBeUndefined();
  });
  it("still rejects a policy variable that is inside a Join", () => {
    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM policy variable text
    const result = extractStack(template(join("arn:aws:s3:::b/", "${aws:username}", "/*")));
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ reason: "IAM policy variables in Resource are not supported" }),
    );
  });
});

describe("R1: end to end with the evaluator", () => {
  const dev = (resource: unknown): Json => ({
    Type: "AWS::IAM::Role",
    Properties: {
      AssumeRolePolicyDocument: ec2Trust,
      Policies: [
        {
          PolicyName: "p",
          PolicyDocument: {
            Statement: [
              { Effect: "Allow", Action: "iam:PassRole", Resource: resource },
              { Effect: "Allow", Action: "lambda:CreateFunction", Resource: "*" },
            ],
          },
        },
      ],
    },
  });
  const execution = (bucket: string): Json => ({
    Type: "AWS::IAM::Role",
    Properties: {
      AssumeRolePolicyDocument: lambdaTrust,
      Policies: [
        {
          PolicyName: "s3",
          PolicyDocument: {
            Statement: [
              {
                Effect: "Allow",
                Action: ["s3:GetObject*", "s3:List*"],
                Resource: [getAtt(bucket, "Arn"), join(getAtt(bucket, "Arn"), "/*")],
              },
            ],
          },
        },
      ],
    },
  });
  const verdict = (resources: Record<string, Json>, protectedArn: string) => {
    const result = extractStack({ Resources: resources });
    expect(result.unsupported).toEqual([]);
    return result.model === undefined
      ? "none"
      : evaluate(result.model, { protectedBucketArns: [protectedArn] }).length > 0
        ? "unsafe"
        : "safe";
  };
  const protectedArn = "arn:aws:s3:::proofgate-protected-data";
  it("RS-20 shape: an unnamed execution role passed by its ARN reads the bucket with the protected name", () => {
    expect(
      verdict(
        {
          Protected: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "proofgate-protected-data" },
          },
          Execution: execution("Protected"),
          Dev: dev(getAtt("Execution", "Arn")),
        },
        protectedArn,
      ),
    ).toBe("unsafe");
  });
  it("RS-21 shape: the same layout with a bucket without a name is safe", () => {
    expect(
      verdict(
        { Data: bucketUnnamed, Execution: execution("Data"), Dev: dev(getAtt("Execution", "Arn")) },
        protectedArn,
      ),
    ).toBe("safe");
  });
  it("a bucket without a name may match a protected name that has a wildcard (conservative)", () => {
    expect(
      verdict(
        { Data: bucketUnnamed, Execution: execution("Data"), Dev: dev(getAtt("Execution", "Arn")) },
        "arn:aws:s3:::proofgate-*",
      ),
    ).toBe("unsafe");
  });
  it("a bucket with another fixed name does not match a protected name that has a wildcard of another prefix", () => {
    expect(
      verdict(
        { Data: bucketNamed, Execution: execution("Data"), Dev: dev(getAtt("Execution", "Arn")) },
        "arn:aws:s3:::other-*",
      ),
    ).toBe("safe");
  });
  it("PassRole to another role by its ARN does not reach the execution role", () => {
    expect(
      verdict(
        {
          Protected: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "proofgate-protected-data" },
          },
          Execution: execution("Protected"),
          Other: roleUnnamed,
          Dev: dev(getAtt("Other", "Arn")),
        },
        protectedArn,
      ),
    ).toBe("safe");
  });
  it("a PassRole Resource of role/* reaches the unnamed execution role", () => {
    expect(
      verdict(
        {
          Protected: {
            Type: "AWS::S3::Bucket",
            Properties: { BucketName: "proofgate-protected-data" },
          },
          Execution: execution("Protected"),
          Dev: dev(join("arn:", ref("AWS::Partition"), ":iam::", ref("AWS::AccountId"), ":role/*")),
        },
        protectedArn,
      ),
    ).toBe("unsafe");
  });
});
