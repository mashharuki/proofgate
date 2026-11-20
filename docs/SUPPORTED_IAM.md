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
- Role Trust Policy内の`NotPrincipal`、`NotAction`、`Deny`のStatementの`Condition`、オブジェクトではない`Condition`、またはリテラルではない値
- リテラルではないAction、Role Name、Policy Attachment。Resourceは、後述の値リゾルバで読めないもの（パラメータへの`Ref`、`Fn::Sub`、`Fn::ImportValue`、`Fn::If`、`Fn::Select`、テンプレートにない名前への参照、バケットとロールの`Arn`以外の属性、`AWS::StackName`や`AWS::NoValue`など）
- デフォルト以外のIAM Role Path
- `AWS::IAM::ManagedPolicy`と、後述の表にない管理ポリシー（ロールの`ManagedPolicyArns`）
- 不正な形式のPolicy Document
- ロールまたは対応するStatementが存在しないテンプレート
- 保護対象バケットARNが設定されていないProofGate設定
- Resourceに含まれるIAMポリシー変数（`${aws:username}`など）。変数は評価せず、未対応として拒否します。以前は受理されていたテンプレートが、`PG-IAM-003`で拒否される場合があります

現在のモデルでは、`AWS::IAM::Role`と`AWS::IAM::Policy`以外のIAMリソースタイプを拒否します。Trust PolicyのExplicit Denyは評価しません。権限Statementの`Condition`は無視せず、未対応構文として拒否します。Trust Policyの`Allow`に付いたオブジェクトの`Condition`は下記のとおり無視します。
`iam:PassRole`の対象ロールが`RoleName`を持たない場合、CloudFormationが付ける名前は合成時に不明です。ProofGateはその名前を不透明な名前`_generated_<LogicalId>`として扱います。Resourceのロール名部分に`*`または`?`を含むPattern（`role/*`、`role/MyStack-*`など）は、実際の生成名に一致しうるため対象とみなします（過剰検出の側です）。リテラルのロール名は、不透明な名前そのもの（`role.roleArn`の参照など）のときだけ一致します。以前のバージョンは、名前のないロールをこれらのPatternで見逃していました。この変更は指摘を増やす方向だけに働きます。

English: when the target of `iam:PassRole` has no `RoleName`, CloudFormation chooses a name that is unknown at synthesis. ProofGate reads it as the opaque name `_generated_<LogicalId>`. A Resource whose role-name part contains `*` or `?` (`role/*`, `role/MyStack-*`) counts as a possible match (over-approximation). A literal role name matches only if it is the opaque name itself (for example a reference through `role.roleArn`). Earlier versions missed unnamed roles for these patterns. The change can only add findings.

Trust Policyの`Allow` Statementに付いたオブジェクトの`Condition`は、無いものとして読みます。`Condition`は引き受けられる主体を狭めるだけなので、無視すると指摘が増える側です。`Deny`のStatementの`Condition`と、オブジェクトではない`Condition`は、これまでどおり`PG-IAM-003`で拒否します。

English: an object `Condition` on an `Allow` trust statement is read as absent. A condition can only narrow who may assume the role, so ignoring it only adds findings. A `Condition` on a `Deny` statement, and a `Condition` that is not an object, are still rejected with `PG-IAM-003`.

ロールの`ManagedPolicyArns`は、次の管理ポリシー1件だけを読みます。内容はAWSのドキュメント（2026-11-19に確認、ポリシーバージョンv1）のとおり、ロールのStatementへ展開します。展開したStatementは、インラインのStatementの後、独立した`AWS::IAM::Policy`の前に並びます。

- `AWSLambdaBasicExecutionRole`（`arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`）: `logs:CreateLogGroup`、`logs:CreateLogStream`、`logs:PutLogEvents`を`*`へAllow

書き方は、リテラルのARN（パーティションは`aws`）か、CDKが作る`Fn::Join ["", ["arn:", {"Ref": "AWS::Partition"}, ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]]`です。表にない管理ポリシー、`service-role/`のない同名のARN、`aws`以外のリテラルのパーティション、ほかの`Ref`や区切り文字のある`Fn::Join`は、`PG-IAM-003`で拒否します。1つでも読めない要素があれば、そのロールの`ManagedPolicyArns`全体を拒否します。

English: `ManagedPolicyArns` is read for one managed policy only, `AWSLambdaBasicExecutionRole`, written as a literal ARN (partition `aws`) or as the CDK `Fn::Join` with `Ref AWS::Partition`. Its statement (Allow of three `logs:` actions on `*`, as in the AWS documentation checked on 2026-11-19, version v1) is appended to the role after the inline statements and before attached `AWS::IAM::Policy` statements. Any other managed policy, or any entry that cannot be read, rejects the whole `ManagedPolicyArns` with `PG-IAM-003`. More policies need the same check against the AWS documentation first.

## Resourceの値リゾルバ（R1）

`Resource`は、リテラルの文字列に加えて、次の値を読みます。読めない部分が1つでもあれば、その値全体を`PG-IAM-003`で拒否し、部分的なモデルは返しません。`Action`はリテラルのままです。

| 値                                                    | 読み方                                                                                               |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `Fn::Join [区切り, [部分...]]`                        | 各部分を読み、区切りでつなぎます                                                                     |
| `Ref AWS::Partition`                                  | `aws`、`aws-cn`、`aws-us-gov`の3つの候補（値は候補の集合になり、Resourceにはすべての候補を並べます） |
| `Ref AWS::Region`、`AWS::AccountId`、`AWS::URLSuffix` | `*`                                                                                                  |
| 同じテンプレートの`AWS::S3::Bucket`への`Ref`          | バケット名                                                                                           |
| `Fn::GetAtt [バケット, Arn]`                          | `arn:<パーティション>:s3:::<バケット名>`                                                             |
| 同じテンプレートの`AWS::IAM::Role`への`Ref`           | ロール名                                                                                             |
| `Fn::GetAtt [ロール, Arn]`                            | `arn:<パーティション>:iam::*:role/<ロール名>`                                                        |
| ほかのリソースへの`Ref`、`Fn::GetAtt`                 | `*`                                                                                                  |

名前のないバケットとロールは、不透明な名前`_generated_<LogicalId>`で表します。名前のないバケットは、保護バケットの名前がリテラルなら保護バケットと交わりません。保護バケットの名前に`*`または`?`があれば、不透明な名前を`*`として読みます（過剰検出の側）。

パーティションを`*`にしないのは、評価器の`*`がコロンをまたぐためです。`arn:*:s3:::x/*`は保護バケットのオブジェクトと必ず交わり、すべてのバケットが誤検出になります。

English: `Resource` also reads `Fn::Join`, the pseudo-parameters `AWS::Partition` (expanded to the three documented partitions `aws`, `aws-cn`, `aws-us-gov`), `AWS::Region`, `AWS::AccountId`, `AWS::URLSuffix` (read as `*`), and `Ref` and `Fn::GetAtt Arn` of buckets and roles of the same template. `Ref` or `Fn::GetAtt` of any other resource of the template is read as `*`. An unnamed bucket or role is written as the opaque name `_generated_<LogicalId>`. An unnamed bucket does not meet a literal protected bucket; if the protected name has `*` or `?`, the opaque name is read as `*`. Anything else (a parameter, `Fn::Sub`, `Fn::ImportValue`, `Fn::If`, a missing target, an attribute other than `Arn` of a bucket or a role, `AWS::StackName`, `AWS::NoValue`) rejects the value with `PG-IAM-003`. The partition is not read as `*` because the evaluator's `*` crosses colons, so `arn:*:s3:::x/*` would always meet the protected objects.
