import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// spec proofgate-implicit-role-paths, Step 2 (design sections 2 and 3): the extractor reads the role-bearing resources
// (Lambda function, CodeBuild project, Step Functions state machine) and the resolver reads their Ref and GetAtt Arn exactly.
// 抽出器が、ロールを持つリソース（Lambda関数、CodeBuildプロジェクト、Step Functionsのステートマシン）を読みます。
type Json = Record<string, unknown>;
const lambdaTrust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const role = (extra: Json = {}): Json => ({
  Type: "AWS::IAM::Role",
  Properties: {
    AssumeRolePolicyDocument: lambdaTrust,
    Policies: [
      {
        PolicyName: "p",
        PolicyDocument: {
          Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" }],
        },
      },
    ],
    ...extra,
  },
});
const getAtt = (id: string, attribute = "Arn") => ({ "Fn::GetAtt": [id, attribute] });
const fn = (properties: Json | undefined): Json => ({
  Type: "AWS::Lambda::Function",
  ...(properties === undefined ? {} : { Properties: properties }),
});
const project = (properties: Json): Json => ({
  Type: "AWS::CodeBuild::Project",
  Properties: properties,
});
const machine = (properties: Json): Json => ({
  Type: "AWS::StepFunctions::StateMachine",
  Properties: properties,
});
const template = (resources: Record<string, Json>) => ({
  Resources: { DataRole: role({ RoleName: "data-role" }), ...resources },
});
const resourcesOf = (resources: Record<string, Json>) => {
  const result = extractStack(template(resources));
  expect(result.unsupported).toEqual([]);
  return result.model?.resources;
};

describe("role-bearing resources: the role", () => {
  it("reads a Lambda function whose Role is GetAtt Arn of a role of the template", () => {
    expect(resourcesOf({ F: fn({ FunctionName: "fn-a", Role: getAtt("DataRole") }) })).toEqual([
      {
        logicalId: "F",
        kind: "lambda-function",
        name: "fn-a",
        roleLogicalId: "DataRole",
        sourcePath: "Resources.F.Properties.Role",
      },
    ]);
  });
  it("leaves the name out when the function has none (the opaque name is used later)", () => {
    const [entry] = resourcesOf({ F: fn({ Role: getAtt("DataRole") }) }) ?? [];
    expect(entry?.name).toBeUndefined();
    expect(entry?.nameUnknown).toBeUndefined();
    expect(entry?.roleLogicalId).toBe("DataRole");
  });
  it("marks the name unknown when it is an intrinsic that is read as unknown", () => {
    const [entry] =
      resourcesOf({
        F: fn({ FunctionName: { Ref: "NameParameter" }, Role: getAtt("DataRole") }),
      }) ?? [];
    expect(entry?.nameUnknown).toBe(true);
    expect(entry?.name).toBeUndefined();
  });
  const identified: [string, unknown][] = [
    [
      "a literal ARN with the RoleName of a role of the template",
      "arn:aws:iam::123456789012:role/data-role",
    ],
    [
      "an Fn::Join with the partition and the RoleName",
      {
        "Fn::Join": [
          "",
          [
            "arn:",
            { Ref: "AWS::Partition" },
            ":iam::",
            { Ref: "AWS::AccountId" },
            ":role/data-role",
          ],
        ],
      },
    ],
  ];
  for (const [name, value] of identified) {
    it(`identifies the role from ${name}`, () => {
      const [entry] = resourcesOf({ F: fn({ Role: value }) }) ?? [];
      expect(entry?.roleLogicalId).toBe("DataRole");
      expect(entry?.roleUnknown).toBeUndefined();
    });
  }
  it("identifies the opaque name of a role without RoleName", () => {
    const result = extractStack({
      Resources: { Anon: role(), F: fn({ Role: getAtt("Anon") }) },
    });
    expect(result.model?.resources?.[0]?.roleLogicalId).toBe("Anon");
  });
  const unknown: [string, Json | undefined][] = [
    ["a parameter", { Role: { Ref: "RoleArnParameter" } }],
    ["Fn::ImportValue", { Role: { "Fn::ImportValue": "other-stack-role" } }],
    [
      "a literal ARN of a role that is not in the template",
      { Role: "arn:aws:iam::123456789012:role/not-here" },
    ],
    [
      "a literal ARN with another role name",
      { Role: "arn:aws:iam::123456789012:role/data-role-2" },
    ],
    ["an attribute that is not Arn", { Role: getAtt("DataRole", "RoleId") }],
    ["GetAtt of a resource that is not a role", { Role: getAtt("Other") }],
    ["no Role property", {}],
    ["no Properties", undefined],
  ];
  for (const [name, properties] of unknown) {
    it(`marks the role unknown for ${name}`, () => {
      const [entry] =
        resourcesOf({ Other: { Type: "AWS::SQS::Queue", Properties: {} }, F: fn(properties) }) ??
        [];
      expect(entry?.roleUnknown).toBe(true);
      expect(entry?.roleLogicalId).toBeUndefined();
    });
  }
});

