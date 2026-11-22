import ProofGate.Model

namespace ProofGate

/-!
# 権限昇格経路の安全判定

`EscalationPath`の有限リストを対象に、保護対象リソースへ到達できる
完全な権限昇格経路が存在しないことを判定します。
-/

/--
候補経路が実際の権限昇格経路になるための4条件を検査します。

1. 対象ロールを渡せる
2. 起動サービスへロールを渡す起動アクションを持つ（Lambdaでは、関数の作成または設定の更新）
3. 対象ロールをその起動サービスが引き受けられる
4. 対象ロールが保護対象リソースへアクセスできる
The four conditions: the role can be passed, the principal can launch the service with it,
the target trusts that service, and the target can access the protected resource.

4条件がすべてtrueの場合だけ、危険な経路と判定します。
-/
def isEscalation (path : EscalationPath) : Bool :=
  path.canPassRole && path.canLaunch && path.targetTrustsService && path.targetCanAccess

/--
候補経路をすべて調べ、危険な経路が1つも存在しない場合にtrueを返します。
生成コードでは、この結果がtrueであることを`native_decide`で検査します。
-/
def safe (paths : List EscalationPath) : Bool :=
  paths.all fun path => !(isEscalation path)

/--
空リストに対するBoolean関数の基本性質です。
これは空のCloudFormationを安全と認めるという意味ではありません。
実際の検証では、ExtractorがロールやPolicy Statementのない入力を先に拒否し、
空虚な証明が生成されないようにします。
-/
theorem emptyModelIsSafeAtBooleanLevel : safe [] = true := by
  native_decide

/--
4条件をすべて満たす経路が1つでも存在すれば、スタック全体を安全とは判定しないことを示します。
文字列の内容には依存せず、経路を構成する権限の組み合わせだけで結果が決まります。
-/
theorem completeEscalationIsUnsafe (principal target resource service : String) :
    safe [{
      principal := principal
      target := target
      protectedResource := resource
      service := service
      canPassRole := true
      canLaunch := true
      targetTrustsService := true
      targetCanAccess := true
    }] = false := by
  simp [safe, isEscalation]

/--
PassRoleの要らない候補経路が、危険な経路になる3条件の論理積です。
The conjunction of the three conditions of a path without `iam:PassRole`.
-/
def isImplicitEscalation (path : ImplicitPath) : Bool :=
  path.canChange && path.runsAsTarget && path.targetCanAccess
/-- PassRoleの要らない候補経路がすべて安全のときにtrueを返します。 -/
def safeImplicit (paths : List ImplicitPath) : Bool :=
  paths.all fun path => !(isImplicitEscalation path)
/-- 空リストに対するBoolean関数の基本性質です。空のモデルを安全と認めるという意味ではありません。 -/
theorem emptyImplicitModelIsSafeAtBooleanLevel : safeImplicit [] = true := by
  native_decide
/-- 3条件をすべて満たす経路が1つでもあれば、安全とは判定しません。 -/
theorem completeImplicitEscalationIsUnsafe (principal resource target protectedResource : String) :
    safeImplicit [{
      principal := principal
      resource := resource
      target := target
      protectedResource := protectedResource
      canChange := true
      runsAsTarget := true
      targetCanAccess := true
    }] = false := by
  simp [safeImplicit, isImplicitEscalation]
end ProofGate
