import { join } from "node:path";
import { evaluate, generateLean, unknownRoleFindings } from "@proofgate-cdk/core";
import type {
  ProofGateConfig,
  ResourceKind,
  ResourceModel,
  StackModel,
  StatementModel,
} from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./support/compare.js";
import { readConfig } from "./support/config.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleUnknownRoles, oracleVerdict } from "./support/oracle.js";
import { createRng, type Rng } from "./support/prng.js";

// spec proofgate-implicit-role-paths, Step 3 (task 5.3): generated models with role-bearing resources, on a separate random
// stream (seed xor STREAM). The independent oracle, the evaluator, and Lean must agree on every Case. No letter-case variants
// are generated (the evaluator ignores case on purpose; the oracle does not).
// 別の乱数ストリームで、リソース付きのモデルを作り、オラクル・評価器・Leanの一致を確かめます。
const STREAM = 0x1de57a7;
const cfg = readConfig();
const CASES = Math.min(cfg.cases, 600);
const KINDS: readonly {
  kind: ResourceKind;
  arn: (name: string) => string;
  all: string;
  actions: readonly string[];
  other: readonly string[];
}[] = [
  {
    kind: "lambda-function",
    arn: (n) => `arn:aws:lambda:us-east-1:123456789012:function:${n}`,
    all: "arn:aws:lambda:*:*:*",
    actions: [
      "lambda:UpdateFunctionCode",
      "lambda:UpdateFunctionConfiguration",
      "lambda:UpdateFunction*",
      "lambda:*",
    ],
    other: ["lambda:InvokeFunction", "lambda:GetFunction", "codebuild:StartBuild"],
  },
  {
    kind: "codebuild-project",
    arn: (n) => `arn:aws:codebuild:us-east-1:123456789012:project/${n}`,
    all: "arn:aws:codebuild:*:*:*",
    actions: [
      "codebuild:StartBuild",
      "codebuild:StartBuildBatch",
      "codebuild:Start*",
      "codebuild:*",
    ],
    other: ["codebuild:BatchGetProjects", "lambda:UpdateFunctionCode"],
  },
  {
    kind: "stepfunctions-state-machine",
    arn: (n) => `arn:aws:states:us-east-1:123456789012:stateMachine:${n}`,
    all: "arn:aws:states:*:*:*",
    actions: ["states:UpdateStateMachine", "states:Update*", "states:*"],
    other: ["states:StartExecution", "lambda:UpdateFunctionCode"],
  },
];
const NAMES = ["fn-a", "fn-b", "fn-c"];
function resourcePattern(
  rng: Rng,
  k: (typeof KINDS)[number],
  resources: readonly ResourceModel[],
): string {
  const target = rng.pick(resources);
  const name = target.name ?? `_generated_${target.logicalId}`;
  const own = KINDS.find((x) => x.kind === target.kind) ?? k;
  return rng.pick([
    "*",
    own.arn(name),
    own.arn(rng.pick(NAMES)),
    own.arn(`${name.slice(0, 3)}*`),
    own.arn(`${name.slice(0, -1)}?`),
    own.arn("*"),
    own.all,
    k.arn(rng.pick(NAMES)),
    "arn:aws:s3:::fn-a",
    name,
  ]);
}
function buildCase(index: number): {
  model: StackModel;
  config: ProofGateConfig;
  hasUnknown: boolean;
} {
  const rng = createRng(cfg.seed ^ STREAM, index);
  const roleIds = ["RoleA", "RoleB", "RoleC"].slice(0, rng.int(2, 3));
  const resources: ResourceModel[] = Array.from({ length: rng.int(0, 3) }, (_, i) => {
    const k = rng.pick(KINDS);
    const named = rng.chance(0.6);
    const unknownName = !named && rng.chance(0.15);
    const unknownRole = rng.chance(0.2);
    return {
      logicalId: `Res${i}`,
      kind: k.kind,
      ...(named ? { name: rng.pick(NAMES) } : {}),
      ...(unknownName ? { nameUnknown: true } : {}),
      ...(unknownRole
        ? { roleUnknown: true }
        : { roleLogicalId: rng.chance(0.1) ? "Missing" : rng.pick(roleIds) }),
      sourcePath: `Resources.Res${i}.Properties.Role`,
    };
  });
  const roles = roleIds.map((id) => {
    const statements: StatementModel[] = [];
    if (rng.chance(0.6)) {
      statements.push({
        effect: "Allow",
        actions: [
          rng.pick([
            "s3:GetObject",
            "s3:GetObjectVersion",
            "s3:PutObject",
            "s3:ListBucket",
            "s3:*",
          ]),
        ],
        resources: [
          rng.pick([
            "arn:aws:s3:::protected-bucket/*",
            "arn:aws:s3:::protected-bucket",
            "arn:aws:s3:::other/*",
            "arn:aws:s3:::*",
          ]),
        ],
        sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[0]`,
      });
    }
    for (let i = rng.int(0, 2); i > 0 && resources.length > 0; i--) {
      const k = rng.pick(KINDS);
      const action = rng.chance(0.75) ? rng.pick(k.actions) : rng.pick(k.other);
      statements.push({
        effect: "Allow",
        actions: [action],
        resources: Array.from({ length: rng.int(1, 2) }, () => resourcePattern(rng, k, resources)),
        sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[${statements.length}]`,
      });
    }
    if (statements.length === 0) {
      statements.push({
        effect: "Allow",
        actions: ["logs:PutLogEvents"],
        resources: ["*"],
        sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[0]`,
      });
    }
    return {
      logicalId: id,
      roleName: `role-${id.toLowerCase()}`,
      trustServices: ["ecs-tasks.amazonaws.com"],
      statements,
    };
  });
  const config: ProofGateConfig = {
    protectedBucketArns: ["arn:aws:s3:::protected-bucket"],
    ...(rng.chance(0.15) ? { allowedPassRoleTargets: [rng.pick(roleIds)] } : {}),
  };
  const model: StackModel = { version: "1", roles, ...(resources.length > 0 ? { resources } : {}) };
  return { model, config, hasUnknown: resources.some((r) => r.roleUnknown === true) };
}

describe("paths without iam:PassRole (generated, separate stream)", () => {
  const cases = Array.from({ length: CASES }, (_, index) => ({ index, ...buildCase(index) }));
  it("the oracle and the evaluator agree on every Case, in both verdicts", () => {
    const seen = new Set<string>();
    for (const c of cases) {
      if (cfg.only !== undefined && cfg.only !== c.index) continue;
      const oracle = oracleVerdict(c.model, c.config);
      seen.add(oracle);
      expect(tsVerdict(evaluate(c.model, c.config)), `case ${c.index}`).toBe(oracle);
      expect(unknownRoleFindings(c.model, c.config).length, `case ${c.index} unknown`).toBe(
        oracleUnknownRoles(c.model).length,
      );
    }
    expect([...seen].sort()).toEqual(["safe", "unsafe"]);
  });
  it("reaches both a finding and a rejection for an unknown role", () => {
    expect(cases.some((c) => oracleUnknownRoles(c.model).length > 0)).toBe(true);
    expect(cases.some((c) => c.hasUnknown && oracleUnknownRoles(c.model).length === 0)).toBe(true);
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
