// biome-ignore-all lint/suspicious/noTemplateCurlyInString: CloudFormation Fn::Sub and IAM policy variable text
import { evaluate } from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// spec proofgate-brushup, Step 4: B4 Fn::Sub (string form) and B5 two more managed policies.
// Fn::Subの文字列形式（B4）と、管理ポリシー2件（B5）を確認します。
type Json = Record<string, unknown>;
const GENERIC = "Action and Resource must be literal strings or arrays of strings";
const POLICY_VARIABLE = "IAM policy variables in Resource are not supported";
const MANAGED_REASON = "Managed policies are not supported in the first vertical slice";
const lambdaTrust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const sub = (text: unknown, map?: unknown) => ({
  "Fn::Sub": map === undefined ? text : [text, map],
});
function template(resource: unknown, extra: Record<string, Json> = {}) {
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
                Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: resource }],
              },
            },
          ],
        },
      },
      ...extra,
    },
  };
}
const resolved = (resource: unknown, extra: Record<string, Json> = {}) =>
  extractStack(template(resource, extra)).model?.roles.find((r) => r.logicalId === "Reader")
    ?.statements[0]?.resources;
const bucketNamed = { Type: "AWS::S3::Bucket", Properties: { BucketName: "my-data" } };
const bucketUnnamed = { Type: "AWS::S3::Bucket", Properties: {} };
const queue = { Type: "AWS::SQS::Queue", Properties: {} };

describe("B4: Fn::Sub in Resource", () => {
  const cases: [string, unknown, Record<string, Json>, string[]][] = [
    ["a text without variables", sub("arn:aws:s3:::b/*"), {}, ["arn:aws:s3:::b/*"]],
    [
      "the partition and pseudo-parameters",
      sub("arn:${AWS::Partition}:s3:${AWS::Region}:${AWS::AccountId}:x"),
      {},
      ["arn:aws:s3:*:*:x", "arn:aws-cn:s3:*:*:x", "arn:aws-us-gov:s3:*:*:x"],
    ],
    [
      "a bucket with a name",
      sub("arn:aws:s3:::${Data}/*"),
      { Data: bucketNamed },
      ["arn:aws:s3:::my-data/*"],
    ],
    [
      "a bucket without a name (opaque)",
      sub("arn:aws:s3:::${Data}/*"),
      { Data: bucketUnnamed },
      ["arn:aws:s3:::_generated_Data/*"],
    ],
    [
      "an attribute (Id.Attr is Fn::GetAtt)",
      sub("${Data.Arn}/*"),
      { Data: bucketNamed },
      ["arn:aws:s3:::my-data/*", "arn:aws-cn:s3:::my-data/*", "arn:aws-us-gov:s3:::my-data/*"].map(
        (arn) => arn.replace("*", "*"),
      ),
    ],
    [
      "another resource (unknown but existing)",
      sub("arn:aws:sqs:::${Q}"),
      { Q: queue },
      ["arn:aws:sqs:::*"],
    ],
    ["the same variable twice", sub("${Data}-${Data}"), { Data: bucketNamed }, ["my-data-my-data"]],
    ["a $ without braces", sub("arn:aws:s3:::b$/*"), {}, ["arn:aws:s3:::b$/*"]],
    [
      "Sub inside a Join",
      { "Fn::Join": ["", [sub("arn:aws:s3:::${Data}"), "/*"]] },
      { Data: bucketNamed },
      ["arn:aws:s3:::my-data/*"],
    ],
  ];
  for (const [name, value, extra, expected] of cases) {
    it(`reads ${name}`, () => {
      const actual = resolved(value, extra);
      expect(actual === undefined ? undefined : [...actual].sort()).toEqual([...expected].sort());
    });
  }
  const rejected: [string, unknown, Record<string, Json>][] = [
    ["the two-element form with a variable map", sub("x-${V}", { V: "a" }), {}],
    ["the two-element form without variables", sub("x", {}), {}],
    ["an unknown name", sub("arn:aws:s3:::${Nothing}"), {}],
    ["a template parameter", sub("arn:aws:s3:::${Param}"), {}],
    ["a pseudo-parameter that is not read", sub("${AWS::StackName}"), {}],
    ["an unknown attribute of a bucket", sub("${Data.DomainName}"), { Data: bucketNamed }],
    ["an unterminated variable", sub("arn:aws:s3:::${Data"), { Data: bucketNamed }],
    ["an empty variable", sub("arn:aws:s3:::${}"), {}],
    ["a non-string argument", sub({ Ref: "Data" }), { Data: bucketNamed }],
    ["an extra key next to Fn::Sub", { "Fn::Sub": "x", Other: 1 }, {}],
    [
      "an IAM policy variable (read as a variable name)",
      sub("arn:aws:s3:::b/${aws:username}/*"),
      {},
    ],
  ];
  for (const [name, value, extra] of rejected) {
    it(`still rejects ${name}`, () => {
      const result = extractStack(template(value, extra));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual(expect.objectContaining({ reason: GENERIC }));
    });
  }
  it("reads an escaped literal as ${Literal}, which the policy-variable rule then rejects", () => {
    const result = extractStack(template(sub("arn:aws:s3:::b/${!Literal}")));
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual(expect.objectContaining({ reason: POLICY_VARIABLE }));
  });
  it("rejects an escaped IAM policy variable with the policy-variable reason", () => {
    const result = extractStack(template(sub("arn:aws:s3:::b/${!aws:username}/*")));
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual({
      sourcePath: "Resources.Reader.Properties.Policies[0].PolicyDocument.Statement[0].Resource",
      reason: POLICY_VARIABLE,
    });
  });
  it("rejects Sub in Action (the Action stays literal)", () => {
    const t = template("*");
    (t.Resources.Reader.Properties.Policies[0]?.PolicyDocument.Statement[0] as Json).Action =
      sub("s3:GetObject");
    expect(extractStack(t).model).toBeUndefined();
  });
  it("keeps a path: a Sub that reaches the protected bucket objects is found", () => {
    const t = template(sub("${Data.Arn}/*"), { Data: bucketNamed });
    const result = extractStack(t);
    expect(result.model).toBeDefined();
    if (result.model === undefined) return;
    const statement = result.model.roles[0]?.statements[0];
    expect(statement?.resources).toContain("arn:aws:s3:::my-data/*");
  });
});

