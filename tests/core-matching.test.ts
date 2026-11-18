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
