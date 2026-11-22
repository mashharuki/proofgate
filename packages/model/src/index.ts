/** 権限昇格経路を検出するルールの安定した識別子です。 */
export const RULE_ID = "PG-IAM-004" as const;

/** CloudFormationのPolicy Statementを、出典付きで正規化した表現です。 */
export interface StatementModel {
  readonly effect: "Allow" | "Deny";
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly sourcePath: string;
}

/** IAMロールの信頼先と、ロールへ付与された権限をまとめた表現です。 */
export interface RoleModel {
  readonly logicalId: string;
  readonly roleName?: string;
  readonly trustServices: readonly string[];
  readonly statements: readonly StatementModel[];
}

/** ロールで動く既存のリソースの種類です（spec proofgate-implicit-role-paths）。 */
export type ResourceKind = "lambda-function" | "codebuild-project" | "stepfunctions-state-machine";
/**
 * ロールを持つリソースです。主体がこのリソースを変更できると、`iam:PassRole`なしでそのロールの権限でコードを動かせます。
 * A resource that runs as a role. A principal that can change it can run code as that role without `iam:PassRole`.
 */
export interface ResourceModel {
  readonly logicalId: string;
  readonly kind: ResourceKind;
  /** テンプレートがリテラルで付けた物理名です。なければ、不透明な名前`_generated_<LogicalId>`として読みます。 */
  readonly name?: string;
  /** 物理名がintrinsicで、値を読めないときtrueです。どのResourceパターンも一致しうるものとして扱います（過剰検出の側）。 */
  readonly nameUnknown?: boolean;
  /** このリソースが引き受けるロール（同じテンプレート内）のLogical IDです。 */
  readonly roleLogicalId?: string;
  /** ロールを特定できないときtrueです（パラメータ、インポート、テンプレートにないロールなど）。このとき`roleLogicalId`はありません。 */
  readonly roleUnknown?: boolean;
  readonly sourcePath: string;
}
/** TypeScriptとLeanの間で受け渡す、CDKに依存しないスタックモデルです。 */
export interface StackModel {
  readonly version: "1";
  readonly roles: readonly RoleModel[];
  /** ロールで動くリソースです。なければ空として読みます。 */
  readonly resources?: readonly ResourceModel[];
}

/** アプリケーションごとに指定するProofGateの安全条件です。 */
export interface ProofGateConfig {
  /** 権限昇格経路から保護するS3バケットARNです。空配列はFail Closedで拒否します。 */
  readonly protectedBucketArns: readonly string[];
  /** 明示的に許可するPassRole先のLogical IDです。 */
  readonly allowedPassRoleTargets?: readonly string[];
}

/** PG-IAM-004で検出した経路と、診断表示に必要な根拠です。 */
export interface Violation {
  readonly ruleId: typeof RULE_ID;
  readonly principalLogicalId: string;
  readonly targetRoleLogicalId: string;
  readonly protectedBucketArn: string;
  readonly sourcePaths: readonly string[];
  readonly explanation: string;
  /**
   * `iam:PassRole`の要らない経路のとき、変更できるリソースのLogical IDです。PassRoleの経路にはありません。
   * Set for a path without `iam:PassRole`: the Logical ID of the resource that the principal can change.
   */
  readonly resourceLogicalId?: string;
}

/** 現在の有限モデルへ安全に変換できなかったCloudFormation構文です。 */
export interface UnsupportedFinding {
  readonly sourcePath: string;
  readonly reason: string;
}

/** 抽出結果です。未対応構文が1つでもあればmodelは返しません。 */
export interface ExtractionResult {
  readonly model?: StackModel;
  readonly unsupported: readonly UnsupportedFinding[];
}
