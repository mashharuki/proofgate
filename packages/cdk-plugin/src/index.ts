import { evaluate, generateLean } from "@proofgate/core";
import { extractStack } from "@proofgate/extractor";
import type { ProofGateConfig } from "@proofgate/model";
import type {
  IPolicyValidationContext,
  IPolicyValidationPlugin,
  PolicyValidationPluginReport,
  PolicyViolationBeta1,
} from "aws-cdk-lib";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** CDKプラグインの設定です。leanDirectoryはテストや特殊な配置でだけ上書きします。 */
export interface ProofGateValidatorProps extends ProofGateConfig {
  readonly leanDirectory?: string;
}

// 危険な定理の拒否と、Leanプロセス自体の障害を混同しないための内部結果です。
type LeanResult =
  | { readonly status: "accepted" }
  | { readonly status: "rejected" }
  | { readonly status: "error"; readonly diagnostic: string };

/** 
 * 合成済みCloudFormationを検査し、CDK標準のValidation Reportを返します。
 */
export class ProofGateValidator implements IPolicyValidationPlugin {
  /** プラグイン名、ルールID、バージョンはCDKレポートに表示されます。 */
  public readonly name = "ProofGate";
  public readonly ruleIds = ["PG-IAM-003", "PG-IAM-004"];
  public readonly version = "0.1.0";
  private readonly leanDirectory: string;

  /**
   * コンストラクター
   * @param props 
   */
  public constructor(private readonly props: ProofGateValidatorProps) {
    this.leanDirectory =
      props.leanDirectory ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../lean");
  }

  /**
   * 検証メソッド
   * @param context 
   * @returns 
   */
  public validate(context: IPolicyValidationContext): PolicyValidationPluginReport {
    const violations: PolicyViolationBeta1[] = [];
    // 保護対象が空だと証明が自明に成立するため、テンプレートを読む前に設定を拒否します。
    if (
      !Array.isArray(this.props.protectedBucketArns) ||
      this.props.protectedBucketArns.length === 0 ||
      this.props.protectedBucketArns.some(
        (arn) => typeof arn !== "string" || arn.trim().length === 0,
      )
    ) {
      const templatePath = context.templatePaths[0] ?? "proofgate.config.json";
      violations.push({
        ruleName: "PG-IAM-003",
        description:
          "ProofGate requires at least one non-empty protected S3 bucket ARN; refusing a vacuous proof.",
        fix: "Configure protectedBucketArns with every S3 bucket that must be protected.",
        violatingResources: [
          {
            resourceLogicalId: "ProofGateConfiguration",
            templatePath,
            locations: ["ProofGateConfig.protectedBucketArns"],
          },
        ],
      });
      return { success: false, violations };
    }
    
    for (const templatePath of context.templatePaths) {
      let template: unknown;
      // CDK assemblyが壊れている場合も例外で終了せず、PG-IAM-003として報告します。
      try {
        template = JSON.parse(readFileSync(templatePath, "utf8")) as unknown;
      } catch (error) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `CloudFormation template could not be read or parsed: ${error instanceof Error ? error.message : String(error)}`,
          fix: "Regenerate the CDK assembly and rerun ProofGate.",
          violatingResources: [
            { resourceLogicalId: "ProofGateTemplate", templatePath, locations: ["$"] },
          ],
        });
        continue;
      }
      const extraction = extractStack(template);
      // 未対応構文は安全扱いせず、元のJSON pathをCDKレポートへ残します。
      for (const finding of extraction.unsupported) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Unsupported IAM syntax: ${finding.reason}`,
          fix: "Replace the unsupported IAM construct with literal Action/Resource values, or extend ProofGate before deployment.",
          violatingResources: [
            {
              resourceLogicalId: logicalIdFromPath(finding.sourcePath),
              templatePath,
              locations: [finding.sourcePath],
            },
          ],
        });
      }
      if (!extraction.model) continue;

      const findings = evaluate(extraction.model, this.props);
      const leanSource = generateLean(extraction.model, this.props);
      const leanResult = this.runLean(leanSource);
      // ツールチェーン障害は、危険なモデルをLeanが正しく拒否した結果とは別に扱います。
      if (leanResult.status === "error") {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Lean verification failed to execute: ${leanResult.diagnostic}`,
          fix: "Install the pinned Lean toolchain and run pnpm lean:build before synthesis.",
          violatingResources: [
            { resourceLogicalId: "ProofGateModel", templatePath, locations: ["Resources"] },
          ],
        });
        continue;
      }
      const leanAccepted = leanResult.status === "accepted";
      // TypeScriptとLeanが不一致なら、どちらか一方を信用せずFail Closedにします。
      if ((findings.length === 0) !== leanAccepted) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: "TypeScript and Lean validation results disagree; validation fails closed.",
          fix: "Report the model and generated Lean module to ProofGate maintainers.",
          violatingResources: [
            { resourceLogicalId: "ProofGateModel", templatePath, locations: ["Resources"] },
          ],
        });
        continue;
      }
      for (const finding of findings) {
        violations.push({
          ruleName: finding.ruleId,
          description: finding.explanation,
          fix: `Remove iam:PassRole or Lambda code/configuration control from ${finding.principalLogicalId}, remove Lambda trust from ${finding.targetRoleLogicalId}, or prevent that role from accessing the protected bucket.`,
          violatingResources: [
            {
              resourceLogicalId: finding.principalLogicalId,
              templatePath,
              locations: [...finding.sourcePaths],
            },
          ],
        });
      }
    }
    return { success: violations.length === 0, violations };
  }

  /** 
   * 一時ファイルとして生成コードを検査し、終了時には成功・失敗にかかわらず削除します。
   */
  private runLean(source: string): LeanResult {
    const directory = mkdtempSync(join(tmpdir(), "proofgate-"));
    const generated = join(directory, "Generated.lean");
    writeFileSync(generated, source, "utf8");
    try {
      const result = spawnSync("lake", ["env", "lean", generated], {
        cwd: this.leanDirectory,
        encoding: "utf8",
      });
      const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      // 生成コードの明示的なマーカーがある場合だけ、定理の受理・拒否として扱います。
      if (result.status === 0 && output.includes("PROOFGATE_SAFE")) return { status: "accepted" };
      if (result.status !== 0 && output.includes("PROOFGATE_UNSAFE")) return { status: "rejected" };
      const diagnostic =
        result.error?.message ??
        (output.trim().split("\n").slice(-4).join(" ") ||
          `Lean exited with status ${String(result.status)}`);
      return { status: "error", diagnostic: diagnostic.slice(0, 500) };
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  }
}

/** 
 * `Resources.<LogicalId>...`というJSON pathから、CDKレポート用のLogical IDを復元します。
 */
function logicalIdFromPath(path: string): string {
  const match = /^Resources\.([^.]+)/.exec(path);
  return match?.[1] ?? "ProofGateModel";
}
