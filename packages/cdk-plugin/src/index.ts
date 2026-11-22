import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  evaluate,
  generateLean,
  unknownRoleFindings,
  unknownTrustFindings,
} from "@proofgate-cdk/core";
import { extractStack } from "@proofgate-cdk/extractor";
import type { ProofGateConfig } from "@proofgate-cdk/model";
import type {
  IPolicyValidationContext,
  IPolicyValidationPlugin,
  PolicyValidationPluginReport,
  PolicyViolationBeta1,
} from "aws-cdk-lib";

/**
 * 未対応構文の理由に付ける、短いヒントです（spec proofgate-real-stack-validation, Task 12）。
 * 文を足すだけで、理由の文と、受理・拒否の判定は変えません。ヒントは固定の区切りの後に置きます。
 * 句点のない文（descriptionの理由）には". Hint: "、句点で終わる文（fix）には" Hint: "でつなぎます。
 * The separator is ". Hint: " after a text without a final period (the reason), and " Hint: " after a sentence.
 * Short hints for unsupported-syntax reasons. Additive only; the reason text and the verdict do not change.
 * The order matters: the first entry whose key is contained in the reason wins.
 */
const HINTS: readonly (readonly [string, string])[] = [
  [
    "Managed policies",
    "ProofGate reads only the AWS managed policies AWSLambdaBasicExecutionRole, AWSLambdaVPCAccessExecutionRole, and AmazonAPIGatewayPushToCloudWatchLogs. Other managed policies cannot be checked yet.",
  ],
  [
    "must be literal strings",
    "ProofGate reads a Resource written as a literal, Fn::Join, Fn::Sub without a variable map, the pseudo-parameters AWS::Partition, AWS::Region, AWS::AccountId, and AWS::URLSuffix, or Ref and Fn::GetAtt of a resource in the same template. Parameters, Fn::Sub with a variable map, Fn::ImportValue, Fn::If, and other functions are not read. Action must be literal.",
  ],
  [
    "IAM policy variables",
    "IAM policy variables are not evaluated. Write the resource without the variable.",
  ],
];
/** 権限Statementの`Condition`だけに付けるヒントです（信頼ポリシーの理由は別の文です）。 */
const PERMISSION_CONDITION = "Condition is not supported";
function withHint(text: string, reason: string): string {
  const hint =
    reason === PERMISSION_CONDITION
      ? "A Condition on a permission statement is not evaluated, so ProofGate cannot tell when the statement applies."
      : HINTS.find(([key]) => reason.includes(key))?.[1];
  if (hint === undefined) return text;
  return `${text}${text.endsWith(".") ? "" : "."} Hint: ${hint}`;
}

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
  public readonly version = "1.1.2";
  private readonly leanDirectory: string;
  // undefinedは未実行、nullは成功、文字列は失敗診断を表します。同じsynth中の再ビルドを避けます。
  private leanBuildError: string | null | undefined;

  /**
   * コンストラクター
   * @param props
   */
  public constructor(private readonly props: ProofGateValidatorProps) {
    this.leanDirectory =
      props.leanDirectory ?? resolve(dirname(fileURLToPath(import.meta.url)), "../lean");
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
          description: withHint(`Unsupported IAM syntax: ${finding.reason}`, finding.reason),
          fix: withHint(
            "Replace the unsupported IAM construct with literal Action/Resource values, or extend ProofGate before deployment.",
            finding.reason,
          ),
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
      // IAMリソースのないテンプレートは、検査するプリンシパルがないため、評価もLeanも実行せず、何も報告しません。
      // 中身が空の証明を「証明済み」として扱わないためです（spec proofgate-brushup, 要件3）。
      // No IAM resource: there is no principal to check, so neither the evaluator nor Lean runs and nothing is reported.
      if (extraction.model.roles.length === 0) continue;

      // 渡せて保護バケットに届くロールが、起動アクションの表にないサービスを信頼しているときは、PG-IAM-003にします（design 5.4）。
      // A passable, bucket-reaching role that trusts a service not in the launch table is reported as PG-IAM-003.
      for (const finding of unknownTrustFindings(extraction.model, this.props)) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Unsupported IAM syntax: ${finding.reason}`,
          fix: "Check whether this service can run code with the role, remove iam:PassRole for the role, or prevent the role from accessing the protected bucket.",
          violatingResources: [
            {
              resourceLogicalId: logicalIdFromPath(finding.sourcePath),
              templatePath,
              locations: [finding.sourcePath],
            },
          ],
        });
      }
      // ロールを特定できないリソースを、主体が変更できるときは、PG-IAM-003にします（spec proofgate-implicit-role-paths, 設計6）。
      // A resource whose role cannot be identified, and that a principal can change, is reported as PG-IAM-003.
      for (const finding of unknownRoleFindings(extraction.model, this.props)) {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Unsupported IAM syntax: ${finding.reason}`,
          fix: "Give the resource a role of the same template (Fn::GetAtt of its Arn), or remove the permission to change it from every principal.",
          violatingResources: [
            {
              resourceLogicalId: logicalIdFromPath(finding.sourcePath),
              templatePath,
              locations: [finding.sourcePath],
            },
          ],
        });
      }
      const findings = evaluate(extraction.model, this.props);
      const leanSource = generateLean(extraction.model, this.props);
      const leanResult = this.runLean(leanSource);
      // ツールチェーン障害は、危険なモデルをLeanが正しく拒否した結果とは別に扱います。
      if (leanResult.status === "error") {
        violations.push({
          ruleName: "PG-IAM-003",
          description: `Lean verification failed to execute: ${leanResult.diagnostic}`,
          fix: "Install elan and the Lean toolchain pinned by the packaged lean/lean-toolchain file.",
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
          fix:
            finding.resourceLogicalId === undefined
              ? `Remove iam:PassRole or the launch action from ${finding.principalLogicalId}, remove the service from the trust policy of ${finding.targetRoleLogicalId}, or prevent that role from accessing the protected bucket.`
              : `Remove the permission to change ${finding.resourceLogicalId} from ${finding.principalLogicalId}, scope it to resources whose role cannot reach the protected bucket, prevent ${finding.targetRoleLogicalId} from accessing the protected bucket, or list ${finding.targetRoleLogicalId} in allowedPassRoleTargets if the team accepts it.`,
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
    const buildError = this.prepareLean();
    if (buildError !== null) return { status: "error", diagnostic: buildError };

    const directory = mkdtempSync(join(tmpdir(), "proofgate-"));
    const generated = join(directory, "Generated.lean");
    writeFileSync(generated, source, "utf8");
    try {
      let result = spawnSync("lake", ["env", "lean", generated], {
        cwd: this.leanDirectory,
        encoding: "utf8",
      });
      let output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      // 異なるLeanバージョンの成果物が残っている場合だけ、安全に生成キャッシュを作り直します。
      if (result.status !== 0 && output.includes("incompatible header")) {
        const rebuildError = this.rebuildLean();
        if (rebuildError !== null) return { status: "error", diagnostic: rebuildError };
        result = spawnSync("lake", ["env", "lean", generated], {
          cwd: this.leanDirectory,
          encoding: "utf8",
        });
        output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
      }
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

  /**
   * 同梱したLeanソースを固定ツールチェーンでビルドします。
   * 古い`.olean`が残っていてもLakeが再生成するため、Lean更新後のヘッダー不一致を防げます。
   */
  private prepareLean(): string | null {
    if (this.leanBuildError !== undefined) return this.leanBuildError;

    let result = spawnSync("lake", ["build"], {
      cwd: this.leanDirectory,
      encoding: "utf8",
    });
    let output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (result.status !== 0 && output.includes("incompatible header")) {
      rmSync(join(this.leanDirectory, ".lake", "build"), { recursive: true, force: true });
      result = spawnSync("lake", ["build"], {
        cwd: this.leanDirectory,
        encoding: "utf8",
      });
      output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    }
    if (result.status === 0) {
      this.leanBuildError = null;
      return null;
    }

    const diagnostic =
      result.error?.message ??
      (output.trim().split("\n").slice(-4).join(" ") ||
        `Lake exited with status ${String(result.status)}`);
    this.leanBuildError = `Lean project build failed: ${diagnostic.slice(0, 500)}`;
    return this.leanBuildError;
  }

  /** Leanのバージョン不一致時だけ生成物を捨て、同梱ソースから作り直します。 */
  private rebuildLean(): string | null {
    rmSync(join(this.leanDirectory, ".lake", "build"), { recursive: true, force: true });
    this.leanBuildError = undefined;
    return this.prepareLean();
  }
}

/**
 * `Resources.<LogicalId>...`というJSON pathから、CDKレポート用のLogical IDを復元します。
 */
function logicalIdFromPath(path: string): string {
  const match = /^Resources\.([^.]+)/.exec(path);
  return match?.[1] ?? "ProofGateModel";
}
