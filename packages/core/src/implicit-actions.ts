/**
 * `iam:PassRole`の要らない経路の、起動アクションの表です（spec proofgate-implicit-role-paths, 設計4）。手書きです。
 * 主体がこのアクションでリソースを変えられると、そのリソースがすでに引き受けているロールの権限で、呼び出し側が選んだコードが動きます。
 * 項目は、AWSのドキュメントを読んで確認したものだけです（出典と日付は`.kiro/specs/proofgate-implicit-role-paths/data-verification.md`）。
 * 動かす2つ目の操作（呼び出し、トリガー、`StartExecution`）は要求しません。指摘が増える方向の読み方です。
 *
 * Hand-written table of the actions that change an existing resource that already runs as a role, so that code chosen by
 * the caller runs as that role without `iam:PassRole`. Only actions whose documentation was read are listed; the evidence
 * is in `data-verification.md` of the spec. The second operation that runs the new code is not required (over-approximation).
 */
export type ImplicitKind = "lambda-function" | "codebuild-project" | "stepfunctions-state-machine";
export interface ImplicitAction {
  /** 小文字のアクション名です。 */
  readonly action: string;
  readonly kind: ImplicitKind;
  /** 呼び出し側が選ぶものです。 */
  readonly behavior: string;
  readonly source: string;
  readonly checked: string;
}
export const IMPLICIT_ACTIONS: readonly ImplicitAction[] = [
  {
    action: "lambda:updatefunctioncode",
    kind: "lambda-function",
    behavior: "the code package that runs as the execution role",
    source: "https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionCode.html",
    checked: "2026-11-22",
  },
  {
    action: "lambda:updatefunctionconfiguration",
    kind: "lambda-function",
    behavior: "layers and ImageConfig, which run code in the function",
    source: "https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionConfiguration.html",
    checked: "2026-11-21",
  },
  {
    action: "codebuild:startbuild",
    kind: "codebuild-project",
    behavior: "buildspecOverride",
    source: "https://docs.aws.amazon.com/codebuild/latest/APIReference/API_StartBuild.html",
    checked: "2026-11-22",
  },
  {
    action: "codebuild:startbuildbatch",
    kind: "codebuild-project",
    behavior: "buildspecOverride",
    source: "https://docs.aws.amazon.com/codebuild/latest/APIReference/API_StartBuildBatch.html",
    checked: "2026-11-22",
  },
  {
    action: "states:updatestatemachine",
    kind: "stepfunctions-state-machine",
    behavior: "definition without roleArn",
    source:
      "https://docs.aws.amazon.com/step-functions/latest/apireference/API_UpdateStateMachine.html",
    checked: "2026-11-22",
  },
];
