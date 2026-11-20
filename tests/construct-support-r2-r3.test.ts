import { evaluate } from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// spec proofgate-cdk-construct-support, rules R3 (trust Condition on Allow) and R2 (one managed policy).
// 信頼ポリシーのAllowのConditionの無視（R3）と、管理ポリシー1件の読み取り（R2）を確認します。
type Json = Record<string, unknown>;
const BASIC = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole";
const BASIC_JOIN = {
  "Fn::Join": [
    "",
    [
      "arn:",
      { Ref: "AWS::Partition" },
      ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
    ],
  ],
};
const MANAGED_REASON = "Managed policies are not supported in the first vertical slice";
const TRUST_CONDITION_REASON = "Condition is not supported in trust policies";
const BASIC_STATEMENT = {
  effect: "Allow",
  actions: ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"],
  resources: ["*"],
};

function roleTemplate(properties: Json = {}): { Resources: Record<string, Json> } {
  return {
    Resources: {
      Fn: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: {
            Version: "2012-10-17",
            Statement: [
              {
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole",
              },
            ],
          },
          Policies: [
            {
              PolicyName: "p",
              PolicyDocument: {
                Statement: [
                  { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::other/*" },
                ],
              },
            },
          ],
          ...properties,
        },
      },
    },
  };
}
function withTrustStatement(statement: Json) {
  const template = roleTemplate();
  const properties = (template.Resources.Fn as Json).Properties as Json;
  (properties.AssumeRolePolicyDocument as { Statement: Json[] }).Statement = [statement];
  return template;
}
const lambdaAllow = {
  Effect: "Allow",
  Principal: { Service: "lambda.amazonaws.com" },
  Action: "sts:AssumeRole",
};

describe("R3: a Condition on an Allow trust statement", () => {
  it("is read as absent, so the Lambda trust still counts", () => {
    const result = extractStack(
      withTrustStatement({
        ...lambdaAllow,
        Condition: { ArnLike: { "aws:SourceArn": "arn:aws:lambda:*:*:function:*" } },
      }),
    );
    expect(result.unsupported).toEqual([]);
    expect(result.model?.roles[0]?.trustServices).toEqual(["lambda.amazonaws.com"]);
  });
  it("adds a finding that the condition could have narrowed away", () => {
    const template = {
      Resources: {
        ...roleTemplate().Resources,
        Data: {
          Type: "AWS::IAM::Role",
          Properties: {
            RoleName: "data-role",
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  ...lambdaAllow,
                  Condition: { StringEquals: { "aws:SourceAccount": "123456789012" } },
                },
              ],
            },
            Policies: [
              {
                PolicyName: "s3",
                PolicyDocument: {
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "s3:GetObject",
                      Resource: "arn:aws:s3:::protected/*",
                    },
                  ],
                },
              },
            ],
          },
        },
        Dev: {
          Type: "AWS::IAM::Role",
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [{ ...lambdaAllow, Principal: { Service: "ec2.amazonaws.com" } }],
            },
            Policies: [
              {
                PolicyName: "p",
                PolicyDocument: {
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "iam:PassRole",
                      Resource: "arn:aws:iam::*:role/data-role",
                    },
                    { Effect: "Allow", Action: "lambda:CreateFunction", Resource: "*" },
                  ],
                },
              },
            ],
          },
        },
      },
    };
    const result = extractStack(template);
    expect(result.model).toBeDefined();
    if (result.model === undefined) return;
    expect(
      evaluate(result.model, { protectedBucketArns: ["arn:aws:s3:::protected"] }),
    ).toHaveLength(1);
  });
  it("still rejects a Condition that is not an object", () => {
    for (const condition of ["x", ["a"], null, 1]) {
      const result = extractStack(withTrustStatement({ ...lambdaAllow, Condition: condition }));
      expect(result.model, JSON.stringify(condition)).toBeUndefined();
      expect(result.unsupported).toContainEqual(
        expect.objectContaining({ reason: TRUST_CONDITION_REASON }),
      );
    }
  });
  it("still rejects a Condition on a Deny statement", () => {
    const result = extractStack(
      withTrustStatement({
        ...lambdaAllow,
        Effect: "Deny",
        Condition: { StringEquals: { a: "b" } },
      }),
    );
    expect(result.model).toBeUndefined();
    expect(result.unsupported).toContainEqual(
      expect.objectContaining({ reason: TRUST_CONDITION_REASON }),
    );
  });
  it("still rejects NotPrincipal and NotAction", () => {
    for (const key of ["NotPrincipal", "NotAction"]) {
      const result = extractStack(withTrustStatement({ ...lambdaAllow, [key]: "x" }));
      expect(result.model, key).toBeUndefined();
    }
  });
});

describe("R2: AWSLambdaBasicExecutionRole", () => {
  for (const [name, entry] of [
    ["literal ARN", BASIC],
    ["Fn::Join with the partition", BASIC_JOIN],
  ] as const) {
    it(`is read from a ${name} and its statement is appended after the inline statements`, () => {
      const result = extractStack(roleTemplate({ ManagedPolicyArns: [entry] }));
      expect(result.unsupported).toEqual([]);
      const statements = result.model?.roles[0]?.statements;
      expect(statements).toHaveLength(2);
      expect(statements?.[1]).toEqual({
        ...BASIC_STATEMENT,
        sourcePath: "Resources.Fn.Properties.ManagedPolicyArns[0]",
      });
    });
  }
  it("makes a role that has only this policy a supported statement, not a vacuous proof", () => {
    const template = roleTemplate({ ManagedPolicyArns: [BASIC_JOIN] });
    delete (template.Resources.Fn as { Properties: Json }).Properties.Policies;
    const result = extractStack(template);
    expect(result.unsupported).toEqual([]);
    expect(result.model?.roles[0]?.statements).toHaveLength(1);
  });
  it("gives no finding for the logging statement", () => {
    const result = extractStack(roleTemplate({ ManagedPolicyArns: [BASIC] }));
    expect(result.model).toBeDefined();
    if (result.model === undefined) return;
    expect(evaluate(result.model, { protectedBucketArns: ["arn:aws:s3:::protected"] })).toEqual([]);
  });
  const rejected: [string, unknown][] = [
    ["another managed policy", ["arn:aws:iam::aws:policy/ReadOnlyAccess"]],
    ["the known policy and an unknown one", [BASIC, "arn:aws:iam::aws:policy/AdministratorAccess"]],
    [
      "a policy with the same name outside service-role/",
      ["arn:aws:iam::aws:policy/AWSLambdaBasicExecutionRole"],
    ],
    [
      "a literal partition other than aws",
      ["arn:aws-cn:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"],
    ],
    [
      "a customer managed policy of an account",
      ["arn:aws:iam::123456789012:policy/service-role/AWSLambdaBasicExecutionRole"],
    ],
    ["a Ref to a parameter", [{ Ref: "PolicyParameter" }]],
    [
      "a Fn::Join with a separator",
      [
        {
          "Fn::Join": [
            "-",
            ["arn:aws:iam::aws:policy/service-role/", "AWSLambdaBasicExecutionRole"],
          ],
        },
      ],
    ],
    [
      "a Fn::Join with another Ref",
      [
        {
          "Fn::Join": [
            "",
            [
              "arn:",
              { Ref: "AWS::Region" },
              ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
            ],
          ],
        },
      ],
    ],
    ["a value that is not an array", BASIC],
    ["an entry that is a number", [1]],
  ];
  for (const [name, value] of rejected) {
    it(`still rejects ${name}`, () => {
      const result = extractStack(roleTemplate({ ManagedPolicyArns: value }));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual({
        sourcePath: "Resources.Fn.Properties.ManagedPolicyArns",
        reason: MANAGED_REASON,
      });
    });
  }
});
