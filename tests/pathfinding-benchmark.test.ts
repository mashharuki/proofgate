import { readFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, generateLean, unknownTrustFindings } from "@proofgate-cdk/core";
import type { ProofGateConfig, StackModel } from "@proofgate-cdk/model";
import { describe, expect, it } from "vitest";
import { tsVerdict } from "./pbt/support/compare.js";
import { type BatchCase, runBatch } from "./pbt/support/lean-batch.js";

// spec proofgate-brushup, Step 7: coverage benchmark against the 91 AWS paths of Datadog pathfinding.cloud
// (Apache-2.0, tests/data/pathfinding-cloud). Each path becomes a two-role model (see predictions.json "model").
// The observed results are fixed in results.json; the predictions in predictions.json were committed before the run.
// pathfinding.cloud の 91 経路で、ProofGate がどれだけ検出するかを測ります。予想は実行前にコミットしました。
interface PathEntry {
  readonly id: string;
  readonly category: string;
  readonly services: readonly string[];
  readonly required: readonly string[];
  readonly trustFromPrerequisites: readonly string[];
}
const dir = join(process.cwd(), "tests/data/pathfinding-cloud");
const read = <T>(name: string): T => JSON.parse(readFileSync(join(dir, name), "utf8")) as T;
const paths = read<{ paths: PathEntry[] }>("aws-paths.json").paths;
const predictions = read<{ predictions: { id: string; predicted: string }[] }>(
  "predictions.json",
).predictions;
const config: ProofGateConfig = { protectedBucketArns: ["arn:aws:s3:::protected-bucket"] };
const TARGET_ARN = "arn:aws:iam::123456789012:role/target-role";
// If prerequisites name no trust, fall back to the main service of the path (documented in predictions.json "model").
const FALLBACK: Readonly<Record<string, string>> = {
  apprunner: "tasks.apprunner.amazonaws.com",
  batch: "ecs-tasks.amazonaws.com",
  ecs: "ecs-tasks.amazonaws.com",
  bedrock: "bedrock-agentcore.amazonaws.com",
  stepfunctions: "states.amazonaws.com",
  codedeploy: "ec2.amazonaws.com",
  "ec2-instance-connect": "ec2.amazonaws.com",
  ssm: "ec2.amazonaws.com",
  iam: "lambda.amazonaws.com",
  sts: "lambda.amazonaws.com",
};
// batch-001: the regex found the Batch service role; the role that is passed (jobRoleArn) trusts ecs-tasks.
// This is a correction of the benchmark model made after the first run (the first run is recorded in results.json).
const TRUST_OVERRIDE: Readonly<Record<string, string>> = { "batch-001": "ecs-tasks.amazonaws.com" };
function serviceOf(entry: PathEntry): string {
  const override = TRUST_OVERRIDE[entry.id];
  if (override !== undefined) return override;
  if (entry.trustFromPrerequisites.length > 0) return entry.trustFromPrerequisites[0] as string;
  const prefix = entry.id.replace(/-\d+$/, "");
  // The first listed service is often "iam"; the service of the path is the first one that is not iam or sts.
  const main = entry.services.find((service) => service !== "iam" && service !== "sts");
  return FALLBACK[prefix] ?? `${main ?? prefix}.amazonaws.com`;
}
/** Build the two-role model of predictions.json for one path. */
function modelOf(entry: PathEntry): StackModel {
  const attacker = entry.required
    .filter((action) => action !== "iam:PassRole" && action !== "sts:AssumeRole")
    .map((action, i) => ({
      effect: "Allow" as const,
      actions: [action],
      resources: ["*"],
      sourcePath: `Resources.Attacker.Properties.Policies[0].PolicyDocument.Statement[${i}]`,
    }));
  if (entry.required.includes("iam:PassRole")) {
    attacker.push({
      effect: "Allow",
      actions: ["iam:PassRole"],
      resources: [TARGET_ARN],
      sourcePath: "Resources.Attacker.Properties.Policies[0].PolicyDocument.Statement[pass]",
    });
  }
  if (entry.required.includes("sts:AssumeRole")) {
    attacker.push({
      effect: "Allow",
      actions: ["sts:AssumeRole"],
      resources: [TARGET_ARN],
      sourcePath: "Resources.Attacker.Properties.Policies[0].PolicyDocument.Statement[sts]",
    });
  }
  return {
    version: "1",
    roles: [
      {
        logicalId: "Attacker",
        roleName: "attacker-role",
        trustServices: ["ecs-tasks.amazonaws.com"],
        statements: attacker,
      },
      {
        logicalId: "Target",
        roleName: "target-role",
        trustServices: [serviceOf(entry)],
        statements: [
          {
            effect: "Allow",
            actions: ["s3:GetObject"],
            resources: ["arn:aws:s3:::protected-bucket/*"],
            sourcePath: "Resources.Target.Properties.Policies[0].PolicyDocument.Statement[0]",
          },
        ],
      },
    ],
  };
}
const outcome = (entry: PathEntry): string => {
  const model = modelOf(entry);
  if (tsVerdict(evaluate(model, config)) === "unsafe") return "PG-IAM-004";
  if (unknownTrustFindings(model, config).length > 0) return "PG-IAM-003";
  return "accepted";
};

describe("pathfinding.cloud coverage benchmark (Step 7)", () => {
  const predicted = new Map(predictions.map((p) => [p.id, p.predicted]));
  it("has one path and one prediction per entry", () => {
    expect(paths).toHaveLength(91);
    expect(predictions).toHaveLength(91);
    for (const p of paths) expect(predicted.has(p.id), p.id).toBe(true);
  });
  const observed = read<{
    results: { id: string; observed: string; observedAfterFix?: string; note?: string }[];
  }>("results.json").results;
  it("matches the observed results of results.json", () => {
    const want = new Map(observed.map((r) => [r.id, r.observedAfterFix ?? r.observed]));
    const mismatches = paths
      .map((entry) => ({ id: entry.id, got: outcome(entry), want: want.get(entry.id) }))
      .filter((r) => r.got !== r.want);
    expect(mismatches, JSON.stringify(mismatches)).toEqual([]);
  });
  it("differs from the committed predictions (first run) only where results.json explains it", () => {
    const differs = observed.filter((r) => r.observed !== predicted.get(r.id)).map((r) => r.id);
    const explained = observed.filter((r) => r.note !== undefined).map((r) => r.id);
    expect(differs.sort()).toEqual(explained.sort());
  });
  it("records the coverage after the launch-supplements fix: 46 findings, 45 accepted of 91", () => {
    const count = (value: string) =>
      observed.filter((r) => (r.observedAfterFix ?? r.observed) === value).length;
    expect([count("PG-IAM-004"), count("PG-IAM-003"), count("accepted")]).toEqual([46, 0, 45]);
  });
  it("agrees with Lean on every path, in one launch", () => {
    const batch: BatchCase[] = paths.map((entry, id) => {
      const model = modelOf(entry);
      return { id, model, config, ts: tsVerdict(evaluate(model, config)) };
    });
    const result = runBatch(batch, generateLean, {
      leanDirectory: join(process.cwd(), "packages/cdk-plugin/lean"),
    });
    expect(result.failed.size).toBe(0);
    for (const b of batch) expect(result.verdicts.get(b.id), String(b.id)).toBe(b.ts);
  }, 120_000);
});
