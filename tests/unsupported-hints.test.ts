import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { describe, expect, it } from "vitest";

// spec proofgate-real-stack-validation, Task 12 (revised): additive hints on PG-IAM-003 messages.
// 未対応構文の指摘へ、短いヒントを追加します。reasonの文と、受理・拒否の判定は変えません。
// The hint follows a fixed separator so that tools can cut it off: ". Hint: " in the description (the reason has
// no final period), and " Hint: " in the fix (its sentence already ends with a period).
// 区切りは、descriptionでは". Hint: "（理由の文に句点がないため）、fixでは" Hint: "（文が句点で終わるため）です。
type Json = Record<string, unknown>;
const role = (properties: Json, statement: Json = {}) => ({
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
            PolicyName: "p",
            PolicyDocument: {
              Statement: [
                {
                  Effect: "Allow",
                  Action: "s3:GetObject",
                  Resource: "arn:aws:s3:::b/*",
                  ...statement,
                },
              ],
            },
          },
        ],
        ...properties,
      },
    },
  },
});
function violationsFor(template: unknown) {
  const directory = mkdtempSync(join(tmpdir(), "proofgate-hint-test-"));
  try {
    const templatePath = join(directory, "template.json");
    writeFileSync(templatePath, JSON.stringify(template));
    const validator = new ProofGateValidator({ protectedBucketArns: ["arn:aws:s3:::protected"] });
    const report = validator.validate({ templatePaths: [templatePath] } as Parameters<
      ProofGateValidator["validate"]
    >[0]);
    expect(report.success).toBe(false);
    return report.violations.filter((v) => v.ruleName === "PG-IAM-003");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}
const OLD_FIX =
  "Replace the unsupported IAM construct with literal Action/Resource values, or extend ProofGate before deployment.";
const cases: [string, unknown, string, string][] = [
  [
    "an unlisted managed policy",
    role({ ManagedPolicyArns: ["arn:aws:iam::aws:policy/ReadOnlyAccess"] }),
    "Managed policies are not supported in the first vertical slice",
    "AWSLambdaBasicExecutionRole",
  ],
  [
    "a Resource that cannot be read",
    role({}, { Resource: { "Fn::Sub": "arn:aws:s3:::b/x" } }),
    "Action and Resource must be literal strings or arrays of strings",
    "Fn::Join",
  ],
  [
    "a Condition on a permission statement",
    role({}, { Condition: { StringEquals: { "aws:SourceAccount": "1" } } }),
    "Condition is not supported",
    "not evaluated",
  ],
  [
    "a policy variable",
    // biome-ignore lint/suspicious/noTemplateCurlyInString: IAM policy variable text
    role({}, { Resource: "arn:aws:s3:::b/${aws:username}/*" }),
    "IAM policy variables in Resource are not supported",
    "without the variable",
  ],
];
describe("hints on unsupported-syntax findings", () => {
  for (const [name, template, reason, hintText] of cases) {
    it(`adds a hint for ${name}, after the unchanged reason`, () => {
      const found = violationsFor(template).find((v) =>
        v.description.startsWith(`Unsupported IAM syntax: ${reason}`),
      );
      expect(found, reason).toBeDefined();
      const [head, hint] = (found?.description ?? "").split(". Hint: ");
      expect(head).toBe(`Unsupported IAM syntax: ${reason}`);
      expect(hint).toContain(hintText);
      expect(found?.fix?.startsWith(`${OLD_FIX} Hint: `)).toBe(true);
      expect(found?.fix).toContain(hintText);
      expect(found?.fix).not.toContain("..");
    });
  }
  it("adds no hint for other reasons", () => {
    const template = role({ Path: "/service/" });
    const found = violationsFor(template).find((v) =>
      v.description.includes("Non-default IAM role paths"),
    );
    expect(found?.description).toBe(
      "Unsupported IAM syntax: Non-default IAM role paths are not supported in the first vertical slice",
    );
    expect(found?.fix).toBe(OLD_FIX);
  });
  it("gives the vacuous-proof finding no hint, so it never mentions a policy variable", () => {
    for (const [, template] of cases) {
      for (const v of violationsFor(template)) {
        if (v.description.includes("vacuous proof")) expect(v.description).not.toContain("Hint: ");
      }
    }
  });
});