const VPC = "arn:aws:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole";
const APIGW = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs";
const BASIC = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
const partitionSub = (name: string) =>
  sub(`arn:\${AWS::Partition}:iam::aws:policy/service-role/${name}`);
const partitionJoin = (name: string) => ({
  "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:iam::aws:policy/service-role/${name}`]],
});
function roleTemplate(managed: unknown) {
  return {
    Resources: {
      Fn: {
        Type: "AWS::IAM::Role",
        Properties: { AssumeRolePolicyDocument: lambdaTrust, ManagedPolicyArns: managed },
      },
    },
  };
}

describe("B5: two more managed policies", () => {
  const VPC_ACTIONS = [
    "logs:CreateLogGroup",
    "logs:CreateLogStream",
    "logs:PutLogEvents",
    "ec2:CreateNetworkInterface",
    "ec2:DescribeNetworkInterfaces",
    "ec2:DescribeSubnets",
    "ec2:DeleteNetworkInterface",
    "ec2:AssignPrivateIpAddresses",
    "ec2:UnassignPrivateIpAddresses",
  ];
  const APIGW_ACTIONS = [
    "logs:CreateLogGroup",
    "logs:CreateLogStream",
    "logs:DescribeLogGroups",
    "logs:DescribeLogStreams",
    "logs:PutLogEvents",
    "logs:GetLogEvents",
    "logs:FilterLogEvents",
  ];
  for (const [name, arn, build, actions] of [
    ["AWSLambdaVPCAccessExecutionRole", VPC, partitionJoin, VPC_ACTIONS],
    ["AmazonAPIGatewayPushToCloudWatchLogs", APIGW, partitionJoin, APIGW_ACTIONS],
  ] as const) {
    for (const [form, entry] of [
      ["literal ARN", arn],
      ["Fn::Join with the partition", build(name)],
      ["Fn::Sub with the partition", partitionSub(name)],
    ] as const) {
      it(`reads ${name} from a ${form}`, () => {
        const result = extractStack(roleTemplate([entry]));
        expect(result.unsupported).toEqual([]);
        expect(result.model?.roles[0]?.statements).toEqual([
          {
            effect: "Allow",
            actions,
            resources: ["*"],
            sourcePath: "Resources.Fn.Properties.ManagedPolicyArns[0]",
          },
        ]);
      });
    }
  }
  it("reads AWSLambdaBasicExecutionRole from a Fn::Sub with the partition (RS-37)", () => {
    const result = extractStack(roleTemplate([partitionSub("AWSLambdaBasicExecutionRole")]));
    expect(result.unsupported).toEqual([]);
    expect(result.model?.roles[0]?.statements).toHaveLength(1);
  });
  it("gives no finding for the added statements", () => {
    const result = extractStack(roleTemplate([VPC, APIGW, BASIC]));
    expect(result.model).toBeDefined();
    if (result.model === undefined) return;
    expect(evaluate(result.model, { protectedBucketArns: ["arn:aws:s3:::protected"] })).toEqual([]);
  });
  const rejected: [string, unknown][] = [
    ["another managed policy", [VPC, "arn:aws:iam::aws:policy/AdministratorAccess"]],
    [
      "a Sub with another variable",
      [sub("arn:${AWS::Region}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole")],
    ],
    [
      "a Sub with a variable map",
      [sub(`arn:\${P}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole`, { P: "aws" })],
    ],
    [
      "a Sub with a literal partition other than aws",
      [sub("arn:aws-cn:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole")],
    ],
    [
      "a Sub with an escaped variable",
      [sub("arn:${!AWS::Partition}:iam::aws:policy/service-role/AWSLambdaVPCAccessExecutionRole")],
    ],
    [
      "the VPC policy outside service-role/",
      ["arn:aws:iam::aws:policy/AWSLambdaVPCAccessExecutionRole"],
    ],
    ["a name that only starts like the VPC policy", [`${VPC}2`]],
    [
      "a customer managed policy of the same name",
      ["arn:aws:iam::123456789012:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"],
    ],
  ];
  for (const [name, value] of rejected) {
    it(`still rejects ${name}`, () => {
      const result = extractStack(roleTemplate(value));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual({
        sourcePath: "Resources.Fn.Properties.ManagedPolicyArns",
        reason: MANAGED_REASON,
      });
    });
  }
});
