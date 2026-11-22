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

/--
`iam:PassRole`を使わない経路の候補です。主体Pが、すでにロールTで動いているリソースRを変更でき、Tが保護対象リソースへ
アクセスできる場合に、危険な経路になります（spec proofgate-implicit-role-paths）。
`canPassRole`は持ちません。PassRoleのない経路に`canPassRole := true`と書くと、事実と違うためです。
A candidate path without `iam:PassRole`: principal P can change resource R, which already runs as role T, and T can access
the protected resource. There is no `canPassRole` field: it would be false to write `true` for a path with no PassRole.
-/
structure ImplicitPath where
  /-- 起点となるIAMプリンシパルのLogical ID。 -/
  principal : String
  /-- 変更されるリソース（Lambda関数など）のLogical ID。 -/
  resource : String
  /-- そのリソースが引き受けているロールのLogical ID。 -/
  target : String
  /-- アプリケーション設定で指定された保護対象リソース。 -/
  protectedResource : String
  /-- 起点プリンシパルが、このリソースを変更する表のアクションを、このリソースに対して持つ場合にtrue。 -/
  canChange : Bool
  /-- このリソースが対象ロールで動く場合にtrue（候補はロールを特定できたリソースだけなので、常にtrueです）。 -/
  runsAsTarget : Bool
  /-- 対象ロールが保護対象リソースへアクセスできる場合にtrue。 -/
  targetCanAccess : Bool
  deriving Repr, DecidableEq
/--
ロール自身がIAMを書き換える経路の候補です（spec proofgate-self-escalation）。自分への付与、乗っ取り、作成して付与のいずれかで、
`shape`に名前を持ちます（説明用で、判定には使いません）。除外された組（`allowedPolicyWriters`など）も、`notExempt := false`の行として含みます。
A candidate path in which a role changes IAM itself (a self-grant, a take-over, or a creation grant). `shape` names it, for
explanation only. Exempt candidates are rows with `notExempt := false`, so that Lean checks the exemption too.
-/
structure PolicyWritePath where
  /-- 書き換えるIAMプリンシパルのLogical ID。 -/
  principal : String
  /-- 書き換えられるロールのLogical ID（自分への付与と作成して付与では、プリンシパル自身）。 -/
  target : String
  /-- アプリケーション設定で指定された保護対象リソース。 -/
  protectedResource : String
  /-- 経路の形（`self-grant`、`creation-grant`、`take-over`）。説明用です。 -/
  shape : String
  /-- 起点プリンシパルが、この形の書き込みのアクションを、このロールに対して持つ場合にtrue。 -/
  canWrite : Bool
  /-- 書き込みの後に保護対象リソースへ届く場合にtrue（自分への付与と作成して付与では常にtrue。乗っ取りでは、対象ロールが今届く場合）。 -/
  reachesAfterWrite : Bool
  /-- 起点プリンシパルが`allowedPolicyWriters`になく、乗っ取りでは対象ロールが`allowedPassRoleTargets`にもない場合にtrue。 -/
  notExempt : Bool
  deriving Repr, DecidableEq
end ProofGate
