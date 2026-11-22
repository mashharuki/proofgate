import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate } from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";

// Step 7 (second round) of proofgate-brushup: four more AWS managed policies are read (approved by the user on 2026-11-22):
// AmazonSSMManagedInstanceCore, AWSGlueServiceRole, AWSBackupServiceRolePolicyForBackup, AWSBackupServiceRolePolicyForRestores.
// The expected statements come from the AWS documentation pages saved in tests/data/managed-policies (read on 2026-11-22),
// not from the extractor's table, so a transcription error cannot pass. A Condition of an Allow statement is dropped (it can only
// narrow the statement, so dropping it only adds findings).
// AWS管理ポリシー4件を読みます。期待値は、保存したAWSドキュメントから取ります（抽出器の表ではありません）。
interface Saved {
  readonly policyName: string;
  readonly arn: string;
  readonly document: {
    Statement: { Effect: string; Action: string | string[]; Resource: string | string[] }[];
  };
}
const NAMES = [
  "AmazonSSMManagedInstanceCore",
  "AWSGlueServiceRole",
  "AWSBackupServiceRolePolicyForBackup",
  "AWSBackupServiceRolePolicyForRestores",
] as const;
const saved = (name: string): Saved =>
  JSON.parse(
    readFileSync(join(process.cwd(), "tests/data/managed-policies", `${name}.json`), "utf8"),
  ) as Saved;
const list = (value: string | string[]) => (Array.isArray(value) ? value : [value]);
const trust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "glue.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const roleWith = (managed: unknown[], extra: Record<string, unknown> = {}) => ({
  Resources: {
    R: {
      Type: "AWS::IAM::Role",
      Properties: { AssumeRolePolicyDocument: trust, ManagedPolicyArns: managed, ...extra },
    },
  },
});
const joinArn = (name: string) => ({
  "Fn::Join": ["", ["arn:", { Ref: "AWS::Partition" }, `:iam::aws:policy/${name}`]],
});
// biome-ignore lint/suspicious/noTemplateCurlyInString: CloudFormation Fn::Sub variable text
const sub = (name: string) => ({ "Fn::Sub": `arn:\${AWS::Partition}:iam::aws:policy/${name}` });

describe("four more managed policies", () => {
  for (const name of NAMES) {
    const policy = saved(name);
    const key = policy.policyName;
    for (const [form, entry] of [
      ["a literal ARN", `arn:aws:iam::aws:policy/${key}`],
      ["Fn::Join with the partition", joinArn(key)],
      ["Fn::Sub with the partition", sub(key)],
    ] as const) {
      it(`${name} is read from ${form}, statement by statement`, () => {
        const result = extractStack(roleWith([entry]));
        expect(result.unsupported).toEqual([]);
        const statements = result.model?.roles[0]?.statements ?? [];
        expect(statements).toHaveLength(policy.document.Statement.length);
        policy.document.Statement.forEach((expected, i) => {
          expect(statements[i]?.effect, `${name} #${i}`).toBe("Allow");
          expect(statements[i]?.actions, `${name} #${i}`).toEqual(list(expected.Action));
          expect(statements[i]?.resources, `${name} #${i}`).toEqual(list(expected.Resource));
          expect(statements[i]?.sourcePath).toBe("Resources.R.Properties.ManagedPolicyArns[0]");
        });
      });
    }
  }
  const rejected: [string, unknown[]][] = [
    [
      "AmazonSSMManagedInstanceCore under service-role/",
      ["arn:aws:iam::aws:policy/service-role/AmazonSSMManagedInstanceCore"],
    ],
    ["AWSGlueServiceRole without service-role/", ["arn:aws:iam::aws:policy/AWSGlueServiceRole"]],
    [
      "a name that only starts like the Glue policy",
      ["arn:aws:iam::aws:policy/service-role/AWSGlueServiceRoleDefault"],
    ],
    [
      "AWSBackupServiceRolePolicyForS3Backup (not read)",
      ["arn:aws:iam::aws:policy/service-role/AWSBackupServiceRolePolicyForS3Backup"],
    ],
    [
      "a customer managed policy of the same name",
      ["arn:aws:iam::123456789012:policy/AmazonSSMManagedInstanceCore"],
    ],
    [
      "one read policy and one that is not",
      [
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
        "arn:aws:iam::aws:policy/AdministratorAccess",
      ],
    ],
    [
      "AWS_ConfigRole (not read: its table is too large)",
      ["arn:aws:iam::aws:policy/service-role/AWS_ConfigRole"],
    ],
  ];
  for (const [name, entries] of rejected) {
    it(`still rejects ${name}`, () => {
      const result = extractStack(roleWith(entries));
      expect(result.model).toBeUndefined();
      expect(result.unsupported).toContainEqual({
        sourcePath: "Resources.R.Properties.ManagedPolicyArns",
        reason: "Managed policies are not supported in the first vertical slice",
      });
    });
  }
  it("gives no finding for the SSM policy alone", () => {
    const result = extractStack(roleWith(["arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore"]));
    expect(result.model).toBeDefined();
    if (result.model === undefined) return;
    expect(evaluate(result.model, { protectedBucketArns: ["arn:aws:s3:::protected"] })).toEqual([]);
  });
  it("counts the S3 statements of the Glue policy: any bucket, keys that contain aws-glue-", () => {
    // arn:aws:s3:::*/*aws-glue-*/* may denote an object of the protected bucket, so a role that holds the policy can reach it.
    const template = {
      Resources: {
        ...roleWith(["arn:aws:iam::aws:policy/service-role/AWSGlueServiceRole"], {
          RoleName: "glue-role",
        }).Resources,
        Dev: {
          Type: "AWS::IAM::Role",
          Properties: {
            AssumeRolePolicyDocument: {
              Statement: [
                {
                  Effect: "Allow",
                  Principal: { Service: "ec2.amazonaws.com" },
                  Action: "sts:AssumeRole",
                },
              ],
            },
            Policies: [
              {
                PolicyName: "p",
                PolicyDocument: {
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "iam:PassRole",
                      Resource: "arn:aws:iam::123456789012:role/glue-role",
                    },
                    { Effect: "Allow", Action: "glue:CreateJob", Resource: "*" },
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
    const found = evaluate(result.model, { protectedBucketArns: ["arn:aws:s3:::protected"] });
    expect(found.map((v) => [v.principalLogicalId, v.targetRoleLogicalId])).toEqual([["Dev", "R"]]);
  });
  it("keeps the earlier policy and the order of statements of a role with several policies", () => {
    const result = extractStack(
      roleWith([
        "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole",
        "arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore",
      ]),
    );
    const statements = result.model?.roles[0]?.statements ?? [];
    expect(statements[0]?.actions).toEqual([
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]);
    expect(statements[0]?.sourcePath).toBe("Resources.R.Properties.ManagedPolicyArns[0]");
    expect(statements[1]?.sourcePath).toBe("Resources.R.Properties.ManagedPolicyArns[1]");
    expect(statements).toHaveLength(
      1 + saved("AmazonSSMManagedInstanceCore").document.Statement.length,
    );
  });
});
