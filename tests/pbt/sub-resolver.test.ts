// biome-ignore-all lint/suspicious/noTemplateCurlyInString: CloudFormation Fn::Sub and IAM policy variable text
import { extractStack } from "@proofgate-cdk/extractor";
import { describe, expect, it } from "vitest";
import { readConfig } from "./support/config.js";
import { createRng } from "./support/prng.js";

// spec proofgate-brushup, Step 4 (B4). Generated Fn::Sub texts on a separate random stream
// (seed xor STREAM, so the streams of the other generated tests are not shifted).
// Property 1: a Sub text reads like the equivalent Fn::Join of literals, Ref and Fn::GetAtt.
// Property 2: a poisoned text (unknown name, unterminated or empty variable, policy variable) is never accepted.
// Fn::Subの生成テストです。別の乱数ストリームを使い、他の生成テストの列を動かしません。
const STREAM = 0x5ab5ab;
const config = readConfig();
const CASES = Math.min(config.extractorCases, 1000);
type Json = Record<string, unknown>;
const lambdaTrust = {
  Statement: [
    { Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" },
  ],
};
const extra: Record<string, Json> = {
  Data: { Type: "AWS::S3::Bucket", Properties: { BucketName: "my-data" } },
  Anon: { Type: "AWS::S3::Bucket", Properties: {} },
  Queue: { Type: "AWS::SQS::Queue", Properties: {} },
};
function template(resource: unknown) {
  return {
    Resources: {
      Reader: {
        Type: "AWS::IAM::Role",
        Properties: {
          AssumeRolePolicyDocument: lambdaTrust,
          Policies: [
            {
              PolicyName: "p",
              PolicyDocument: {
                Statement: [{ Effect: "Allow", Action: "s3:GetObject", Resource: resource }],
              },
            },
          ],
        },
      },
      ...extra,
    },
  };
}
const outcome = (resource: unknown) => {
  const result = extractStack(template(resource));
  const resources = result.model?.roles.find((r) => r.logicalId === "Reader")?.statements[0]
    ?.resources;
  return resources === undefined ? "rejected" : [...resources].sort().join("|");
};
/** [Subの断片, 同じ意味のJoinの部品] */
const atoms: readonly [string, unknown][] = [
  ["arn:", "arn:"],
  ["aws", "aws"],
  [":s3:::", ":s3:::"],
  ["/", "/"],
  ["*", "*"],
  ["key$", "key$"],
  ["${AWS::Partition}", { Ref: "AWS::Partition" }],
  ["${AWS::Region}", { Ref: "AWS::Region" }],
  ["${AWS::AccountId}", { Ref: "AWS::AccountId" }],
  ["${Data}", { Ref: "Data" }],
  ["${Anon}", { Ref: "Anon" }],
  ["${Queue}", { Ref: "Queue" }],
  ["${Data.Arn}", { "Fn::GetAtt": ["Data", "Arn"] }],
  ["${Anon.Arn}", { "Fn::GetAtt": ["Anon", "Arn"] }],
  ["${Queue.Arn}", { "Fn::GetAtt": ["Queue", "Arn"] }],
];
const poisons = [
  "${Nothing}",
  "${Param}",
  "${",
  "${}",
  "${Data",
  "${aws:username}",
  "${AWS::StackName}",
  "${Data.DomainName}",
  "${!aws:username}",
  "${!x}",
];
describe("Fn::Sub (generated, separate stream)", () => {
  it("reads like the equivalent Fn::Join", () => {
    for (let index = 0; index < CASES; index++) {
      if (config.only !== undefined && config.only !== index) continue;
      const rng = createRng(config.seed ^ STREAM, index);
      const picked = Array.from({ length: rng.int(1, 5) }, () => rng.pick(atoms));
      const text = picked.map(([fragment]) => fragment).join("");
      const join = { "Fn::Join": ["", picked.map(([, part]) => part)] };
      expect(outcome({ "Fn::Sub": text }), `case ${index}: ${text}`).toBe(outcome(join));
    }
  });
  it("never accepts a poisoned text", () => {
    for (let index = 0; index < CASES; index++) {
      if (config.only !== undefined && config.only !== index) continue;
      const rng = createRng(config.seed ^ STREAM ^ 0x1, index);
      const picked = Array.from({ length: rng.int(0, 4) }, () => rng.pick(atoms)[0]);
      picked.splice(rng.int(0, picked.length), 0, rng.pick(poisons));
      const text = picked.join("");
      expect(outcome({ "Fn::Sub": text }), `case ${index}: ${text}`).toBe("rejected");
    }
  });
  it("mutant: reading `${!x}` as a variable or as plain text would be caught", () => {
    // `${!x}` must not be read as the variable `!x` (accepted) and must not lose its `${`:
    // the literal `${x}` is a policy variable and is rejected.
    expect(outcome({ "Fn::Sub": "arn:aws:s3:::b/${!x}" })).toBe("rejected");
    expect(outcome({ "Fn::Sub": "arn:aws:s3:::b/!x" })).toBe("arn:aws:s3:::b/!x");
  });
});
