import type { ResourceKind } from "@proofgate-cdk/model";
/**
 * ロールで動くリソースの表です（spec proofgate-implicit-role-paths, 設計3）。
 * 型を足すときは、この表に1項目を足し、テストを書きます。
 * Role-bearing resource types. Adding a type is one entry here plus tests.
 */
export interface RoleBearingType {
  readonly kind: ResourceKind;
  /** 物理名のプロパティです。 */
  readonly nameProperty: string;
  /** ロールのARNを持つプロパティです。 */
  readonly roleProperty: string;
  /** リソースのARNのパターンです（パーティションを渡します）。 */
  readonly arn: (partition: string, name: string) => string;
  /** `Ref`が返すのが名前か、ARNか。 */
  readonly ref: "name" | "arn";
}
export const ROLE_BEARING: Readonly<Record<string, RoleBearingType>> = {
  "AWS::Lambda::Function": {
    kind: "lambda-function",
    nameProperty: "FunctionName",
    roleProperty: "Role",
    arn: (partition, name) => `arn:${partition}:lambda:*:*:function:${name}`,
    ref: "name",
  },
  "AWS::CodeBuild::Project": {
    kind: "codebuild-project",
    nameProperty: "Name",
    roleProperty: "ServiceRole",
    arn: (partition, name) => `arn:${partition}:codebuild:*:*:project/${name}`,
    ref: "name",
  },
  "AWS::StepFunctions::StateMachine": {
    kind: "stepfunctions-state-machine",
    nameProperty: "StateMachineName",
    roleProperty: "RoleArn",
    arn: (partition, name) => `arn:${partition}:states:*:*:stateMachine:${name}`,
    ref: "arn",
  },
};
