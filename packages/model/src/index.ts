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

/** TypeScriptとLeanの間で受け渡す、CDKに依存しないスタックモデルです。 */
export interface StackModel {
  readonly version: "1";
  readonly roles: readonly RoleModel[];
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
