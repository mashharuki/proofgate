# 対応するIAM構文

現在の実装は、次の構文に対応します。

- `AWS::IAM::Role`
- 起動サービス（Lambda、ECS、EC2、CodeBuildなど）が引き受け可能かを判定するService Principalを含む、リテラル値で記述されたRole Trust Policy
- `AWS::IAM::InstanceProfile`（`Roles`がテンプレート内のロールへの`Ref`か、リテラルの名前のとき。権限を増やさないため、モデルには入りません）
- `Role.Properties.Policies`のインラインポリシー
- `{ "Ref": "LogicalId" }`によってローカルロールへアタッチされた`AWS::IAM::Policy`
- リテラル値の`Allow`、`Deny` Effect
- 文字列または文字列配列で指定された`Action`、`Resource`
- Action・Resource文字列内の`*`によるglob matching
- Action・Resource文字列内の`?`（任意の1文字）によるglob matching
- `iam:PassRole`、起動アクション（下記。Lambdaでは関数の作成または設定更新`lambda:UpdateFunctionConfiguration`。1.1.1までは設定更新とコード更新の組み合わせを要求していました）、S3のアクセスを与えるAction（下記）
- 保護対象バケットへのアクセスは、ポリシーのResourceが表すARN集合と、保護対象バケット内のオブジェクト集合が交わるかで判定します。`bucket/reports/*`のような一部のプレフィックスや、単一オブジェクトへのアクセスも、保護対象バケットへのアクセスとみなします。バケットレベルのARNだけでは、オブジェクト操作へのアクセスとはみなしません

ProofGateは次の場合に`PG-IAM-003`を報告し、Fail Closedで拒否します。

- `NotAction`、`NotResource`、`Condition`
- Role Trust Policy内の`NotPrincipal`、`NotAction`、`Deny`のStatementの`Condition`、オブジェクトではない`Condition`、またはリテラルではない値（サービスではないプリンシパルを除く。次の段落）
- リテラルではないAction、Role Name、Policy Attachment。Resourceは、後述の値リゾルバで読めないもの（パラメータへの`Ref`、変数マップのある`Fn::Sub`、`Fn::ImportValue`、`Fn::If`、`Fn::Select`、テンプレートにない名前への参照、バケットとロールの`Arn`以外の属性、`AWS::StackName`や`AWS::NoValue`など）
- デフォルト以外のIAM Role Path
- `AWS::IAM::ManagedPolicy`と、後述の表にない管理ポリシー（ロールの`ManagedPolicyArns`）
- 不正な形式のPolicy Document
- IAMリソースを含むのに、ロールがない、または読めるStatementが1つもないテンプレート。ネストされたスタック、`Transform`、`Fn::Transform`、SAMのリソース、読めないリソースの項目を含み、IAMリソースがないと言い切れないテンプレートも、ここに入ります（後述）
- 保護対象バケットARNが設定されていないProofGate設定
- Resourceに含まれるIAMポリシー変数（`${aws:username}`など）。変数は評価せず、未対応として拒否します。以前は受理されていたテンプレートが、`PG-IAM-003`で拒否される場合があります

現在のモデルでは、`AWS::IAM::Role`と`AWS::IAM::Policy`以外のIAMリソースタイプを拒否します。Trust PolicyのExplicit Denyは評価しません。権限Statementの`Condition`は無視せず、未対応構文として拒否します。Trust Policyの`Allow`に付いたオブジェクトの`Condition`は下記のとおり無視します。
`iam:PassRole`の対象ロールが`RoleName`を持たない場合、CloudFormationが付ける名前は合成時に不明です。ProofGateはその名前を不透明な名前`_generated_<LogicalId>`として扱います。Resourceのロール名部分に`*`または`?`を含むPattern（`role/*`、`role/MyStack-*`など）は、実際の生成名に一致しうるため対象とみなします（過剰検出の側です）。リテラルのロール名は、不透明な名前そのもの（`role.roleArn`の参照など）のときだけ一致します。以前のバージョンは、名前のないロールをこれらのPatternで見逃していました。この変更は指摘を増やす方向だけに働きます。

