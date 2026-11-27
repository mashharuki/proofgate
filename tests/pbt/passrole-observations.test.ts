import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { RoleModel, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { oracleVerdict } from "./support/oracle.js";

// spec proofgate-lean-evaluator, L0.3 (F1): IAMエンジンの観測P01〜P14を、汎用の照合ではなく、PassRoleの判定そのもので確かめます。
// The PassRole observations of the real IAM engine (P01 to P14) are checked against the PassRole judgment itself, not only
// against the generic matcher. Before F1 they were compared with the generic matcher, so P10, P11, and P14 never reached it.
type Row = [id: string, pattern: string, value: string, awsMatches: boolean];
const rows = (
  JSON.parse(readFileSync(join(process.cwd(), "tests/pbt/aws-observations.json"), "utf8")) as {
    resource: Row[];
  }
).resource.filter(([id]) => id.startsWith("P"));
// P02: the value has a role path (role/p/x). Roles with a path other than / are rejected by the extractor, so the model has
// no such role. Not applicable.
// ロールのパスが/以外のロールは抽出器が拒否するため、モデルに現れません。
const NOT_APPLICABLE = new Set(["P02"]);
// P09: the account of a role is not known at synthesis, so a Resource with a literal account counts for every account.
// 合成時にはロールのアカウントが分からないため、リテラルのアカウントは、どのアカウントにも一致するものとして読みます。
const ORACLE_DEVIATIONS: Readonly<Record<string, string>> = {
  P09: "the account of the role is unknown at synthesis",
};
const BUCKET = "arn:aws:s3:::protected-bucket";
function modelFor(pattern: string, value: string): StackModel {
  const name = value.slice(value.lastIndexOf("role/") + "role/".length);
  const data: RoleModel = {
    logicalId: "Data",
    roleName: name,
    trustServices: ["lambda.amazonaws.com"],
    statements: [
      { effect: "Allow", actions: ["s3:GetObject"], resources: [`${BUCKET}/*`], sourcePath: "d" },
    ],
  };
  const dev: RoleModel = {
    logicalId: "Dev",
    roleName: "dev-role",
    trustServices: ["ec2.amazonaws.com"],
    statements: [
      { effect: "Allow", actions: ["iam:PassRole"], resources: [pattern], sourcePath: "p" },
      { effect: "Allow", actions: ["lambda:CreateFunction"], resources: ["*"], sourcePath: "l" },
    ],
  };
  return { version: "1", roles: [data, dev] };
}
describe("the PassRole observations against the oracle's PassRole judgment", () => {
  it("covers the 14 PassRole rows", () => {
    expect(rows).toHaveLength(14);
  });
  for (const [id, pattern, value, aws] of rows) {
    if (NOT_APPLICABLE.has(id)) continue;
    const deviation = ORACLE_DEVIATIONS[id];
    const expected = deviation === undefined ? aws : !aws;
    it(`${id}: PassRole on ${pattern} for ${value} (AWS: ${aws}${deviation ? `; deviation: ${deviation}` : ""})`, () => {
      const verdict = oracleVerdict(modelFor(pattern, value), { protectedBucketArns: [BUCKET] });
      expect(verdict).toBe(expected ? "unsafe" : "safe");
    });
  }
});
