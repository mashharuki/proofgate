namespace ProofGate

/-!
# 権限昇格経路の有限モデル

TypeScriptのExtractorがCloudFormationから抽出した情報を、
Leanで判定できる小さな有限モデルとして表現します。
各真偽値は、サポート対象のIAM構文から確認できた事実だけを表します。
-/

/--
あるIAMプリンシパルから、Lambdaを経由して保護対象リソースへ到達する
権限昇格経路の候補です。

この構造体自体は経路が危険かどうかを断定しません。
4つの条件をすべて満たすかどうかは`ProofGate.isEscalation`が判定します。
-/
structure EscalationPath where
  /-- 権限昇格の起点となるIAMプリンシパルのLogical ID。 -/
  principal : String
  /-- `iam:PassRole`でLambdaへ渡される対象ロールのLogical ID。 -/
  target : String
  /-- アプリケーション設定で指定された保護対象リソース。 -/
  protectedResource : String
  /-- 起点プリンシパルが対象ロールを渡せる場合にtrue。 -/
  canPassRole : Bool
  /-- 起点プリンシパルがLambdaのコードまたはロール設定を制御できる場合にtrue。 -/
  canControlLambda : Bool
  /-- 対象ロールのTrust PolicyがLambdaサービスによる引き受けを許可する場合にtrue。 -/
  targetIsLambdaAssumable : Bool
  /-- 対象ロールが保護対象リソースへアクセスできる場合にtrue。 -/
  targetCanAccess : Bool
  deriving Repr, DecidableEq

end ProofGate