`iam:PassRole`のResourceは、対象ロールのARN（`arn:<パーティション>:iam:<リージョン>:<アカウント>:role/<名前>`）を表しうるかを、パターンの交差で判定します。パーティション、リージョン、アカウントはコロンを含まない文字列として読みます。1.2.0までは、Resourceに文字列`:role/`が含まれないと対象にしなかったため、`arn:aws:iam::123456789012:*`、`arn:aws:iam::*:role*`、`arn:*`などのResourceを見逃していました（IAMはこれらでロールを渡すことを許可します）。アカウントの部分にコロンを含むResource（`arn:aws:iam::1:2:role/x`）は、実在するロールのARNに一致しないため、対象にしません。
English: an `iam:PassRole` Resource is matched against the target role's ARN by pattern intersection, with the partition, region, and account read as runs without a colon. Up to 1.2.0 a Resource without the substring `:role/` was never counted, so `arn:aws:iam::123456789012:*`, `arn:aws:iam::*:role*`, and `arn:*` were missed although IAM allows them. A Resource whose account part holds a colon does not count, because no real role ARN matches it.
English: when the target of `iam:PassRole` has no `RoleName`, CloudFormation chooses a name that is unknown at synthesis. ProofGate reads it as the opaque name `_generated_<LogicalId>`. A Resource whose role-name part contains `*` or `?` (`role/*`, `role/MyStack-*`) counts as a possible match (over-approximation). A literal role name matches only if it is the opaque name itself (for example a reference through `role.roleArn`). Earlier versions missed unnamed roles for these patterns. The change can only add findings.

Trust Policyの`Allow` Statementに付いたオブジェクトの`Condition`は、無いものとして読みます。`Condition`は引き受けられる主体を狭めるだけなので、無視すると指摘が増える側です。`Deny`のStatementの`Condition`と、オブジェクトではない`Condition`は、これまでどおり`PG-IAM-003`で拒否します。

English: an object `Condition` on an `Allow` trust statement is read as absent. A condition can only narrow who may assume the role, so ignoring it only adds findings. A `Condition` on a `Deny` statement, and a `Condition` that is not an object, are still rejected with `PG-IAM-003`.

ロールの`ManagedPolicyArns`は、次の管理ポリシー7件だけを読みます（下の3件は2026-11-22に追加）。

- `AmazonSSMManagedInstanceCore`（`arn:aws:iam::aws:policy/AmazonSSMManagedInstanceCore`、v2）: 3つのStatement。`service-role/`は付きません。
- `AWSGlueServiceRole`（`.../service-role/AWSGlueServiceRole`、v5）: 6つのStatement。S3のStatementを含みます。`arn:aws:s3:::*/*aws-glue-*/*`が、どのバケットでも、キーに`aws-glue-`を含むオブジェクトを表すため、このポリシーを持つロールは、保護対象バケットに届くものとして数えます。
- `AWSBackupServiceRolePolicyForBackup`（v30、59 Statement）と`AWSBackupServiceRolePolicyForRestores`（v36、47 Statement）（`.../service-role/<名前>`）: `iam:PassRole`と、`ec2:RunInstances`、`rds:*`などの起動アクションを含みます。AllowのConditionは写さないため、`iam:PassedToService`の制限はなく、渡せるロールと起動アクションの組として数えます（過大判定）。
- `AWS_ConfigRole`は、アクションが3775個と大きいため、まだ読みません。

次の3件は、以前からの対象です。内容はAWSのドキュメント（`AWSLambdaBasicExecutionRole`は2026-11-19、ほかの2件は2026-11-21に確認）のとおり、ロールのStatementへ展開します。展開したStatementは、インラインのStatementの後、独立した`AWS::IAM::Policy`の前に並びます。

