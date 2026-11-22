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
