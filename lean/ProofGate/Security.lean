import ProofGate.Model

namespace ProofGate

/-!
# 権限昇格経路の安全判定

`EscalationPath`の有限リストを対象に、保護対象リソースへ到達できる
完全な権限昇格経路が存在しないことを判定します。
-/

/--
候補経路が実際の権限昇格経路になるための4条件を検査します。

1. 対象ロールをLambdaへ渡せる
2. Lambdaのコードまたはロール設定を制御できる
3. 対象ロールをLambdaサービスが引き受けられる
4. 対象ロールが保護対象リソースへアクセスできる

4条件がすべてtrueの場合だけ、危険な経路と判定します。
-/
def isEscalation (path : EscalationPath) : Bool :=
  path.canPassRole && path.canControlLambda && path.targetIsLambdaAssumable && path.targetCanAccess

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
theorem completeEscalationIsUnsafe (principal target resource : String) :
    safe [{
      principal := principal
      target := target
      protectedResource := resource
      canPassRole := true
      canControlLambda := true
      targetIsLambdaAssumable := true
      targetCanAccess := true
    }] = false := by
  simp [safe, isEscalation]

end ProofGate