describe("role-bearing resources: the three kinds", () => {
  it("reads a CodeBuild project (ServiceRole, Name)", () => {
    expect(
      resourcesOf({ P: project({ Name: "build-a", ServiceRole: getAtt("DataRole") }) }),
    ).toEqual([
      {
        logicalId: "P",
        kind: "codebuild-project",
        name: "build-a",
        roleLogicalId: "DataRole",
        sourcePath: "Resources.P.Properties.ServiceRole",
      },
    ]);
  });
  it("reads a Step Functions state machine (RoleArn, StateMachineName)", () => {
    expect(
      resourcesOf({ M: machine({ StateMachineName: "flow-a", RoleArn: getAtt("DataRole") }) }),
    ).toEqual([
      {
        logicalId: "M",
        kind: "stepfunctions-state-machine",
        name: "flow-a",
        roleLogicalId: "DataRole",
        sourcePath: "Resources.M.Properties.RoleArn",
      },
    ]);
  });
  it("reads all three and sorts by logical ID", () => {
    const entries = resourcesOf({
      Z: fn({ Role: getAtt("DataRole") }),
      A: project({ ServiceRole: getAtt("DataRole") }),
      M: machine({ RoleArn: getAtt("DataRole") }),
    });
    expect(entries?.map((e) => [e.logicalId, e.kind])).toEqual([
      ["A", "codebuild-project"],
      ["M", "stepfunctions-state-machine"],
      ["Z", "lambda-function"],
    ]);
  });
  it("gives no resources field when the template has none of the three types", () => {
    const result = extractStack(template({ Q: { Type: "AWS::SQS::Queue", Properties: {} } }));
    expect(result.model).toBeDefined();
    expect(result.model && "resources" in result.model).toBe(false);
  });
  it("keeps the model of a role-only template exactly as before", () => {
    const result = extractStack({ Resources: { R: role({ RoleName: "r" }) } });
    expect(Object.keys(result.model ?? {}).sort()).toEqual(["roles", "version"]);
  });
  it("keeps an empty model, without resources, for a template with no IAM resource", () => {
    const result = extractStack({ Resources: { Q: { Type: "AWS::SQS::Queue" } } });
    expect(result.model).toEqual({ version: "1", roles: [] });
  });
});

describe("the resolver reads Ref and GetAtt Arn of the three kinds exactly", () => {
  const resolved = (value: unknown, resources: Record<string, Json>) => {
    const t = template({
      ...resources,
      Reader: role({
        Policies: [
          {
            PolicyName: "p",
            PolicyDocument: {
              Statement: [
                { Effect: "Allow", Action: "lambda:UpdateFunctionCode", Resource: value },
              ],
            },
          },
        ],
      }),
    });
    const result = extractStack(t);
    expect(result.unsupported).toEqual([]);
    return result.model?.roles.find((r) => r.logicalId === "Reader")?.statements[0]?.resources;
  };
  const partitions = (build: (p: string) => string) =>
    ["aws", "aws-cn", "aws-us-gov"].map(build).sort();
  const named = { F: fn({ FunctionName: "fn-a", Role: getAtt("DataRole") }) };
  it("GetAtt Arn of a named Lambda function", () => {
    expect([...(resolved(getAtt("F"), named) ?? [])].sort()).toEqual(
      partitions((p) => `arn:${p}:lambda:*:*:function:fn-a`),
    );
  });
  it("GetAtt Arn of an unnamed Lambda function uses the opaque name", () => {
    expect(
      [...(resolved(getAtt("F"), { F: fn({ Role: getAtt("DataRole") }) }) ?? [])].sort(),
    ).toEqual(partitions((p) => `arn:${p}:lambda:*:*:function:_generated_F`));
  });
  it("Ref of a Lambda function is its name", () => {
    expect(resolved({ Ref: "F" }, named)).toEqual(["fn-a"]);
  });
  it("GetAtt Arn and Ref of a CodeBuild project", () => {
    const p = { P: project({ Name: "build-a", ServiceRole: getAtt("DataRole") }) };
    expect([...(resolved(getAtt("P"), p) ?? [])].sort()).toEqual(
      partitions((x) => `arn:${x}:codebuild:*:*:project/build-a`),
    );
    expect(resolved({ Ref: "P" }, p)).toEqual(["build-a"]);
  });
  it("Ref and GetAtt Arn of a state machine are the ARN", () => {
    const m = { M: machine({ StateMachineName: "flow-a", RoleArn: getAtt("DataRole") }) };
    const arns = partitions((p) => `arn:${p}:states:*:*:stateMachine:flow-a`);
    expect([...(resolved(getAtt("M"), m) ?? [])].sort()).toEqual(arns);
    expect([...(resolved({ Ref: "M" }, m) ?? [])].sort()).toEqual(arns);
  });
  it("Fn::Sub of the ARN of a function reads the same", () => {
    expect([...(resolved({ "Fn::Sub": "${F.Arn}:*" }, named) ?? [])].sort()).toEqual(
      partitions((p) => `arn:${p}:lambda:*:*:function:fn-a:*`),
    );
  });
  it("any other attribute of these resources, and any other resource type, is still *", () => {
    expect(resolved(getAtt("F", "SnapStartResponse.ApplyOn"), named)).toEqual(["*"]);
    expect(resolved(getAtt("Q"), { Q: { Type: "AWS::SQS::Queue", Properties: {} } })).toEqual([
      "*",
    ]);
  });
  it("rejects a Ref to a function whose name is an intrinsic, like a bucket", () => {
    const t = template({
      F: fn({ FunctionName: { Ref: "NameParameter" }, Role: getAtt("DataRole") }),
      Reader: role({
        Policies: [
          {
            PolicyName: "p",
            PolicyDocument: {
              Statement: [
                { Effect: "Allow", Action: "lambda:UpdateFunctionCode", Resource: getAtt("F") },
              ],
            },
          },
        ],
      }),
    });
    expect(extractStack(t).model).toBeUndefined();
  });
});
