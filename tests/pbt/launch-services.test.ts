import { join } from "node:path";
import { evaluate, generateLean, unknownTrustFindings } from "@proofgate-cdk/core";
import type { ProofGateConfig, StackModel, StatementModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { LAUNCH_ACTIONS } from "./support/aws-facts.js";
import { tsVerdict } from "./support/compare.js";
import { readConfig } from "./support/config.js";
import { type BatchCase, runBatch } from "./support/lean-batch.js";
import { oracleUnknownTrusts, oracleVerdict } from "./support/oracle.js";
import { createRng } from "./support/prng.js";

// spec proofgate-brushup, Step 5 (B2): the path through any launch service of the generated table, not only Lambda.
// Every row is checked by the independent oracle, the evaluator, and Lean (one launch).
// Lambda以外の起動サービスを経由する経路です。独立オラクル、評価器、Leanの3者で確かめます。
const config: ProofGateConfig = { protectedBucketArns: ["arn:aws:s3:::protected-bucket"] };
const statement = (
  actions: string[],
  resources: string[],
  id: string,
  i: number,
): StatementModel => ({
  effect: "Allow",
  actions,
  resources,
  sourcePath: `Resources.${id}.Properties.Policies[0].PolicyDocument.Statement[${i}]`,
});
const model = (
  trust: string[],
  launch: string[],
  access: { actions: string[]; resources: string[] } = {
    actions: ["s3:GetObject"],
    resources: ["arn:aws:s3:::protected-bucket/*"],
  },
): StackModel => ({
  version: "1",
  roles: [
    {
      logicalId: "Data",
      roleName: "data-role",
      trustServices: trust,
      statements: [statement(access.actions, access.resources, "Data", 0)],
    },
    {
      logicalId: "Dev",
      roleName: "dev-role",
      trustServices: ["ecs-tasks.amazonaws.com"],
      statements: [
        statement(["iam:PassRole"], ["arn:aws:iam::123456789012:role/data-role"], "Dev", 0),
        ...(launch.length > 0 ? [statement(launch, ["*"], "Dev", 1)] : []),
      ],
    },
  ],
});
type Row = readonly [
  name: string,
  model: StackModel,
  oracle: "unsafe" | "safe",
  ts: "unsafe" | "safe",
];
const rows: readonly Row[] = [
  // RS-39 to RS-43: the services of the launch-probe Patterns.
  [
    "ECS RunTask, task role",
    model(["ecs-tasks.amazonaws.com"], ["ecs:RunTask"]),
    "unsafe",
    "unsafe",
  ],
  [
    "EC2 RunInstances, instance role",
    model(["ec2.amazonaws.com"], ["ec2:RunInstances"]),
    "unsafe",
    "unsafe",
  ],
  [
    "CodeBuild CreateProject",
    model(["codebuild.amazonaws.com"], ["codebuild:CreateProject"]),
    "unsafe",
    "unsafe",
  ],
  [
    "CloudFormation CreateStack",
    model(["cloudformation.amazonaws.com"], ["cloudformation:CreateStack"]),
    "unsafe",
    "unsafe",
  ],
  [
    "Step Functions CreateStateMachine",
    model(["states.amazonaws.com"], ["states:CreateStateMachine"]),
    "unsafe",
    "unsafe",
  ],
  ["Glue CreateJob", model(["glue.amazonaws.com"], ["glue:CreateJob"]), "unsafe", "unsafe"],
  // RS-44 and RS-45 (Lambda with the S3 rule of Step 2).
  [
    "Lambda with s3:GetObjectVersion",
    model(["lambda.amazonaws.com"], ["lambda:CreateFunction"], {
      actions: ["s3:GetObjectVersion"],
      resources: ["arn:aws:s3:::protected-bucket/*"],
    }),
    "unsafe",
    "unsafe",
  ],
  [
    "Lambda with s3:PutBucketPolicy",
    model(["lambda.amazonaws.com"], ["lambda:CreateFunction"], {
      actions: ["s3:PutBucketPolicy"],
      resources: ["arn:aws:s3:::protected-bucket"],
    }),
    "unsafe",
    "unsafe",
  ],
  // RS-46: no launch action.
  [
    "ECS DescribeTasks only",
    model(["ecs-tasks.amazonaws.com"], ["ecs:DescribeTasks"]),
    "safe",
    "safe",
  ],
  // A launch action of another service than the one the role trusts.
  [
    "ECS RunTask, but the role trusts EC2",
    model(["ec2.amazonaws.com"], ["ecs:RunTask"]),
    "safe",
    "safe",
  ],
  [
    "Lambda CreateFunction, but the role trusts ECS tasks",
    model(["ecs-tasks.amazonaws.com"], ["lambda:CreateFunction"]),
    "safe",
    "safe",
  ],
  [
    "RegisterTaskDefinition passes to ecs-tasks only, not ecs",
    model(["ecs.amazonaws.com"], ["ecs:RegisterTaskDefinition"]),
    "safe",
    "safe",
  ],
  // Tagging-only and read actions of a PassRole operation are not launch actions (data verification 2026-11-21).
  ["ecs:TagResource only", model(["ecs-tasks.amazonaws.com"], ["ecs:TagResource"]), "safe", "safe"],
  ["glue:GetJob only", model(["glue.amazonaws.com"], ["glue:GetJob"]), "safe", "safe"],
  [
    "lambda:GetLayerVersion only",
    model(["lambda.amazonaws.com"], ["lambda:GetLayerVersion"]),
    "safe",
    "safe",
  ],
  // Wildcards in the launch action.
  ["ecs:Run* (glob)", model(["ecs-tasks.amazonaws.com"], ["ecs:Run*"]), "unsafe", "unsafe"],
  ["ec2:* (service star)", model(["ec2.amazonaws.com"], ["ec2:*"]), "unsafe", "unsafe"],
  [
    "mixed case STATES:createStateMachine",
    model(["states.amazonaws.com"], ["STATES:createStateMachine"]),
    "unsafe",
    "unsafe",
  ],
  // Follow-up a: a regional service principal is read as the global one.
  [
    "regional Step Functions principal",
    model(["states.us-east-1.amazonaws.com"], ["states:CreateStateMachine"]),
    "unsafe",
    "unsafe",
  ],
  [
    "regional principal of another service",
    model(["states.eu-west-1.amazonaws.com"], ["ecs:RunTask"]),
    "safe",
    "safe",
  ],
  // An entry of the table with no PassedToService value ("*"): any service (approved over-approximation).
  [
    "any-service entry cognito-idp:CreateUserPool, role trusts ECS tasks",
    model(["ecs-tasks.amazonaws.com"], ["cognito-idp:CreateUserPool"]),
    "unsafe",
    "unsafe",
  ],
  // Lambda regression (unchanged from 1.1.2).
  [
    "Lambda CreateFunction",
    model(["lambda.amazonaws.com"], ["lambda:CreateFunction"]),
    "unsafe",
    "unsafe",
  ],
  [
    "Lambda UpdateFunctionConfiguration",
    model(["lambda.amazonaws.com"], ["lambda:UpdateFunctionConfiguration"]),
    "unsafe",
    "unsafe",
  ],
  [
    "Lambda UpdateFunctionCode only",
    model(["lambda.amazonaws.com"], ["lambda:UpdateFunctionCode"]),
    "safe",
    "safe",
  ],
  // Trust "*": the oracle reads it strictly (no service); the evaluator over-approximates (TRUST_STAR).
  ["trust * with ecs:RunTask", model(["*"], ["ecs:RunTask"]), "safe", "unsafe"],
  ["trust * with no launch action", model(["*"], ["ecs:DescribeTasks"]), "safe", "safe"],
];
describe("paths through launch services (B2)", () => {
  for (const [name, m, oracle, ts] of rows) {
    it(`${name}: oracle ${oracle}, evaluator ${ts}`, () => {
      expect(oracleVerdict(m, config), "oracle").toBe(oracle);
      expect(tsVerdict(evaluate(m, config)), "evaluate").toBe(ts);
    });
  }
  it("names the service and the launch action in the violation", () => {
    const [violation] = evaluate(model(["ecs-tasks.amazonaws.com"], ["ecs:RunTask"]), config);
    expect(violation?.explanation).toContain("ecs-tasks.amazonaws.com");
    expect(violation?.explanation).toContain("ecs:RunTask");
    expect(violation?.sourcePaths).toContain(
      "Resources.Dev.Properties.Policies[0].PolicyDocument.Statement[1]",
    );
  });
  it("keeps the Lambda wording for a Lambda path", () => {
    const [violation] = evaluate(
      model(["lambda.amazonaws.com"], ["lambda:CreateFunction"]),
      config,
    );
    expect(violation?.explanation).toContain("lambda.amazonaws.com");
    expect(violation?.ruleId).toBe("PG-IAM-004");
  });
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
  it("generates the generalized Lean fields with the service", () => {
    const lean = generateLean(model(["ecs-tasks.amazonaws.com"], ["ecs:RunTask"]), config);
    expect(lean).toContain("canLaunch := true");
    expect(lean).toContain("targetTrustsService := true");
    expect(lean).toContain('service := "ecs-tasks.amazonaws.com"');
    expect(lean).not.toContain("canControlLambda");
  });
});
describe("a passable, bucket-reaching role that trusts an unknown service (design 5.4)", () => {
  const unknown = model(["made-up-service.amazonaws.com"], ["lambda:CreateFunction"]);
  it("is reported by both the oracle and core (RS-47)", () => {
    expect(oracleUnknownTrusts(unknown, config)).toEqual([
      { target: "Data", service: "made-up-service.amazonaws.com" },
    ]);
    expect(unknownTrustFindings(unknown, config)).toEqual([
      {
        sourcePath: "Resources.Data.Properties.AssumeRolePolicyDocument",
        reason:
          "Role trusts made-up-service.amazonaws.com, which ProofGate cannot tell runs code with a passed role",
      },
    ]);
  });
  const quiet: [string, StackModel][] = [
    ["a known service", model(["ecs-tasks.amazonaws.com"], ["lambda:CreateFunction"])],
    ["a regional form of a known service", model(["states.us-west-2.amazonaws.com"], [])],
    ["trust *", model(["*"], [])],
    [
      "an unknown service, but the role reaches no protected bucket",
      model(["made-up-service.amazonaws.com"], [], {
        actions: ["s3:GetObject"],
        resources: ["arn:aws:s3:::other/*"],
      }),
    ],
  ];
  for (const [name, m] of quiet) {
    it(`reports nothing for ${name}`, () => {
      expect(oracleUnknownTrusts(m, config)).toEqual([]);
      expect(unknownTrustFindings(m, config)).toEqual([]);
    });
  }
  it("reports nothing when nobody can pass the role", () => {
    const m: StackModel = {
      version: "1",
      roles: [unknown.roles[0] as StackModel["roles"][number]],
    };
    expect(oracleUnknownTrusts(m, config)).toEqual([]);
    expect(unknownTrustFindings(m, config)).toEqual([]);
  });
  it("reports nothing for an allowed PassRole target", () => {
    const allowed = { ...config, allowedPassRoleTargets: ["Data"] };
    expect(oracleUnknownTrusts(unknown, allowed)).toEqual([]);
    expect(unknownTrustFindings(unknown, allowed)).toEqual([]);
  });
});
// Generated rows on a separate random stream: a random launch pattern from the table (or a non-launch action),
// a random trust (a table service, its regional form, another service, "*", or an unknown service), and checks
// oracle = evaluator (the evaluator may only add findings for trust "*"), and evaluator = Lean, in one launch.
// 別の乱数ストリームで、表の起動アクションと信頼先をランダムに組み合わせ、3者の一致を確かめます。
describe("launch services (generated, separate stream)", () => {
  const STREAM = 0x1a0c4;
  const cfg = readConfig();
  const actions = Object.keys(LAUNCH_ACTIONS);
  const services = [...new Set(Object.values(LAUNCH_ACTIONS).flat())].filter((s) => s !== "*");
  const nonLaunch = ["ecs:DescribeTasks", "lambda:GetLayerVersion", "glue:GetJob", "s3:ListBucket"];
  const shape = (rng: ReturnType<typeof createRng>, action: string) => {
    const [prefix, name] = action.split(":") as [string, string];
    return rng.pick([
      action,
      `${prefix.toUpperCase()}:${name}`,
      `${prefix}:${name.slice(0, Math.max(1, name.length - 3))}*`,
      `${prefix}:*`,
    ]);
  };
  const cases = Array.from({ length: 300 }, (_, index) => {
    const rng = createRng(cfg.seed ^ STREAM, index);
    const launch = rng.chance(0.8) ? shape(rng, rng.pick(actions)) : rng.pick(nonLaunch);
    const service = rng.pick(services);
    const trust = rng.pick([
      service,
      service.replace(".amazonaws.com", ".eu-central-1.amazonaws.com"),
      ...(Object.entries(LAUNCH_ACTIONS).find(([a]) => a === launch.toLowerCase())?.[1] ?? []),
      "*",
    ]);
    return { index, model: model([trust], [launch]), trust };
  });
  it("agrees: oracle and evaluator (trust * may only add findings), evaluator and Lean", () => {
    for (const c of cases) {
      const oracle = oracleVerdict(c.model, config);
      const ts = tsVerdict(evaluate(c.model, config));
      if (c.trust === "*") {
        if (oracle === "unsafe") expect(ts, `case ${c.index}`).toBe("unsafe");
      } else {
        expect(
          ts,
          `case ${c.index} ${JSON.stringify(c.model.roles[1]?.statements[1]?.actions)} ${c.trust}`,
        ).toBe(oracle);
      }
      expect(unknownTrustFindings(c.model, config).length, `case ${c.index}`).toBe(
        oracleUnknownTrusts(c.model, config).length,
      );
    }
    const batch: BatchCase[] = cases.map((c) => ({
      id: c.index,
      model: c.model,
      config,
      ts: tsVerdict(evaluate(c.model, config)),
    }));
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 300_000);
  it("reaches both verdicts and several services", () => {
    const verdicts = new Set(cases.map((c) => oracleVerdict(c.model, config)));
    expect([...verdicts].sort()).toEqual(["safe", "unsafe"]);
  });
});