- `AWSLambdaBasicExecutionRole`（`arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`）: `logs:CreateLogGroup`、`logs:CreateLogStream`、`logs:PutLogEvents`を`*`へAllow（v1）
- `AWSLambdaVPCAccessExecutionRole`（`.../service-role/AWSLambdaVPCAccessExecutionRole`、v3）: 上の3つの`logs:`に加えて、`ec2:CreateNetworkInterface`、`ec2:DescribeNetworkInterfaces`、`ec2:DescribeSubnets`、`ec2:DeleteNetworkInterface`、`ec2:AssignPrivateIpAddresses`、`ec2:UnassignPrivateIpAddresses`を`*`へAllow
- `AmazonAPIGatewayPushToCloudWatchLogs`（`.../service-role/AmazonAPIGatewayPushToCloudWatchLogs`、v1）: `logs:CreateLogGroup`、`logs:CreateLogStream`、`logs:DescribeLogGroups`、`logs:DescribeLogStreams`、`logs:PutLogEvents`、`logs:GetLogEvents`、`logs:FilterLogEvents`を`*`へAllow

書き方は、リテラルのARN（パーティションは`aws`）か、CDKが作る`Fn::Sub "arn:${AWS::Partition}:iam::aws:policy/service-role/<名前>"`（変数は`AWS::Partition`だけ）か、`Fn::Join ["", ["arn:", {"Ref": "AWS::Partition"}, ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]]`です。表にない管理ポリシー、`service-role/`のない同名のARN、`aws`以外のリテラルのパーティション、ほかの`Ref`や区切り文字のある`Fn::Join`は、`PG-IAM-003`で拒否します。1つでも読めない要素があれば、そのロールの`ManagedPolicyArns`全体を拒否します。

English: four more managed policies are read (added 2026-11-22; contents copied statement by statement from the AWS pages, the `Condition` of an Allow statement not copied, which only adds findings): `AmazonSSMManagedInstanceCore` (v2), `AWSGlueServiceRole` (v5, with S3 statements that may denote objects of any bucket), `AWSBackupServiceRolePolicyForBackup` (v30), and `AWSBackupServiceRolePolicyForRestores` (v36, with `iam:PassRole` and launch actions). `AWS_ConfigRole` (3775 actions) is not read yet. Earlier: `ManagedPolicyArns` is read for three managed policies only (`AWSLambdaBasicExecutionRole`, `AWSLambdaVPCAccessExecutionRole`, `AmazonAPIGatewayPushToCloudWatchLogs`), written as a literal ARN (partition `aws`), as the CDK `Fn::Sub` with `${AWS::Partition}` (no other variable), or as the CDK `Fn::Join` with `Ref AWS::Partition`. Each statement (an Allow on `*` of `logs:` actions, plus six `ec2:` network-interface actions for the VPC policy, as in the AWS documentation checked on 2026-11-19 and 2026-11-21) is appended to the role after the inline statements and before attached `AWS::IAM::Policy` statements. Any other managed policy, or any entry that cannot be read, rejects the whole `ManagedPolicyArns` with `PG-IAM-003`. More policies need the same check against the AWS documentation first.

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

English: `Resource` also reads `Fn::Join`, the pseudo-parameters `AWS::Partition` (expanded to the three documented partitions `aws`, `aws-cn`, `aws-us-gov`), `AWS::Region`, `AWS::AccountId`, `AWS::URLSuffix` (read as `*`), and `Ref` and `Fn::GetAtt Arn` of buckets and roles of the same template. `Ref` or `Fn::GetAtt` of any other resource of the template is read as `*`. An unnamed bucket or role is written as the opaque name `_generated_<LogicalId>`. An unnamed bucket does not meet a literal protected bucket; if the protected name has `*` or `?`, the opaque name is read as `*`. `Fn::Sub` in its string form (no variable map) is read too: `${Name}` like `Ref Name`, `${Id.Attr}` like `Fn::GetAtt`, and `${!Text}` as the literal `${Text}` (which the policy-variable rule then rejects). A variable map, an unknown name, a parameter, an unterminated `${`, and an empty `${}` reject the value. Anything else (a parameter, a `Fn::Sub` with a variable map, `Fn::ImportValue`, `Fn::If`, a missing target, an attribute other than `Arn` of a bucket or a role, `AWS::StackName`, `AWS::NoValue`) rejects the value with `PG-IAM-003`. The partition is not read as `*` because the evaluator's `*` crosses colons, so `arn:*:s3:::x/*` would always meet the protected objects.

## サービスではない信頼プリンシパル

