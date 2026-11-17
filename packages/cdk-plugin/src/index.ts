import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { generateLean, evaluate } from "@proofgate/core";
import { extractStack } from "@proofgate/extractor";
import type { ProofGateConfig } from "@proofgate/model";
import type { IPolicyValidationContext, IPolicyValidationPlugin, PolicyValidationPluginReport, PolicyViolationBeta1 } from "aws-cdk-lib";

export interface ProofGateValidatorProps extends ProofGateConfig {
  readonly leanDirectory?: string;
}

type LeanResult =
  | { readonly status: "accepted" }
  | { readonly status: "rejected" }
  | { readonly status: "error"; readonly diagnostic: string };

export class ProofGateValidator implements IPolicyValidationPlugin {
  public readonly name = "ProofGate";
  public readonly ruleIds = ["PG-IAM-003", "PG-IAM-004"];
  public readonly version = "0.1.0";
  private readonly leanDirectory: string;

  public constructor(private readonly props: ProofGateValidatorProps) {
    this.leanDirectory = props.leanDirectory ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../lean");
  }

  public validate(context: IPolicyValidationContext): PolicyValidationPluginReport {
    const violations: PolicyViolationBeta1[] = [];
    if (!Array.isArray(this.props.protectedBucketArns) || this.props.protectedBucketArns.length === 0 || this.props.protectedBucketArns.some((arn) => typeof arn !== "string" || arn.trim().length === 0)) {
      const templatePath = context.templatePaths[0] ?? "proofgate.config.json";
      violations.push({
        ruleName: "PG-IAM-003",
        description: "ProofGate requires at least one non-empty protected S3 bucket ARN; refusing a vacuous proof.",
        fix: "Configure protectedBucketArns with every S3 bucket that must be protected.",
        violatingResources: [{ resourceLogicalId: "ProofGateConfiguration", templatePath, locations: ["ProofGateConfig.protectedBucketArns"] }],
      });
      return { success: false, violations };
    }
    for (const templatePath of context.templatePaths) {
      let template: unknown;
      try {
        template = JSON.parse(readFileSync(templatePath, "utf8")) as unknown;
      } catch (error) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `CloudFormation template could not be read or parsed: ${error instanceof Error ? error.message : String(error)}`,
          fix: "Regenerate the CDK assembly and rerun ProofGate.",
          violatingResources: [{ resourceLogicalId: "ProofGateTemplate", templatePath, locations: ["$"] }],
        });
        continue;
      }
      const extraction = extractStack(template);
      for (const finding of extraction.unsupported) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Unsupported IAM syntax: ${finding.reason}`,
          fix: "Replace the unsupported IAM construct with literal Action/Resource values, or extend ProofGate before deployment.",
          violatingResources: [{ resourceLogicalId: logicalIdFromPath(finding.sourcePath), templatePath, locations: [finding.sourcePath] }],
        });
      }
      if (!extraction.model) continue;

      const findings = evaluate(extraction.model, this.props);
      const leanSource = generateLean(extraction.model, this.props);
      const leanResult = this.runLean(leanSource);
      if (leanResult.status === "error") {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Lean verification failed to execute: ${leanResult.diagnostic}`,
          fix: "Install the pinned Lean toolchain and run pnpm lean:build before synthesis.",
          violatingResources: [{ resourceLogicalId: "ProofGateModel", templatePath, locations: ["Resources"] }],
        });
        continue;
      }
      const leanAccepted = leanResult.status === "accepted";
      if ((findings.length === 0) !== leanAccepted) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: "TypeScript and Lean validation results disagree; validation fails closed.",
          fix: "Report the model and generated Lean module to ProofGate maintainers.",
          violatingResources: [{ resourceLogicalId: "ProofGateModel", templatePath, locations: ["Resources"] }],
        });
        continue;
      }
      for (const finding of findings) {
        violations.push({
          ruleName: finding.ruleId,
          description: finding.explanation,
          fix: `Remove iam:PassRole or Lambda code/configuration control from ${finding.principalLogicalId}, remove Lambda trust from ${finding.targetRoleLogicalId}, or prevent that role from accessing the protected bucket.`,
          violatingResources: [{ resourceLogicalId: finding.principalLogicalId, templatePath, locations: [...finding.sourcePaths] }],
        });
      }
    }
    return { success: violations.length === 0, violations };
  }

  private runLean(source: string): LeanResult {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-"));
    const generated = join(directory, "Generated.lean");
    writeFileSync(generated, source, "utf8");
    try {
      const result = spawnSync("lake", ["env", "lean", generated], { cwd: this.leanDirectory, encoding: "utf8" });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      if (result.status === 0 && output.includes("PROOFGATE_SAFE")) return { status: "accepted" };
      if (result.status !== 0 && output.includes("PROOFGATE_UNSAFE")) return { status: "rejected" };
      const diagnostic = result.error?.message ?? (output.trim().split("\n").slice(-4).join(" ") || `Lean exited with status ${String(result.status)}`);
      return { status: "error", diagnostic: diagnostic.slice(0, 500) };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

function logicalIdFromPath(path: string): string {
  const match = /^Resources\.([^.]+)/.exec(path);
  return match?.[1] ?? "ProofGateModel";
}
