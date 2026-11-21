import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// spec proofgate-brushup, Step 5, design 5.3: AWS::IAM::InstanceProfile is read, not rejected.
// The profile adds no permission, so it does not enter the model; its Roles must be readable.
// インスタンスプロファイルを読みます。権限は増えないため、モデルには入りません。
const lambdaTrust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "ec2.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const role = {
  Type: "AWS::IAM::Role",
  Properties: {
    RoleName: "data-role",
    AssumeRolePolicyDocument: lambdaTrust,
    Policies: [
      {
        PolicyName: "p",
        PolicyDocument: {
          Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: "arn:aws:s3:::b/*" }],
        },
      },
    ],
  },
};
const withProfile = (properties: unknown) => ({
  Resources: {
    DataRole: role,
    Profile: { Type: "AWS::IAM::InstanceProfile", Properties: properties },
  },
});
describe("AWS::IAM::InstanceProfile", () => {
  for (const [name, properties] of [
    ["a Ref to a role of the template", { Roles: [{ Ref: "DataRole" }] }],
    ["a literal role name", { Roles: ["data-role"] }],
    ["a name and a path", { Roles: [{ Ref: "DataRole" }], InstanceProfileName: "p", Path: "/" }],
  ] as const) {
    it(`is read with ${name}, and adds nothing to the model`, () => {
      const result = extractStack(withProfile(properties));
      expect(result.unsupported).toEqual([]);
      expect(result.model?.roles.map((r) => r.logicalId)).toEqual(["DataRole"]);
      expect(result.model?.roles[0]?.statements).toHaveLength(1);
    });
  }
  for (const [name, properties] of [
    ["no Roles", {}],
    ["empty Roles", { Roles: [] }],
    ["a Ref to a parameter", { Roles: [{ Ref: "RoleParameter" }] }],
    ["a Ref to a resource that is not a role", { Roles: [{ Ref: "Profile" }] }],
    ["an import", { Roles: [{ "Fn::ImportValue": "x" }] }],
    ["Roles that is not a list", { Roles: { Ref: "DataRole" } }],
    ["no Properties", undefined],
  ] as const) {
    it(`is rejected with ${name}`, () => {
      const result = extractStack(withProfile(properties));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual(
        expect.objectContaining({ sourcePath: "Resources.Profile.Properties.Roles" }),
      );
    });
  }
  it("is not enough on its own: a template with only a profile has no role", () => {
    const result = extractStack({
      Resources: { Profile: { Type: "AWS::IAM::InstanceProfile", Properties: { Roles: ["x"] } } },
    });
    expect(result.model).toBeUndefined();
  });
});
