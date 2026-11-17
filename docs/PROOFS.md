# 証明

`ProofGate.Security`は、次の4つの真偽値を持つ`EscalationPath`を定義します。

- `canPassRole`
- `canControlLambda`
- `targetIsLambdaAssumable`
- `targetCanAccess`

`isEscalation`は4つの値の論理積です。`safe`はすべての候補経路を検査し、すべての`isEscalation`がfalseの場合にのみtrueを返します。生成する定理は次の形式です。

```lean
theorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by
  native_decide
```

危険なスタックでは命題が`false = true`へ簡約されるため、Leanは定理の構築を拒否します。リポジトリに含まれるLeanコアは、`sorry`やプロジェクト独自の公理を使用しません。空虚な証明を防ぐため、IAMロールが存在しないテンプレートや、対応するPolicy Statementが存在しないテンプレートは、証明生成前にExtractorが拒否します。

この定理が証明するのは、生成された有限モデルの性質です。ExtractorやGenerator自体の正しさを証明するものではなく、AWS IAMの意味論全体をモデル化するものでもありません。
