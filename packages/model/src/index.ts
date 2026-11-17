export const RULE_ID = "PG-IAM-004" as const;

export interface StatementModel {
  readonly effect: "Allow" | "Deny";
  readonly actions: readonly string[];
  readonly resources: readonly string[];
  readonly sourcePath: string;
}

export interface RoleModel {
  readonly logicalId: string;
  readonly roleName?: string;
  readonly trustServices: readonly string[];
  readonly statements: readonly StatementModel[];
}

export interface StackModel {
  readonly version: "1";
  readonly roles: readonly RoleModel[];
}

export interface ProofGateConfig {
  readonly protectedBucketArns: readonly string[];
  readonly allowedPassRoleTargets?: readonly string[];
}

export interface Violation {
  readonly ruleId: typeof RULE_ID;
  readonly principalLogicalId: string;
  readonly targetRoleLogicalId: string;
  readonly protectedBucketArn: string;
  readonly sourcePaths: readonly string[];
  readonly explanation: string;
}

export interface UnsupportedFinding {
  readonly sourcePath: string;
  readonly reason: string;
}

export interface ExtractionResult {
  readonly model?: StackModel;
  readonly unsupported: readonly UnsupportedFinding[];
}
