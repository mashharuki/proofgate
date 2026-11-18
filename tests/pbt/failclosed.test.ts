import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { describe, expect, it } from "vitest";

// Fail Closedの境界を、プラグインの入口で確認します（Property: P23）。
// leanDirectoryを存在しない場所にしてあり、Leanを起動しようとすれば、それは説明文に現れます。
// 設定やテンプレートの不備は、Leanを起動する前に`PG-IAM-003`で拒否されなければなりません。
const noLean = "/nonexistent/proofgate-lean";

type Context = Parameters<ProofGateValidator["validate"]>[0];
const contextOf = (...templatePaths: string[]) => ({ templatePaths }) as Context;

describe("empty protected bucket configuration", () => {
  const configs: [string, unknown][] = [
    ["an empty list", []],
    ["a list with an empty string", [""]],
    ["a list with a blank string", ["   "]],
    ["a list with a non-string value", [42]],
    ["a missing list", undefined],
  ];

  for (const [name, protectedBucketArns] of configs) {
    it(`rejects ${name} with PG-IAM-003 and does not read the template or start Lean`, () => {
      const validator = new ProofGateValidator({
        protectedBucketArns: protectedBucketArns as string[],
        leanDirectory: noLean,
      });
      // 存在しないテンプレートを指定しても、設定の不備が先に報告されます。
      const report = validator.validate(contextOf("/nonexistent/template.json"));
      expect(report.success).toBe(false);
      expect(report.violations).toHaveLength(1);
      expect(report.violations[0]).toMatchObject({
        ruleName: "PG-IAM-003",
        description: expect.stringContaining("non-empty protected S3 bucket ARN"),
      });
    });
  }
});

describe("unusable template files", () => {
  const withFile = (content: string | undefined, check: (path: string) => void) => {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-failclosed-"));
    try {
      const path = join(directory, "template.json");
      if (content !== undefined) writeFileSync(path, content);
      check(path);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  };
  const validator = new ProofGateValidator({
    protectedBucketArns: ["arn:aws:s3:::protected-bucket"],
    leanDirectory: noLean,
  });

  const files: [string, string | undefined][] = [
    ["a missing file", undefined],
    ["malformed JSON", "{not-json"],
    ["an empty file", ""],
    ["JSON null", "null"],
    ["a JSON array", "[]"],
    ["a JSON string", '"text"'],
    ["an object without Resources", "{}"],
    ["a template without any IAM role", '{"Resources":{"B":{"Type":"AWS::S3::Bucket"}}}'],
  ];

  for (const [name, content] of files) {
    it(`rejects ${name} with PG-IAM-003 and does not start Lean`, () => {
      withFile(content, (path) => {
        const report = validator.validate(contextOf(path));
        expect(report.success).toBe(false);
        expect(report.violations.length).toBeGreaterThan(0);
        for (const violation of report.violations) {
          expect(violation.ruleName).toBe("PG-IAM-003");
          expect(violation.description).not.toContain("Lean verification failed");
        }
      });
    });
  }

  it("rejects a Resource with a policy variable without starting Lean", () => {
    const template = {
      Resources: {
        R: {
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
                PolicyDocument: {
                  Statement: [
                    {
                      Effect: "Allow",
                      Action: "s3:GetObject",
                      Resource: `arn:aws:s3:::other/\${aws:username}/*`,
                    },
                    { Effect: "Allow", Action: "logs:PutLogEvents", Resource: "*" },
                  ],
                },
              },
            ],
          },
        },
      },
    };
    withFile(JSON.stringify(template), (path) => {
      const report = validator.validate(contextOf(path));
      expect(report.success).toBe(false);
      expect(report.violations.every((v) => v.ruleName === "PG-IAM-003")).toBe(true);
      expect(JSON.stringify(report.violations)).toContain("policy variable");
      expect(JSON.stringify(report.violations)).not.toContain("Lean verification failed");
    });
  });
});
