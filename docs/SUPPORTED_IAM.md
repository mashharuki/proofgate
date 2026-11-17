# 対応するIAM構文

現在の実装は、次の構文に対応します。

- `AWS::IAM::Role`
- Lambdaが引き受け可能かを判定するService Principalを含む、リテラル値で記述されたRole Trust Policy
- `Role.Properties.Policies`のインラインポリシー
- `{ "Ref": "LogicalId" }`によってローカルロールへアタッチされた`AWS::IAM::Policy`
- リテラル値の`Allow`、`Deny` Effect
- 文字列または文字列配列で指定された`Action`、`Resource`
- Action・Resource文字列内の`*`によるglob matching
- `iam:PassRole`、Lambdaの作成、または設定更新とコード更新の組み合わせ、S3オブジェクトの読み取り・書き込み・削除Action

ProofGateは次の場合に`PG-IAM-003`を報告し、Fail Closedで拒否します。

- `NotAction`、`NotResource`、`Condition`
- Role Trust Policy内の`NotPrincipal`、`Condition`、またはリテラルではない値
- リテラルではないAction、Resource、Role Name、Policy Attachment
- デフォルト以外のIAM Role Path
- `AWS::IAM::ManagedPolicy`とロールの`ManagedPolicyArns`
- 不正な形式のPolicy Document
- ロールまたは対応するStatementが存在しないテンプレート
- 保護対象バケットARNが設定されていないProofGate設定

現在のモデルでは、`AWS::IAM::Role`と`AWS::IAM::Policy`以外のIAMリソースタイプを拒否します。Trust PolicyのExplicit DenyとConditionは評価しません。Conditionは無視せず、未対応構文として拒否します。
