import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate/cdk-plugin";
import { extractStack } from "@proofgate/extractor";
import { describe, expect, it } from "vitest";

// IAMポリシー変数（`${aws:username}`など）を含むResourceは、評価せずに未対応として拒否します（D5）。
// 入力を追加で拒否するだけの変更（Fail Closed）です。ポリシー変数の評価はしません。
const bucket = "arn:aws:s3:::protected-bucket";
const variable = `${bucket}/\${aws:username}/*`;

const trust = {
  Version: "2012-10-17",
  Statement: [
    { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};

interface StatementInput {
  readonly Effect?: string;
  readonly Resource: unknown;
}

const statement = (input: StatementInput) => ({
  Effect: input.Effect ?? "Allow",
  Action: "s3:GetObject",
  Resource: input.Resource,
});

/** ロールのインラインポリシーにStatementを置いたテンプレートです。 */
const inline = (input: StatementInput) => ({
  Resources: {
    R: {
      Type: "AWS::IAM::Role",
      Properties: {
        AssumeRolePolicyDocument: trust,
        Policies: [{ PolicyName: "p", PolicyDocument: { Statement: [statement(input)] } }],
      },
    },
  },
});

/** `AWS::IAM::Policy`をRefでロールへ付けたテンプレートです。 */
const attached = (input: StatementInput) => ({
  Resources: {
    R: { Type: "AWS::IAM::Role", Properties: { AssumeRolePolicyDocument: trust } },
    Pol: {
      Type: "AWS::IAM::Policy",
      Properties: {
        PolicyName: "p",
        Roles: [{ Ref: "R" }],
        PolicyDocument: { Statement: [statement(input)] },
      },
    },
  },
});

const inlinePath = "Resources.R.Properties.Policies[0].PolicyDocument.Statement[0]";
const attachedPath = "Resources.Pol.Properties.PolicyDocument.Statement[0]";

describe("policy variables in Resource (D5)", () => {
  const cases = [
    ["inline string", () => inline({ Resource: variable }), `${inlinePath}.Resource`],
    [
      "inline array element",
      () => inline({ Resource: [`${bucket}/ok/*`, variable] }),
      `${inlinePath}.Resource[1]`,
    ],
    ["attached policy string", () => attached({ Resource: variable }), `${attachedPath}.Resource`],
    [
      "attached policy array element",
      () => attached({ Resource: [variable] }),
      `${attachedPath}.Resource[0]`,
    ],
    [
      "Deny statement",
      () => inline({ Effect: "Deny", Resource: variable }),
      `${inlinePath}.Resource`,
    ],
    [
      "tag variable",
      () => inline({ Resource: `${bucket}/\${aws:PrincipalTag/team}/*` }),
      `${inlinePath}.Resource`,
    ],
    [
      "literal-character variable",
      () => inline({ Resource: `${bucket}/\${*}/x` }),
      `${inlinePath}.Resource`,
    ],
  ] as const;

  for (const [name, template, path] of cases) {
    it(`reports ${name} as unsupported at the Resource, with no model`, () => {
      const result = extractStack(template());
      expect(result.model).toBeUndefined();
      // 対応するStatementが残らないため、空虚な証明を拒否する既存の指摘も付きます。
      const found = result.unsupported.filter((f) => f.reason.includes("policy variable"));
      expect(found).toHaveLength(1);
      expect(found[0]?.sourcePath).toBe(path);
    });
  }

  it("accepts a Resource that only looks similar to a variable", () => {
    for (const resource of [
      `${bucket}/$notavariable/*`,
      `${bucket}/{braces}/*`,
      `${bucket}/$`,
      `${bucket}/\${unclosed`,
    ]) {
      const result = extractStack(inline({ Resource: resource }));
      expect(result.unsupported, resource).toEqual([]);
      expect(result.model, resource).toBeDefined();
    }
  });

  it("makes ProofGateValidator report PG-IAM-003 for the Resource", () => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-variable-"));
    try {
      const templatePath = join(directory, "template.json");
      writeFileSync(templatePath, JSON.stringify(inline({ Resource: variable })));
      const validator = new ProofGateValidator({ protectedBucketArns: [bucket] });
      const report = validator.validate({ templatePaths: [templatePath] } as Parameters<
        ProofGateValidator["validate"]
      >[0]);
      expect(report.success).toBe(false);
      const found = report.violations.filter((v) => v.description?.includes("policy variable"));
      expect(found).toHaveLength(1);
      expect(found[0]).toMatchObject({
        ruleName: "PG-IAM-003",
        description: expect.stringContaining("Unsupported IAM syntax"),
      });
      expect(found[0]?.violatingResources[0]?.locations).toEqual([`${inlinePath}.Resource`]);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

// 既存の挙動を固定する特性テストです。修正の前後で、本文・パス・件数が変わってはいけません。
// 現在の挙動: Resourceがintrinsicなら、そのStatementに1件、さらに対応するStatementが
// 1つも残らないために空虚な証明を拒否する指摘が1件、合わせて2件になります。
describe("CloudFormation intrinsic Resource keeps the existing findings", () => {
  const variableText = `\${aws:username}`;
  const joined = { "Fn::Join": ["", [`${bucket}/`, variableText]] };
  const existing = [
    {
      sourcePath: inlinePath,
      reason: "Action and Resource must be literal strings or arrays of strings",
    },
    {
      sourcePath: "Resources",
      reason: "No supported IAM policy statements were found; refusing a vacuous proof",
    },
  ];

  for (const [name, resource] of [
    ["Fn::Join with variable text", joined],
    ["array with a variable string and an intrinsic", [variable, joined]],
    ["Fn::Sub with a variable", { "Fn::Sub": variable }],
    ["Fn::Join without any variable", { "Fn::Join": ["", [`${bucket}/`, "x"]] }],
  ] as const) {
    it(`reports the same two findings and no variable finding for ${name}`, () => {
      const result = extractStack(inline({ Resource: resource }));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toEqual(existing);
    });
  }
});
