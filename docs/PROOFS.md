# 証明

`ProofGate.Security`は、次の4つの真偽値を持つ`EscalationPath`を定義します。説明用に、起動サービスの名前`service`も持ちます（判定には使いません）。1.1.2までの`canControlLambda`と`targetIsLambdaAssumable`は、起動サービスを一般化した名前に変わりました。

- `canPassRole`
- `canLaunch`（以前の`canControlLambda`）
- `targetTrustsService`（以前の`targetIsLambdaAssumable`）
- `targetCanAccess`

English: `EscalationPath` has four Booleans and a `service` string used only for explanation. `canControlLambda` and `targetIsLambdaAssumable` were renamed `canLaunch` and `targetTrustsService` when the path was generalized to every launch service. Lean still checks four facts that TypeScript computes.

`isEscalation`は4つの値の論理積です。`safe`はすべての候補経路を検査し、すべての`isEscalation`がfalseの場合にのみtrueを返します。生成する定理は次の形式です。

```lean
theorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by
  native_decide
```

危険なスタックでは命題が`false = true`へ簡約されるため、Leanは定理の構築を拒否します。リポジトリに含まれるLeanコアは、`sorry`やプロジェクト独自の公理を使用しません。空虚な証明を防ぐため、IAMロールが存在しないテンプレートや、対応するPolicy Statementが存在しないテンプレートは、証明生成前にExtractorが拒否します。

この定理が証明するのは、生成された有限モデルの性質です。ExtractorやGenerator自体の正しさを証明するものではなく、AWS IAMの意味論全体をモデル化するものでもありません。

## PassRoleの要らない経路（`ImplicitPath`）

`iam:PassRole`の要らない経路には、別の構造`ImplicitPath`を使います。PassRoleのない経路に`canPassRole := true`と書くのは事実と違うためです。持つ真偽値は、`canChange`（主体が、リソースを変更する表のアクションを、そのリソースに対して持つ）、`runsAsTarget`（リソースが対象ロールで動く。候補はロールを特定できたリソースだけなので常にtrue）、`targetCanAccess`の3つです。`isImplicitEscalation`は3つの論理積、`safeImplicit`はすべての候補が安全のときだけtrueです。`generateLean`は、`generatedImplicit`（モデルにリソースがなければ空）を出力し、`#eval`は`safe generatedPaths && safeImplicit generatedImplicit`を調べます。定理は、`generatedStackIsSafe`（既存）と`generatedImplicitIsSafe`の2つです。これまでと同じく、Leanが検査するのは、TypeScriptが計算した真偽値です。`sorry`とプロジェクト独自の`axiom`は使いません。

English: paths without `iam:PassRole` use a second structure `ImplicitPath` with three Booleans (`canChange`, `runsAsTarget`, `targetCanAccess`), so that no field says `canPassRole := true` for a path that has no PassRole. `isImplicitEscalation` is their conjunction and `safeImplicit` holds only if every candidate is safe. `generateLean` emits `generatedImplicit` (empty if the model has no resources); the `#eval` checks `safe generatedPaths && safeImplicit generatedImplicit`, and there are two theorems, `generatedStackIsSafe` (unchanged) and `generatedImplicitIsSafe`. Lean still checks Booleans that TypeScript computes. No `sorry`, no project `axiom`.

## ロール自身がIAMを書き換える経路（`PolicyWritePath`、`PG-IAM-005`）

spec `proofgate-self-escalation`の経路には、3つ目の構造`PolicyWritePath`を使います。形は3つです。自分のロールへのポリシーの付与（`iam:PutRolePolicy`、`iam:AttachRolePolicy`）、別のロールの信頼ポリシーの書き換え（`iam:UpdateAssumeRolePolicy`、乗っ取り）、ロールを作ってポリシーを付ける組（`iam:CreateRole`と付与のアクション、作成して付与）です。形の名前`shape`は説明用で、判定には使いません。

持つ真偽値は次の3つです。

- `canWrite`: 主体が、その形のアクションを、対象を表しうるResourceに対して持つ
- `reachesAfterWrite`: 書き換えの後に保護バケットに届く。自分への付与と作成して付与では、任意の権限を付けられるため常にtrue。乗っ取りでは、対象ロールが今バケットに届くとき
- `notExempt`: 主体が`allowedPolicyWriters`になく、乗っ取りでは対象ロールが`allowedPassRoleTargets`にもない

除外された候補も`notExempt := false`の行として出力するため、除外の扱いもLeanが検査します。`isPolicyWriteEscalation`は3つの論理積、`safePolicyWrite`はすべての候補が安全のときだけtrueです。`generateLean`は`generatedPolicyWrite`を出力し、`#eval`は3つの一覧をすべて調べます。定理は`generatedStackIsSafe`、`generatedImplicitIsSafe`、`generatedPolicyWriteIsSafe`の3つです。Leanのコアには、`completePolicyWriteEscalationIsUnsafe`（3つともtrueの行が1つあれば安全ではない）と`exemptPolicyWriteIsSafe`（`notExempt := false`の行は安全）もあります。これまでと同じく、Leanが検査するのは、TypeScriptが計算した真偽値です。ResourceがロールのARNを表しうるかの判定はTypeScriptの側にあり、Leanはそれを検査しません。`sorry`とプロジェクト独自の`axiom`は使いません。

English: the paths of spec `proofgate-self-escalation` (`PG-IAM-005`) use a third structure `PolicyWritePath`. Its three shapes are a self-grant (`iam:PutRolePolicy` or `iam:AttachRolePolicy` on the own role), a take-over (`iam:UpdateAssumeRolePolicy` on another role), and a creation grant (`iam:CreateRole` with a grant action); `shape` is for explanation only. The three Booleans are `canWrite` (the principal holds an action of the shape on a Resource that may denote the target), `reachesAfterWrite` (always true for a self-grant and a creation grant, which can grant any permission; for a take-over, the target role reaches the bucket today), and `notExempt` (the principal is not in `allowedPolicyWriters`, and for a take-over the target is not in `allowedPassRoleTargets`). Exempt candidates are emitted as rows with `notExempt := false`, so Lean checks the exemption too. `isPolicyWriteEscalation` is the conjunction and `safePolicyWrite` holds only if every candidate is safe. `generateLean` emits `generatedPolicyWrite`; the `#eval` checks all three lists, and there are three theorems, `generatedStackIsSafe`, `generatedImplicitIsSafe`, and `generatedPolicyWriteIsSafe`. The core also proves `completePolicyWriteEscalationIsUnsafe` and `exemptPolicyWriteIsSafe`. Lean still checks Booleans that TypeScript computes; whether a Resource may denote a role ARN is decided in TypeScript and is not checked by Lean. No `sorry`, no project `axiom`.