信頼ポリシーの`Principal`が`AWS`（アカウントやロール）や`Federated`のとき、ProofGateは、その値を無視します（引き受けられるサービスだけを読むためです）。リテラルの文字列は、以前から無視していました。`Fn::Join`、`Fn::Sub`、`Fn::GetAtt`、疑似パラメータで書かれていても、リゾルバが読めるなら、同じように無視します（CDKの`AccountPrincipal`は、アカウントを`Fn::Join`と`Ref AWS::Partition`で書きます）。読めない値（パラメータへの`Ref`、`Fn::ImportValue`、`Fn::If`、文字列ではない値）は、今までどおり`PG-IAM-003`で拒否します。`Service`だけは、引き受けられるサービスを決めるため、リテラルの文字列でなければなりません。この読み方は、ロールの連鎖（別のロールが`sts:AssumeRole`で引き受ける形）をモデルにしないという、これまでの限界と同じです（`docs/ASSUMPTIONS.md`）。

English: a trust-policy `Principal` of type `AWS` or `Federated` is ignored (only the services that can assume the role are read). A literal string was always ignored; a value written with `Fn::Join`, `Fn::Sub`, `Fn::GetAtt`, or pseudo-parameters that the resolver can read is now ignored the same way (CDK's `AccountPrincipal` is written with `Fn::Join` and `Ref AWS::Partition`). A value that cannot be read (a `Ref` to a parameter, `Fn::ImportValue`, `Fn::If`, a non-string) is still rejected with `PG-IAM-003`. A `Service` principal must stay literal. This is the same limit as before: role chains are not modeled.

## ロールで動くリソースと、PassRoleの要らない経路

`AWS::Lambda::Function`（`Role`）、`AWS::CodeBuild::Project`（`ServiceRole`）、`AWS::StepFunctions::StateMachine`（`RoleArn`）を読み、モデルの`resources`へ入れます（spec `proofgate-implicit-role-paths`、Step 2）。ロールは、`Fn::GetAtt [<ロール>, Arn]`、またはテンプレート内のロールの名前と一致するARN（リテラルや`Fn::Join`、`Fn::Sub`）で特定します。パラメータ、`Fn::ImportValue`、テンプレートにないロール、`Arn`以外の属性、`Fn::If`、プロパティなしは、特定せず`roleUnknown`にします。物理名がintrinsicで読めないときは`nameUnknown`です。この2つの項目は、次の経路の判定に使います。

**PassRoleの要らない経路（`PG-IAM-004`）。** 主体Pが、すでにロールTで動いているリソースRを変更でき、Tが保護バケットに届くとき、`iam:PassRole`がなくても、Pは選んだコードをTの権限で動かせます。対象のアクションは、AWSのドキュメントで確認した次の5つです（`packages/core/src/implicit-actions.ts`、出典は`.kiro/specs/proofgate-implicit-role-paths/data-verification.md`）。

- Lambda関数: `lambda:UpdateFunctionCode`、`lambda:UpdateFunctionConfiguration`（レイヤーと`ImageConfig`で、関数の中のコードを動かせます）
- CodeBuildプロジェクト: `codebuild:StartBuild`、`codebuild:StartBuildBatch`（`buildspecOverride`）
- Step Functionsのステートマシン: `states:UpdateStateMachine`（`definition`だけの更新）

Pの`Allow`のStatementが、この表のアクションを持ち、`Resource`がRのARNを表しうるとき、Pは変更できるとみなします。`Resource`が`*`、Rを表すARN、名前の一部を`*`か`?`にしたパターン、サービス全体のARN（`arn:aws:lambda:*:*:*`）は、Rを表しうるものとして数えます。名前のない関数は、不透明な名前`_generated_<LogicalId>`として読み、名前の部分にワイルドカードのあるパターンは数え、リテラルの別の名前は数えません。ARNでもない裸の名前や論理IDは数えません（IAMはそのResourceを受け付けません）。ARNのパーティション、リージョン、アカウントは、コロンを含まない文字列として扱います（パターンの`*`はコロンも表します）。除くのは、PがTと同じロールのとき（自分が動いているリソースを変えても、新しい権限は得られません）と、Tが`allowedPassRoleTargets`にあるときです（PassRoleの経路と同じ扱いです）。違反の文面は、変更できるリソース、アクション、ロール、バケットを書きます。

**ロールを特定できないリソース（`PG-IAM-003`）。** `roleUnknown`のリソースを、Allowのアクションと`Resource`で変更できる主体がいるときは、`PG-IAM-003`で拒否します（「ロールを特定できず、主体が変更できる」）。誰も変更できないリソースは、拒否しません。

Leanは、PassRoleの経路とは別の構造`ImplicitPath`（`canChange`、`runsAsTarget`、`targetCanAccess`）の一覧を検査します。

English: a principal that can change a resource that already runs as role T, where T reaches a protected bucket, runs code of its choice as T without `iam:PassRole`. The table (`packages/core/src/implicit-actions.ts`, evidence in the spec's `data-verification.md`) has five actions: `lambda:UpdateFunctionCode` and `lambda:UpdateFunctionConfiguration` (Lambda function), `codebuild:StartBuild` and `codebuild:StartBuildBatch` (CodeBuild project), `states:UpdateStateMachine` (state machine). A statement counts when an action of the table matches and a `Resource` may denote the ARN of the resource (`*`, the ARN, a name pattern, a service-wide ARN; an unnamed resource is read as `_generated_<LogicalId>`, and a wildcard in the name part counts; a bare name or logical ID does not; partition, region, and account contain no colon). Excluded: the principal is the role of the resource, and the role is in `allowedPassRoleTargets`. A resource with an unknown role that a principal can change is rejected with `PG-IAM-003`. Lean checks a second list of `ImplicitPath` (`canChange`, `runsAsTarget`, `targetCanAccess`).

あわせて、この3種類のリソースへの`Ref`と`Fn::GetAtt [<id>, Arn]`を、正確に読むようにしました。以前は、バケットとロール以外のリソースの参照を`*`と読んでいたため、1つの関数に向けた権限が、すべての関数に一致してしまいます。今は、名前（または不透明な名前`_generated_<LogicalId>`）から`arn:<パーティション>:lambda:*:*:function:<名前>`、`arn:<パーティション>:codebuild:*:*:project/<名前>`、`arn:<パーティション>:states:*:*:stateMachine:<名前>`を作ります。`Ref`は、Lambda関数とCodeBuildプロジェクトでは名前、ステートマシンではARNです。物理名がintrinsicで読めないときは、バケットと同じく`PG-IAM-003`で拒否します。この変更で、既存のルールの指摘は変わりません（`main`との差分で確認しました）。CodeBuildが自動で付けるログとレポートグループのStatementの`Resource`が、`*`から名前入りの形に変わります。

English: the extractor now reads the role-bearing resources (`AWS::Lambda::Function` `Role`, `AWS::CodeBuild::Project` `ServiceRole`, `AWS::StepFunctions::StateMachine` `RoleArn`) into the optional `resources` of the model. The role is identified by `Fn::GetAtt [<role>, Arn]` or by an ARN whose role name equals a role of the template; a parameter, an import, a role outside the template, another attribute, `Fn::If`, or a missing property gives `roleUnknown`, and an unreadable physical name gives `nameUnknown`. No rule uses these fields yet. `Ref` and `GetAtt Arn` of these three kinds are now read exactly (name or opaque name `_generated_<LogicalId>`, over the three partitions) instead of `*`; a physical name that is an intrinsic is rejected with `PG-IAM-003`, like a bucket. No finding of an existing rule changes.

## ロール自身がIAMを書き換える経路（`PG-IAM-005`）

spec `proofgate-self-escalation`で加えたルールです。ロールが自分でIAMを書き換えられると、どの保護対象バケットにも届く権限を後から得られます。今のポリシーがバケットに届かなくても、指摘します。対象の形は3つで、アクションの表は`packages/core/src/policy-write-actions.ts`です（出典は`.kiro/specs/proofgate-self-escalation/data-verification.md`）。

- **自分への付与**: `iam:PutRolePolicy`か`iam:AttachRolePolicy`を、自分のロールのARNを表しうる`Resource`に対して持つ。`*`、`arn:aws:iam::*:role/*`、自分の名前に一致するパターンが入ります。保護対象バケットごとに1件です。
- **乗っ取り**: `iam:UpdateAssumeRolePolicy`を、別のロールTのARNを表しうる`Resource`に対して持ち、Tが保護対象バケットに届く。信頼ポリシーを書き換えれば、Tを引き受けられます。Tが`allowedPassRoleTargets`にあるときは除きます。自分のロールの信頼ポリシーを書き換えても、新しい権限は得られないため、数えません。
- **作成して付与**: `iam:CreateRole`と付与のアクション（`iam:PutRolePolicy`か`iam:AttachRolePolicy`）を持ち、両方の`Resource`が、ロールのARNの形をしていて交わる。作ったロールに任意のポリシーを付け、信頼ポリシーも選べます（Unit 42が2024年に報告した形）。同じ主体とバケットで自分への付与があるときは、そちらだけを報告します。

`Action: "*"`、`iam:*`、`iam:Put*`のようなワイルドカードも、表のアクションに一致すれば数えます。したがって、`Action: "*"`と`Resource: "*"`を持つ管理者ロールは指摘されます。ロールのARNの照合は、PassRoleの要らない経路と同じです。名前のないロールは`_generated_<LogicalId>`として読み、名前の部分にワイルドカードのあるパターンは数えます。ARNでもない裸の名前や論理IDは数えません。パーティション、リージョン、アカウントはコロンを含まない文字列として読みます。作成して付与では、パターンの`*`がコロンも表すため、アカウントが`*`の`role/ci-*`と`role/data-*`も交わります。`iam:CreateRole`の`Path`にはコロンを使えるので、両方に一致するロールを実際に作れます（RS-70）。

主体が意図してIAMを書き換えるロール（ID管理のパイプラインなど）なら、その論理IDを新しい設定項目`allowedPolicyWriters`に入れると、3つの形をすべて許可します。`allowedPassRoleTargets`とは別の項目です。IAMユーザー、グループ、アクセスキー、カスタマー管理ポリシーの書き換えは、モデルの外です。`iam:PermissionsBoundary`などの`Condition`で付与を制限したStatementは、今までどおり`PG-IAM-003`で拒否します。Leanは、3つ目の構造`PolicyWritePath`の一覧を検査します（`docs/PROOFS.md`）。

English: rule `PG-IAM-005` (spec `proofgate-self-escalation`). A role that can change IAM itself can give itself access to every protected bucket later, so it is reported even if its policy reaches no bucket today. Three shapes, from the table `packages/core/src/policy-write-actions.ts` (evidence in the spec's `data-verification.md`): a self-grant (`iam:PutRolePolicy` or `iam:AttachRolePolicy` on a Resource that may denote its own role ARN, one finding per protected bucket); a take-over (`iam:UpdateAssumeRolePolicy` on another role T that reaches the bucket; excluded if T is in `allowedPassRoleTargets`; the own role does not count); a creation grant (`iam:CreateRole` and a grant action whose role-ARN-shaped Resources intersect; covered by a self-grant of the same principal and bucket). Wildcard actions count, so an administrator role (`Action: "*"` on `*`) is reported. Role ARNs are matched like the paths without PassRole (opaque name for an unnamed role, no bare names, no colon in partition, region, and account). In a creation grant a pattern `*` also stands for a colon, and `iam:CreateRole` accepts a `Path` with a colon, so `role/ci-*` and `role/data-*` with account `*` intersect (RS-70). A role that writes IAM on purpose goes in the new config field `allowedPolicyWriters` (separate from `allowedPassRoleTargets`), which allows all three shapes. Users, groups, access keys, and customer managed policies are outside the model. A statement whose grant is limited by a `Condition` (for example `iam:PermissionsBoundary`) is still rejected with `PG-IAM-003`. Lean checks a third list, `PolicyWritePath` (`docs/PROOFS.md`).

## 起動サービス

1.2.0（予定）から、経路はLambdaに限りません。起動アクションは、AWS Service Referenceから生成した表（`packages/core/src/aws-tables.generated.ts`、879件、2026-11-21）です。`iam:PassRole`を認可に含む操作の、書き込みまたは権限管理のアクションで、値はロールを渡せるサービスプリンシパル（`iam:PassedToService`）です。起点ロールが起動アクションを持ち、対象ロールがそのサービスを信頼していれば、条件2と3が成り立ちます。例: `ecs:RunTask`と`ecs-tasks.amazonaws.com`、`ec2:RunInstances`と`ec2.amazonaws.com`、`codebuild:CreateProject`、`cloudformation:CreateStack`、`states:CreateStateMachine`、`glue:CreateJob`。

- 表のサービスと、渡されるロールが信頼するサービスが違う場合の補足を、手書きの表（`packages/core/src/launch-supplements.ts`）で足します。現在の項目は、`gamelift:CreateFleet`（インスタンスロールは`ec2.amazonaws.com`）と、`apprunner:CreateService`、`apprunner:UpdateService`（`tasks.apprunner.amazonaws.com`と`build.apprunner.amazonaws.com`）です。
- 表にサービスの値がない23件（`cognito-idp:CreateUserPool`など）は、どのサービスにも渡せるものとして読みます（過剰検出の側）。
- リージョン付きのサービスプリンシパル（`states.us-east-1.amazonaws.com`）は、リージョンなしの形として読みます。
- Trust Policyの`*`は、起点ロールが起動できるどのサービスにも引き受けられるものとして読みます（過剰検出の側）。
- 渡せて保護バケットに届くロールが、表のどの値にもないサービスを信頼していると、そのサービスが渡されたロールでコードを動かすかどうかを判断できないため、`PG-IAM-003`で拒否します。

English: a hand-written table (`packages/core/src/launch-supplements.ts`) adds trusted services where the passed role trusts another principal than the table value: `gamelift:CreateFleet` (instance role, `ec2.amazonaws.com`) and `apprunner:CreateService` and `UpdateService` (`tasks.apprunner.amazonaws.com`, `build.apprunner.amazonaws.com`); each entry needs a source.

English: from 1.2.0 (planned) the path is not limited to Lambda. Launch actions come from a table generated from the AWS Service Reference (879 entries, 2026-11-21): write or permission-management actions of operations that authorize `iam:PassRole`, each mapped to the service principals that can receive the role. A principal with a launch action and a target that trusts that service meet conditions 2 and 3. The 23 entries with no service value count for any service; a regional principal is read as the global one; a trust `*` counts for every service the principal can launch (both over-approximations). A passable, bucket-reaching role that trusts a service that is in no value of the table is rejected with `PG-IAM-003`.

Lambdaの起動アクションは、`lambda:CreateFunction`、または`lambda:UpdateFunctionConfiguration`です。`UpdateFunctionConfiguration`は、実行ロール（`Role`）とレイヤー（`Layers`、ほかのアカウントのレイヤーも可）を変えられます（AWS Lambda APIリファレンス、2026-11-20に確認）。そのため、`iam:PassRole`と組み合わせると、コードを更新する権限がなくても、レイヤーのコードを渡したロールで実行できます。`lambda:UpdateFunctionCode`だけでは実行ロールを変えられないため、Lambdaの制御とはみなしません。この変更は指摘を増やす方向だけに働きます。

English: Lambda control is `lambda:CreateFunction` or `lambda:UpdateFunctionConfiguration`. A configuration update can change the execution role (`Role`) and the layers (`Layers`, also from other accounts; AWS Lambda API reference, checked 2026-11-20), so together with `iam:PassRole` it can run layer code as the passed role without a code update. `lambda:UpdateFunctionCode` alone cannot change the role and is not Lambda control. Up to 1.1.1 a configuration update counted only together with a code update. The change can only add findings.

S3のアクセスは、次の2種類のActionで数えます（AWS Service Referenceから生成した表、2026-11-21。1.1.2までは`GetObject`、`PutObject`、`DeleteObject`の3つだけを数えていました）。

- **オブジェクトに対するAction**（`object`リソースを取る44個。`GetObjectVersion`、`DeleteObjectVersion`、`PutObjectAcl`、`PutObjectVersionAcl`、`ReplicateObject`、`RestoreObject`、`AbortMultipartUpload`など）。保護バケットのオブジェクトの集合と交わるResourceで数えます。
- **バケットに対するAction**（7個）。`PutBucketPolicy`、`DeleteBucketPolicy`、`PutBucketAcl`、`PutBucketOwnershipControls`、`PutBucketPublicAccessBlock`は、バケットポリシーやACLで他のプリンシパルにアクセスを与えられます。`PutReplicationConfiguration`は全オブジェクトを別のバケットへ写せます。`PutLifecycleConfiguration`は全オブジェクトを期限切れにできます。バケットのARN自体に届くResourceで数えます。オブジェクトのResource（`bucket/*`）だけでは数えません。

`ListBucket`、`GetBucketPolicy`、`PutBucketTagging`など、データやアクセス権を変えないActionは数えません。アクセスポイントとMulti-Region Access Point経由のアクセスは検査しません。この変更は指摘を増やす方向だけに働きます。

English: S3 access is counted for two kinds of actions (tables generated from the AWS Service Reference, 2026-11-21; up to 1.1.2 only `GetObject`, `PutObject`, and `DeleteObject` counted). **Object actions** (the 44 that take the `object` resource, such as `GetObjectVersion`, `DeleteObjectVersion`, `PutObjectAcl`, `ReplicateObject`) count on a Resource that intersects the object set of the protected bucket. **Bucket actions** (7) count on a Resource that reaches the bucket ARN itself, not on `bucket/*` alone: `PutBucketPolicy`, `DeleteBucketPolicy`, `PutBucketAcl`, `PutBucketOwnershipControls`, and `PutBucketPublicAccessBlock` can give others access; `PutReplicationConfiguration` can copy every object; `PutLifecycleConfiguration` can expire every object. Actions that change neither data nor access (`ListBucket`, `GetBucketPolicy`, `PutBucketTagging`) do not count. Access through access points and Multi-Region Access Points is not checked. The change can only add findings.

## IAMリソースのないテンプレート

`AWS::IAM::`で始まる型のリソースが1つもないテンプレート（CognitoのユーザープールやCloudFrontだけのスタックなど）は、**受理します**。検査するIAMプリンシパルがないため、評価もLeanの実行も行わず、何も報告しません。**「証明済み」という意味ではなく、「このテンプレートにIAMのプリンシパルがない」という意味です。** 複数のスタックを持つアプリで、ロールのないスタックが原因でProofGate全体が止まらないようにするための変更です。

次の場合は、IAMがないと言い切れないため、従来どおり`PG-IAM-003`で拒否します（Fail Closed）。

- ネストされたスタック（`AWS::CloudFormation::Stack`）を含む。ロールは別のテンプレートにあるかもしれません。
- `Transform`、`Fn::Transform`、`AWS::Serverless::`のリソースを含む。デプロイ時に、テンプレートにないロールが作られることがあります。
- オブジェクトでない項目や、`Type`が文字列でない項目を含む。
- `Resources`がない。
- `AWS::IAM::`のリソースがあるのに、ロールがない（例: ロールを指さない`AWS::IAM::Policy`）、または、ロールはあるが読める`Statement`が1つもない。
- 保護対象バケットの設定が空、または、テンプレートが読めない。

English: a template with no resource whose type starts with `AWS::IAM::` (for example a stack with only a Cognito user pool or a CloudFront distribution) is **accepted**. There is no IAM principal to check, so neither the evaluator nor Lean runs and nothing is reported. This does **not** mean "proved safe"; it means "no IAM principal in this template". It keeps ProofGate usable for an app with several stacks, some of which have no role. The template stays rejected with `PG-IAM-003` when it cannot be called free of IAM: it contains a nested stack (its roles may be in another template), a `Transform`, an `Fn::Transform`, or an `AWS::Serverless::` resource (roles can be created at deployment that are not in the template), an entry that is not an object or has no string `Type`, or it has no `Resources`; or it has IAM resources but no role (for example an `AWS::IAM::Policy` without a role), or roles with no readable statement; or the protected-bucket configuration is empty or the template cannot be read.
