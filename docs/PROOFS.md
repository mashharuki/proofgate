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
