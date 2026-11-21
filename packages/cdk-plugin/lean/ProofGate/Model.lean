namespace ProofGate

/-!
# 権限昇格経路の有限モデル

TypeScriptのExtractorがCloudFormationから抽出した情報を、
Leanで判定できる小さな有限モデルとして表現します。
各真偽値は、サポート対象のIAM構文から確認できた事実だけを表します。
-/

/--
あるIAMプリンシパルから、ロールを渡せる起動サービス（Lambda、ECS、EC2など）を経由して
保護対象リソースへ到達する権限昇格経路の候補です。
A candidate escalation path from an IAM principal, through a launch service that receives a passed role
(Lambda, ECS, EC2, and others), to a protected resource.

この構造体自体は経路が危険かどうかを断定しません。
4つの条件をすべて満たすかどうかは`ProofGate.isEscalation`が判定します。
-/
structure EscalationPath where
  /-- 権限昇格の起点となるIAMプリンシパルのLogical ID。 -/
  principal : String
  /-- `iam:PassRole`で起動サービスへ渡される対象ロールのLogical ID。 -/
  target : String
  /-- アプリケーション設定で指定された保護対象リソース。 -/
  protectedResource : String
  /-- 経路が通る起動サービスのサービスプリンシパル（例: `lambda.amazonaws.com`）。説明用で、判定には使いません。
      The service principal of the launch service on this path. For explanation only; not used by the decision. -/
  service : String
  /-- 起点プリンシパルが対象ロールを渡せる場合にtrue。 -/
  canPassRole : Bool
  /-- 起点プリンシパルが、このサービスへロールを渡す起動アクションを持つ場合にtrue（以前の`canControlLambda`）。
      True if the principal holds a launch action that hands a role to this service (was `canControlLambda`). -/
  canLaunch : Bool
  /-- 対象ロールのTrust Policyが、このサービスによる引き受けを許可する場合にtrue（以前の`targetIsLambdaAssumable`）。
      True if the target role's trust policy lets this service assume it (was `targetIsLambdaAssumable`). -/
  targetTrustsService : Bool
  /-- 対象ロールが保護対象リソースへアクセスできる場合にtrue。 -/
  targetCanAccess : Bool
  deriving Repr, DecidableEq

end ProofGate
