import { join } from "node:path";
import { evaluate, generateLean } from "@proofgate-cdk/core";
import type { ProofGateConfig, RoleModel, StackModel, StatementModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { readConfig } from "./support/config.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleVerdict } from "./support/oracle.js";
import { createRng, type Rng } from "./support/prng.js";

// spec proofgate-self-escalation, Step 2 (task 3.4): generated models for PG-IAM-005, on a separate random stream (seed xor
// STREAM). The independent oracle, the evaluator, and Lean must agree on every Case. No letter-case variants are generated
// (the evaluator ignores case on purpose; the oracle does not).
// 別の乱数ストリームで、PG-IAM-005のモデルを作り、オラクル・評価器・Leanの一致を確かめます。
const STREAM = 0x5e1f35c;
const cfg = readConfig();
const CASES = Math.min(cfg.cases, 600);
const ACCOUNT = "123456789012";
const NAMES = ["role-a", "role-b", "role-c"] as const;
const arn = (name: string) => `arn:aws:iam::${ACCOUNT}:role/${name}`;
const ACTIONS = [
  "iam:PutRolePolicy",
  "iam:AttachRolePolicy",
  "iam:UpdateAssumeRolePolicy",
  "iam:CreateRole",
  "iam:Put*",
  "iam:*Role*",
  "iam:?ttachRolePolicy",
  "iam:*",
  "*",
  "iam:GetRolePolicy",
  "iam:DeleteRolePolicy",
  "iam:PutUserPolicy",
  "s3:GetObject",
  "lambda:UpdateFunctionCode",
] as const;
function resourcePatterns(
  rng: Rng,
  names: readonly (string | undefined)[],
  ids: readonly string[],
): string[] {
  const pick = () => {
    const i = rng.int(0, names.length - 1);
    const name = names[i] ?? `_generated_${ids[i]}`;
    return rng.pick([
      "*",
      arn(name),
      arn(`${name.slice(0, 5)}*`),
      arn(`${name.slice(0, -1)}?`),
      arn("*"),
      arn("ci-*"),
      arn("other-*"),
      "arn:aws:iam::*:*",
      "arn:aws:s3:::role-a",
      name,
      ids[i] as string,
    ]);
  };
  return Array.from({ length: rng.int(1, 2) }, pick);
}
function buildCase(index: number): { model: StackModel; config: ProofGateConfig } {
  const rng = createRng(cfg.seed ^ STREAM, index);
  const count = rng.int(1, 3);
  const ids = ["RoleA", "RoleB", "RoleC"].slice(0, count);
  const names = NAMES.slice(0, count).map((n) => (rng.chance(0.25) ? undefined : n));
  const roles: RoleModel[] = ids.map((id, i) => {
    const statements: StatementModel[] = [];
    for (let k = rng.int(1, 3); k > 0; k--) {
      statements.push({
        effect: "Allow",
        actions: [rng.pick(ACTIONS)].concat(rng.chance(0.25) ? [rng.pick(ACTIONS)] : []),
        resources: resourcePatterns(rng, names, ids),
        sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[${statements.length}]`,
      });
    }
    if (rng.chance(0.5)) {
      statements.push({
        effect: "Allow",
        actions: [rng.pick(["s3:GetObject", "s3:PutBucketPolicy", "s3:ListBucket"])],
        resources: [
          rng.pick([
            "arn:aws:s3:::protected-bucket/*",
            "arn:aws:s3:::protected-bucket",
            "arn:aws:s3:::other/*",
          ]),
        ],
        sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[${statements.length}]`,
      });
    }
    const name = names[i];
    return {
      logicalId: id,
      ...(name === undefined ? {} : { roleName: name }),
      trustServices: ["ecs-tasks.amazonaws.com"],
      statements,
    };
  });
  const config: ProofGateConfig = {
    protectedBucketArns: rng.chance(0.2)
      ? ["arn:aws:s3:::protected-bucket", "arn:aws:s3:::second"]
      : ["arn:aws:s3:::protected-bucket"],
    ...(rng.chance(0.2)
      ? { allowedPolicyWriters: [rng.pick(ids), "Nobody"].slice(0, rng.int(1, 2)) }
      : {}),
    ...(rng.chance(0.15) ? { allowedPassRoleTargets: [rng.pick(ids)] } : {}),
  };
  return { model: { version: "1", roles }, config };
}

describe("roles that change IAM themselves (generated, separate stream)", () => {
  const cases = Array.from({ length: CASES }, (_, index) => ({ index, ...buildCase(index) }));
  it("the oracle and the evaluator agree on every Case, and both verdicts occur", () => {
    const seen = new Set<string>();
    for (const c of cases) {
      if (cfg.only !== undefined && cfg.only !== c.index) continue;
      const oracle = oracleVerdict(c.model, c.config);
      seen.add(oracle);
      expect(tsVerdict(evaluate(c.model, c.config)), `case ${c.index}`).toBe(oracle);
    }
    expect([...seen].sort()).toEqual(["safe", "unsafe"]);
  });
  it("Lean agrees with the evaluator on every Case, in one launch", () => {
    const batch: BatchCase[] = cases.map((c) => ({
      id: c.index,
      model: c.model,
      config: c.config,
      ts: tsVerdict(evaluate(c.model, c.config)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 300_000);
});
