import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// Step 7 (second round) of proofgate-brushup: a trust principal that is not a service (an AWS account or role, a Federated
// provider) and that is written with Fn::Join, Fn::Sub, or Fn::GetAtt is read like a literal one: it is ignored. The trust
// services of the role do not change. A Service principal must stay literal, and a value that cannot be read is still rejected.
// サービスではない信頼プリンシパルが、Fn::Joinなどで書かれていても、リテラルと同じように無視して読みます。
type Json = Record<string, unknown>;
const READ = "Trust principals must contain literal strings";
const ACCOUNT_JOIN = {
  "Fn::Join": [
    "",
    ["arn:", { Ref: "AWS::Partition" }, ":iam::", { Ref: "AWS::AccountId" }, ":root"],
  ],
};
const template = (principal: Json, extra: Record<string, Json> = {}) => ({
  Resources: {
    R: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: {
          Statement: [{ Effect: "Allow", Principal: principal, Action: "sts:AssumeRole" }],
        },
        Policies: [
          {
            PolicyName: "p",
            PolicyDocument: {
              Statement: [
                { Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" },
              ],
            },
          },
        ],
      },
    },
    ...extra,
  },
});
describe("trust principals that are not services, written with intrinsics", () => {
  const readable: [string, Json][] = [
    ["AWS with Fn::Join and the pseudo-parameters", { AWS: ACCOUNT_JOIN }],
    [
      "AWS with Fn::Sub",
      { AWS: { "Fn::Sub": "arn:${AWS::Partition}:iam::${AWS::AccountId}:root" } },
    ],
    ["AWS with the Arn of a role of the template", { AWS: { "Fn::GetAtt": ["Other", "Arn"] } }],
    [
      "AWS with a list of Fn::Join and a literal",
      { AWS: [ACCOUNT_JOIN, "arn:aws:iam::123456789012:root"] },
    ],
    [
      "Federated with Fn::Join",
      { Federated: { "Fn::Join": ["", ["cognito-identity.", { Ref: "AWS::URLSuffix" }]] } },
    ],
  ];
  for (const [name, principal] of readable) {
    it(`is read and ignored: ${name}`, () => {
      const result = extractStack(
        template(principal, {
          Other: {
            Type: "AWS::IAM::Role",
            Properties: {
              AssumeRolePolicyDocument: {
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
                    Statement: [{ Effect: "Allow", Action: "logs:PutLogEvents", Resource: "*" }],
                  },
                },
              ],
            },
          },
        }),
      );
      expect(result.unsupported).toEqual([]);
      expect(result.model?.roles.find((r) => r.logicalId === "R")?.trustServices).toEqual([]);
    });
  }
  it("keeps the service when a Service principal and an intrinsic AWS principal are together", () => {
    const result = extractStack(template({ Service: "lambda.amazonaws.com", AWS: ACCOUNT_JOIN }));
    expect(result.unsupported).toEqual([]);
    expect(result.model?.roles[0]?.trustServices).toEqual(["lambda.amazonaws.com"]);
  });
  const rejected: [string, Json][] = [
    [
      "a Service principal written with Fn::Join",
      { Service: { "Fn::Join": ["", ["lambda.", { Ref: "AWS::URLSuffix" }]] } },
    ],
    ["an AWS principal that is a parameter", { AWS: { Ref: "AccountParameter" } }],
    ["an AWS principal that is an import", { AWS: { "Fn::ImportValue": "other-account" } }],
    [
      "a list with one readable and one parameter",
      { AWS: [ACCOUNT_JOIN, { Ref: "AccountParameter" }] },
    ],
    ["an AWS principal of a number", { AWS: 42 }],
    [
      "an AWS principal of Fn::If",
      { AWS: { "Fn::If": ["C", ACCOUNT_JOIN, "arn:aws:iam::1:root"] } },
    ],
  ];
  for (const [name, principal] of rejected) {
    it(`is still rejected: ${name}`, () => {
      const result = extractStack(template(principal));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual(expect.objectContaining({ reason: READ }));
    });
  }
});
