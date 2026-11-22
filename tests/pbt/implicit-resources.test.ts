import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";
import { readConfig } from "./support/config.js";
import { createRng } from "./support/prng.js";

// spec proofgate-implicit-role-paths, Step 2 (task 3.4): generated templates with the three role-bearing resource
// types, on a separate random stream (seed xor STREAM). The expected model comes from the plan that built the template,
// not from the extractor. Poisons (a role that cannot be identified) must never become a known role.
// 別の乱数ストリームで、ロールで動く3種類のリソースを含むテンプレートを作り、計画から期待を決めます。
const STREAM = 0x1ab0e5;
const config = readConfig();
const CASES = Math.min(config.extractorCases, 1000);
type Json = Record<string, unknown>;
const trust = (service: string) => ({
  Statement: [{ Effect: "Allow", Principal: { Service: service }, Action: "sts:AssumeRole" }],
});
const policy = {
  PolicyName: "p",
  PolicyDocument: {
    Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" }],
  },
};
const roles: Record<string, Json> = {
  RoleA: {
    Type: "AWS::IAM::Role",
    Properties: {
      RoleName: "role-a",
      AssumeRolePolicyDocument: trust("lambda.amazonaws.com"),
      Policies: [policy],
    },
  },
  RoleB: {
    Type: "AWS::IAM::Role",
    Properties: { AssumeRolePolicyDocument: trust("lambda.amazonaws.com"), Policies: [policy] },
  },
};
const KINDS = [
  { type: "AWS::Lambda::Function", kind: "lambda-function", name: "FunctionName", role: "Role" },
  { type: "AWS::CodeBuild::Project", kind: "codebuild-project", name: "Name", role: "ServiceRole" },
  {
    type: "AWS::StepFunctions::StateMachine",
    kind: "stepfunctions-state-machine",
    name: "StateMachineName",
    role: "RoleArn",
  },
] as const;
/** [form name, CloudFormation value, expected role (undefined = unknown)] */
const FORMS: readonly [string, unknown, string | undefined][] = [
  ["getatt-named", { "Fn::GetAtt": ["RoleA", "Arn"] }, "RoleA"],
  ["getatt-unnamed", { "Fn::GetAtt": ["RoleB", "Arn"] }, "RoleB"],
  ["literal-named", "arn:aws:iam::123456789012:role/role-a", "RoleA"],
  ["literal-opaque", "arn:aws:iam::123456789012:role/_generated_RoleB", "RoleB"],
  [
    "join-partition",
    {
      "Fn::Join": [
        "",
        ["arn:", { Ref: "AWS::Partition" }, ":iam::", { Ref: "AWS::AccountId" }, ":role/role-a"],
      ],
    },
    "RoleA",
  ],
  [
    "sub-partition",
    { "Fn::Sub": "arn:${AWS::Partition}:iam::${AWS::AccountId}:role/role-a" },
    "RoleA",
  ],
  // Poisons: none of these may be read as a known role.
  ["parameter", { Ref: "RoleArnParameter" }, undefined],
  ["import", { "Fn::ImportValue": "other" }, undefined],
  ["foreign-name", "arn:aws:iam::123456789012:role/role-x", undefined],
  ["prefix-of-name", "arn:aws:iam::123456789012:role/role-", undefined],
  ["longer-name", "arn:aws:iam::123456789012:role/role-a-2", undefined],
  ["other-attribute", { "Fn::GetAtt": ["RoleA", "RoleId"] }, undefined],
  ["not-an-arn", "role-a", undefined],
  ["wrong-service", "arn:aws:s3:::role-a", undefined],
  [
    "if",
    { "Fn::If": ["C", { "Fn::GetAtt": ["RoleA", "Arn"] }, { "Fn::GetAtt": ["RoleB", "Arn"] }] },
    undefined,
  ],
  ["absent", undefined, undefined],
];
const NAMES: readonly [string, unknown, { name?: string; nameUnknown?: true }][] = [
  ["literal", "my-resource", { name: "my-resource" }],
  ["none", undefined, {}],
  ["parameter", { Ref: "NameParameter" }, { nameUnknown: true }],
  ["empty", "", { nameUnknown: true }],
];
describe("role-bearing resources (generated, separate stream)", () => {
  it("reads every generated binding as planned, and never reads a poison as a known role", () => {
    for (let index = 0; index < CASES; index++) {
      if (config.only !== undefined && config.only !== index) continue;
      const rng = createRng(config.seed ^ STREAM, index);
      const resources: Record<string, Json> = {};
      const expected: Json[] = [];
      const count = rng.int(1, 3);
      for (let i = 0; i < count; i++) {
        const kind = rng.pick(KINDS);
        const [formName, value, role] = rng.pick(FORMS);
        const [, nameValue, nameExpect] = rng.pick(NAMES);
        const id = `Res${i}`;
        const properties: Json = {};
        if (value !== undefined) properties[kind.role] = value;
        if (nameValue !== undefined) properties[kind.name] = nameValue;
        resources[id] = { Type: kind.type, Properties: properties };
        expected.push({
          logicalId: id,
          kind: kind.kind,
          ...nameExpect,
          ...(role === undefined ? { roleUnknown: true } : { roleLogicalId: role }),
          sourcePath: `Resources.${id}.Properties.${kind.role}`,
          formName,
        });
      }
      const result = extractStack({ Resources: { ...roles, ...resources } });
      expect(result.unsupported, `case ${index}`).toEqual([]);
      const got = (result.model?.resources ?? []).map((r) => ({ ...r }));
      const want = expected.map(({ formName: _form, ...rest }) => rest);
      expect(got, `case ${index}: ${expected.map((e) => e.formName).join(",")}`).toEqual(want);
    }
  });
});
