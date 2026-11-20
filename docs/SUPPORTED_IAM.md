# 対応するIAM構文

現在の実装は、次の構文に対応します。

- `AWS::IAM::Role`
- Lambdaが引き受け可能かを判定するService Principalを含む、リテラル値で記述されたRole Trust Policy
- `Role.Properties.Policies`のインラインポリシー
- `{ "Ref": "LogicalId" }`によってローカルロールへアタッチされた`AWS::IAM::Policy`
- リテラル値の`Allow`、`Deny` Effect
- 文字列または文字列配列で指定された`Action`、`Resource`
- Action・Resource文字列内の`*`によるglob matching
- Action・Resource文字列内の`?`（任意の1文字）によるglob matching
- `iam:PassRole`、Lambdaの作成、または設定更新とコード更新の組み合わせ、S3オブジェクトの読み取り・書き込み・削除Action
- 保護対象バケットへのアクセスは、ポリシーのResourceが表すARN集合と、保護対象バケット内のオブジェクト集合が交わるかで判定します。`bucket/reports/*`のような一部のプレフィックスや、単一オブジェクトへのアクセスも、保護対象バケットへのアクセスとみなします。バケットレベルのARNだけでは、オブジェクト操作へのアクセスとはみなしません

ProofGateは次の場合に`PG-IAM-003`を報告し、Fail Closedで拒否します。

- `NotAction`、`NotResource`、`Condition`
- Role Trust Policy内の`NotPrincipal`、`Condition`、またはリテラルではない値
- リテラルではないAction、Resource、Role Name、Policy Attachment
- デフォルト以外のIAM Role Path
- `AWS::IAM::ManagedPolicy`とロールの`ManagedPolicyArns`
- 不正な形式のPolicy Document
- ロールまたは対応するStatementが存在しないテンプレート
- 保護対象バケットARNが設定されていないProofGate設定
- Resourceに含まれるIAMポリシー変数（`${aws:username}`など）。変数は評価せず、未対応として拒否します。以前は受理されていたテンプレートが、`PG-IAM-003`で拒否される場合があります

現在のモデルでは、`AWS::IAM::Role`と`AWS::IAM::Policy`以外のIAMリソースタイプを拒否します。Trust PolicyのExplicit DenyとConditionは評価しません。Conditionは無視せず、未対応構文として拒否します。
`iam:PassRole`の対象ロールが`RoleName`を持たない場合、CloudFormationが付ける名前は合成時に不明です。ProofGateはその名前を不透明な名前`_generated_<LogicalId>`として扱います。Resourceのロール名部分に`*`または`?`を含むPattern（`role/*`、`role/MyStack-*`など）は、実際の生成名に一致しうるため対象とみなします（過剰検出の側です）。リテラルのロール名は、不透明な名前そのもの（`role.roleArn`の参照など）のときだけ一致します。以前のバージョンは、名前のないロールをこれらのPatternで見逃していました。この変更は指摘を増やす方向だけに働きます。

English: when the target of `iam:PassRole` has no `RoleName`, CloudFormation chooses a name that is unknown at synthesis. ProofGate reads it as the opaque name `_generated_<LogicalId>`. A Resource whose role-name part contains `*` or `?` (`role/*`, `role/MyStack-*`) counts as a possible match (over-approximation). A literal role name matches only if it is the opaque name itself (for example a reference through `role.roleArn`). Earlier versions missed unnamed roles for these patterns. The change can only add findings.
