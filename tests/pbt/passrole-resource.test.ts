import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, RoleModel, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";

// spec proofgate-lean-evaluator, L0 (F1 and S3): which iam:PassRole Resources denote the target role. Each row is checked by
// the independent oracle, the evaluator, and Lean (one launch).
// iam:PassRoleのResourceが対象ロールを表すかを、オラクル、評価器、Leanで確かめます（F1とS3）。
const BUCKET = "arn:aws:s3:::protected-bucket";
const config: ProofGateConfig = { protectedBucketArns: [BUCKET] };
const data = (named: boolean): RoleModel => ({
  logicalId: "Data",
  ...(named ? { roleName: "data-role" } : {}),
  trustServices: ["lambda.amazonaws.com"],
  statements: [
    { effect: "Allow", actions: ["s3:GetObject"], resources: [`${BUCKET}/*`], sourcePath: "d" },
  ],
});
const model = (passResource: string, named = true): StackModel => ({
  version: "1",
  roles: [
    data(named),
    {
      logicalId: "Dev",
      roleName: "dev-role",
      trustServices: ["ec2.amazonaws.com"],
      statements: [
        { effect: "Allow", actions: ["iam:PassRole"], resources: [passResource], sourcePath: "p" },
        { effect: "Allow", actions: ["lambda:CreateFunction"], resources: ["*"], sourcePath: "l" },
      ],
    },
  ],
});
type V = "unsafe" | "safe";
/** name, model, the oracle's verdict (AWS semantics), the evaluator's verdict (with the decided over-approximations). */
type Row = readonly [string, StackModel, V, V];
const both = (name: string, m: StackModel, v: V): Row => [name, m, v, v];
const rows: Row[] = [
  // F1: Resources without the literal ":role/" that denote the role (1.2.0 missed every one of them).
  both("F1: arn:aws:iam::*:role* (observation P10)", model("arn:aws:iam::*:role*"), "unsafe"),
  both(
    "F1: arn:aws:iam:*role/data-role (observation P11)",
    model("arn:aws:iam:*role/data-role"),
    "unsafe",
  ),
  both(
    "F1: arn:aws:iam::123456789012:* (one account)",
    model("arn:aws:iam::123456789012:*"),
    "unsafe",
  ),
  both("F1: arn:aws:iam::*:*", model("arn:aws:iam::*:*"), "unsafe"),
  both("F1: arn:aws* (observation P14)", model("arn:aws*"), "unsafe"),
  both("F1: arn:*", model("arn:*"), "unsafe"),
  both("F1: arn:*:iam::*:*", model("arn:*:iam::*:*"), "unsafe"),
  // S3: an account part with a colon cannot be a real role ARN (approved 2026-11-27).
  both("S3: arn:aws:iam::1:2:role/data-role", model("arn:aws:iam::1:2:role/data-role"), "safe"),
  // Unchanged.
  both("a role ARN", model("arn:aws:iam::123456789012:role/data-role"), "unsafe"),
  both("a name prefix", model("arn:aws:iam::*:role/data-*"), "unsafe"),
  both("* ", model("*"), "unsafe"),
  both("another name prefix", model("arn:aws:iam::*:role/other-*"), "safe"),
  both("a user, not a role", model("arn:aws:iam::*:user/data-role"), "safe"),
  both("an S3 ARN", model("arn:aws:s3:::data-role"), "safe"),
  // Decided over-approximation of the evaluator: a bare name or a logical ID counts. IAM rejects them (observation P12).
  ["a bare role name (over-approximation)", model("data-role"), "safe", "unsafe"],
  ["a logical ID (over-approximation)", model("Data"), "safe", "unsafe"],
  // A role without RoleName (rule R0): the opaque name, or an unknown name that only a wildcard in the name part can meet.
  both("unnamed: a name prefix", model("arn:aws:iam::*:role/MyStack-*", false), "unsafe"),
  both("unnamed: a ? in the name", model("arn:aws:iam::*:role/x?", false), "unsafe"),
  both("unnamed: a literal name", model("arn:aws:iam::*:role/data-role", false), "safe"),
  both("unnamed: the opaque name", model("arn:aws:iam::*:role/_generated_Data", false), "unsafe"),
  both("unnamed, F1: arn:aws:iam::*:*", model("arn:aws:iam::*:*", false), "unsafe"),
  both("unnamed, F1: arn:aws:iam::*:role*", model("arn:aws:iam::*:role*", false), "unsafe"),
  both("unnamed, S3: arn:aws:iam::1:2:role/x*", model("arn:aws:iam::1:2:role/x*", false), "safe"),
];
describe("iam:PassRole Resources (F1, S3)", () => {
  for (const [name, m, oracle, ts] of rows) {
    it(`${name}: oracle ${oracle}, evaluator ${ts}`, () => {
      expect(oracleVerdict(m, config), "oracle").toBe(oracle);
      expect(tsVerdict(evaluate(m, config)), "evaluate").toBe(ts);
    });
  }
  it("agrees with Lean on every row, in one launch", () => {
    const batch: BatchCase[] = rows.map(([, m], id) => ({
      id,
      model: m,
      config,
      ts: tsVerdict(evaluate(m, config)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 120_000);
});
