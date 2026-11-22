/**
 * IAMを書き換えて権限を得る経路（自己昇格）の、アクションの表です（spec proofgate-self-escalation, 設計3）。手書きです。
 * 項目は、AWSのドキュメントを読んで確認したものだけです（出典と日付は`.kiro/specs/proofgate-self-escalation/data-verification.md`）。
 * 4つとも、AWS Service Referenceでは、リソース型が`role`（`arn:${Partition}:iam::${Account}:role/${RoleNameWithPath}`）です。
 *
 * Hand-written table of the actions of paths in which a role changes IAM itself. Only actions whose documentation was read are
 * listed; the evidence is in `data-verification.md` of the spec. All four are authorized on the `role` resource type.
 */
export type PolicyWriteShape = "self-grant" | "take-over" | "creating";
export interface PolicyWriteAction {
  /** 小文字のアクション名です。 */
  readonly action: string;
  /**
   * self-grant: 自分のロールに権限を書く。take-over: 信頼ポリシーを書き換える。
   * creating: ロールを作る（書き込みのアクションと組み合わせて、作成して付与になる）。
   */
  readonly shape: PolicyWriteShape;
  readonly source: string;
  readonly checked: string;
}
export const POLICY_WRITE_ACTIONS: readonly PolicyWriteAction[] = [
  {
    action: "iam:putrolepolicy",
    shape: "self-grant",
    source: "https://docs.aws.amazon.com/IAM/latest/APIReference/API_PutRolePolicy.html",
    checked: "2026-11-22",
  },
  {
    action: "iam:attachrolepolicy",
    shape: "self-grant",
    source: "https://docs.aws.amazon.com/IAM/latest/APIReference/API_AttachRolePolicy.html",
    checked: "2026-11-22",
  },
  {
    action: "iam:updateassumerolepolicy",
    shape: "take-over",
    source: "https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAssumeRolePolicy.html",
    checked: "2026-11-22",
  },
  {
    action: "iam:createrole",
    shape: "creating",
    source: "https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateRole.html",
    checked: "2026-11-22",
  },
];
