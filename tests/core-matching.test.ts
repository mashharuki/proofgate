import { evaluate } from "@proofgate/core";
import type { StackModel } from "@proofgate/model";
import { describe, expect, it } from "vitest";

const bucket = "arn:aws:s3:::protected-bucket";
const config = { protectedBucketArns: [bucket] };

/** PassRole、Lambda作成、S3アクセスの組み合わせを持つ最小モデルを作ります。 */
function model(options: { passAction: string; passResource: string; access: string }): StackModel {
  return {
    version: "1",
    roles: [
      {
        logicalId: "Dev",
        roleName: "dev-role",
        trustServices: ["ec2.amazonaws.com"],
        statements: [
          {
            effect: "Allow",
            actions: [options.passAction],
            resources: [options.passResource],
            sourcePath: "pass",
          },
          {
            effect: "Allow",
            actions: ["lambda:CreateFunction"],
            resources: ["*"],
            sourcePath: "lambda",
          },
        ],
      },
      {
        logicalId: "Data",
        roleName: "data-role",
        trustServices: ["lambda.amazonaws.com"],
        statements: [
          {
            effect: "Allow",
            actions: ["s3:GetObject"],
            resources: [options.access],
            sourcePath: "s3",
          },
        ],
      },
    ],
  };
}

const exact = {
  passAction: "iam:PassRole",
  passResource: "arn:aws:iam::123456789012:role/data-role",
  access: `${bucket}/*`,
};
const verdict = (overrides: Partial<typeof exact>) =>
  evaluate(model({ ...exact, ...overrides }), config).length > 0 ? "unsafe" : "safe";

// `?`が任意の1文字を表すこと（AWSの仕様）を、既存の検査とは別に固定します。
describe("single-character wildcard in IAM patterns", () => {
  it("is the baseline: exact patterns are unsafe", () => {
    expect(verdict({})).toBe("unsafe");
  });

  it("matches one character in an Action name", () => {
    expect(verdict({ passAction: "iam:PassRol?" })).toBe("unsafe");
    expect(verdict({ passAction: "iam:Pass?ole" })).toBe("unsafe");
  });

  it("does not match zero or two characters in an Action name", () => {
    expect(verdict({ passAction: "iam:PassRole?" })).toBe("safe");
    expect(verdict({ passAction: "iam:PassRo??e" })).toBe("safe");
    expect(verdict({ passAction: "iam:PassRo?" })).toBe("safe");
  });

  it("matches one character in the PassRole role name", () => {
    expect(verdict({ passResource: "arn:aws:iam::123456789012:role/data-rol?" })).toBe("unsafe");
    expect(verdict({ passResource: "arn:aws:iam::123456789012:role/data-ro?e" })).toBe("unsafe");
    expect(verdict({ passResource: "arn:aws:iam::123456789012:role/data-?" })).toBe("safe");
  });

  it("matches one character in an S3 object key", () => {
    expect(verdict({ access: `${bucket}/?` })).toBe("unsafe");
  });

  it("still treats other regular-expression characters literally", () => {
    expect(verdict({ passResource: "arn:aws:iam::123456789012:role/data.role" })).toBe("safe");
    expect(verdict({ passResource: "arn:aws:iam::123456789012:role/(data-role)" })).toBe("safe");
  });
});

// 保護バケット内の一部（プレフィックスや単一オブジェクト）へのアクセスも、アクセスとみなすこと（D1）。
// ポリシーResourceが表すARN集合と、保護バケットのオブジェクト集合の交差で判定します。
describe("access to the protected bucket (D1, set intersection)", () => {
  const unsafe = [
    ["prefix", `${bucket}/reports/*`],
    ["single object", `${bucket}/reports/file.csv`],
    ["any object", `${bucket}/*`],
    ["bucket wildcard that matches the bucket", "arn:aws:s3:::protected-*/*"],
    ["trailing star after the bucket name", `${bucket}*`],
    ["every S3 object", "arn:aws:s3:::*"],
    ["single-character key", `${bucket}/?`],
    ["different letter case (kept as conservative)", "arn:aws:s3:::PROTECTED-BUCKET/reports/*"],
    ["star that spans a colon (kept as conservative)", "arn:aws:s3:*protected-bucket/*"],
  ] as const;
  const safe = [
    ["prefix of another bucket", "arn:aws:s3:::another-bucket/reports/*"],
    ["bucket-level ARN only", bucket],
    ["bucket wildcard that cannot match the bucket", "arn:aws:s3:::other-*/*"],
    ["bucket whose name only starts with the protected name", `${bucket}-2/reports/*`],
    ["different service", "arn:aws:sqs:::protected-bucket/*"],
  ] as const;

  for (const [name, access] of unsafe) {
    it(`is unsafe: ${name} (${access})`, () => {
      expect(verdict({ access })).toBe("unsafe");
    });
  }
  for (const [name, access] of safe) {
    it(`is safe: ${name} (${access})`, () => {
      expect(verdict({ access })).toBe("safe");
    });
  }

  it("ignores a trailing slash in the configured bucket ARN", () => {
    const withSlash = { protectedBucketArns: [`${bucket}/`] };
    expect(evaluate(model({ ...exact, access: `${bucket}/reports/*` }), withSlash)).toHaveLength(1);
  });

  it("checks every configured bucket", () => {
    const two = { protectedBucketArns: ["arn:aws:s3:::first", bucket] };
    expect(evaluate(model({ ...exact, access: `${bucket}/reports/*` }), two)).toHaveLength(1);
  });

  it("does not count a non-data S3 action as access", () => {
    const listOnly = model(exact);
    const target = listOnly.roles[1];
    expect(target).toBeDefined();
    const changed: StackModel = {
      ...listOnly,
      roles: [
        listOnly.roles[0] as StackModel["roles"][number],
        {
          ...(target as StackModel["roles"][number]),
          statements: [
            {
              effect: "Allow",
              actions: ["s3:ListBucket"],
              resources: [`${bucket}/*`],
              sourcePath: "s3",
            },
          ],
        },
      ],
    };
    expect(evaluate(changed, config)).toHaveLength(0);
  });
});
