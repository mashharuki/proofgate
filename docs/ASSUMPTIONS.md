# 前提と信頼境界

## 検査するもの

ProofGateは抽出した有限モデルについて、次の4条件を同時に満たすプリンシパルからの経路が存在しないことを検査します。

- 対象ロールへの、対応範囲内の`iam:PassRole`権限がある
- 対応範囲内の起動アクション（ロールを渡せる操作。Lambda、ECS、EC2など、生成した表に載っているもの）の権限がある
- 対象ロールが、その起動サービスを信頼している
- 対象ロールが設定された保護対象S3バケットへ、対応範囲内のアクセス権限を持っている
  - 保護対象バケット内の一部のプレフィックスや単一オブジェクトへのアクセスも、アクセスを持つものとして扱います

## 信頼するもの

- CloudFormation ExtractorとAction・Resource Matcherの実装
- TypeScriptからLeanへのGenerator
- バージョン固定済みLeanコンパイラ、`native_decide`が使用するランタイム、Leanカーネル
- 合成されたCloudFormationテンプレートが予定されるデプロイ内容を表していること
- AWS IAMと各起動サービスが公開仕様どおりに動作すること
- AWS Service Referenceの`iam:PassedToService`の値が正しいこと（起動アクションの表はこの値から生成します）

## 現在の検査対象外

- SCP、Permissions Boundary、Session Policy、Resource Policy、Explicit Denyの評価
- 推移的なロール引き受け、スタック間参照、クロスアカウント参照
- サービス信頼以外の各サービス固有の制約（たとえば、ECSのインフラストラクチャロールのように、渡せてもS3に触れないロール。表は経路を多めに数えます）と`iam:PassedToService` Condition
- `iam:PassRole`を必要としない経路（既存の関数のコード更新、CodeBuildのbuildspecの上書きなど）。spec `proofgate-implicit-role-paths`で扱います
- 表にないManaged Policy（`AWSLambdaBasicExecutionRole`、`AWSLambdaVPCAccessExecutionRole`、`AmazonAPIGatewayPushToCloudWatchLogs`の3件だけを読みます）、ポリシー変数、大部分のCloudFormation intrinsic function、権限StatementのIAM Condition
- 検査済みのCDK synthを経由しない変更やデプロイ後のドリフト

Extractorは、未対応の構文を安全とみなさず拒否します。AWSへのデプロイは、意図的にこのリポジトリのデモとテストの対象外にしています。

ResourceにIAMポリシー変数（`${aws:username}`など）を含むStatementは、変数を評価せず`PG-IAM-003`で拒否します。これは以前より多くの入力を拒否する変更です。
名前のないロール（`RoleName`なし）は、不透明な名前`_generated_<LogicalId>`として扱います。ロール名部分にワイルドカードを含む`iam:PassRole`のResourceは、実際の生成名に一致しうるものとして対象にします。実際の生成名がそのPatternに一致しない場合でも指摘が出ます（過剰検出）。生成名の形式はAWSが規定していないため、この読み方は仮定です。

English: a role without `RoleName` is read as the opaque name `_generated_<LogicalId>`. A `iam:PassRole` Resource with a wildcard in the role-name part counts as a possible match, even if the real generated name would not match (over-approximation). AWS does not specify the format of generated names, so this reading is an assumption.

管理ポリシー`AWSLambdaBasicExecutionRole`の内容は、AWSのドキュメント（2026-11-19に確認、v1）のとおりだと仮定します。AWSが新しい既定バージョンを公開すると、この仮定は古くなります。Trust Policyの`Allow`に付いた`Condition`は引き受けられる主体を狭めるだけだと仮定し、無視します（実際より多くの主体が引き受けられるものとして読むため、指摘が増える側です）。

管理ポリシー`AWSLambdaVPCAccessExecutionRole`（v3）と`AmazonAPIGatewayPushToCloudWatchLogs`（v1）も同じ仮定です（2026-11-21に確認）。どちらもS3と`iam:PassRole`に触れないため、経路は作れません。

English: the content of the managed policies `AWSLambdaVPCAccessExecutionRole` (v3) and `AmazonAPIGatewayPushToCloudWatchLogs` (v1, both checked on 2026-11-21) is assumed the same way; neither touches S3 or `iam:PassRole`. The content of the managed policy `AWSLambdaBasicExecutionRole` is assumed to be that of the AWS documentation (checked on 2026-11-19, v1); a new default version published by AWS makes this assumption stale. A `Condition` on an `Allow` trust statement is assumed to only narrow who can assume the role, so it is ignored (the role is read as assumable by more principals, which only adds findings).

CloudFormationは、バケットの`Ref`にバケット名を、`Fn::GetAtt Arn`に`arn:<パーティション>:s3:::<バケット名>`を、ロールの`Ref`にロール名を、`Fn::GetAtt Arn`にロールのARNを返すと仮定します（AWSのCloudFormationテンプレートリファレンス、2026-11-19に確認）。パーティションは`aws`、`aws-cn`、`aws-us-gov`のいずれかだと仮定します（IAMユーザーガイドのARNの形式）。新しいパーティションが加わると、この仮定は古くなります。Allowの中の未知の部分（リージョン、アカウントID、ほかのリソースの物理ID）は`*`として読み、経路を隠さないと仮定します。保護バケットは、同じテンプレートの名前のない`AWS::S3::Bucket`ではないと仮定します。名前のないバケットは不透明な名前で表し、リテラルの保護バケット名とは交わらないものとして読むためです。前回のデプロイで生成された名前を保護バケットとして設定し、そのバケットがテンプレートでは名前のないままの場合、経路を見逃します。この場合は、テンプレートでバケットに`BucketName`を付けてください。

English: CloudFormation is assumed to return the documented values for `Ref` and `Fn::GetAtt Arn` of buckets and roles (CloudFormation template reference, checked 2026-11-19). The partition is assumed to be one of `aws`, `aws-cn`, `aws-us-gov` (IAM User Guide, ARN format); a new partition makes this stale. Unknown parts of an `Allow` (region, account id, physical IDs of other resources) are read as `*`, which cannot hide a path. The protected bucket is assumed not to be an unnamed `AWS::S3::Bucket` of the same template: an unnamed bucket is read as an opaque name that does not meet a literal protected name. If the protected ARN was copied from the generated name of an earlier deployment and the template still gives the bucket no `BucketName`, a path is missed. Give such a bucket a `BucketName`.

`lambda:UpdateFunctionConfiguration`だけでも、既存の関数を渡したロールで動かせるとみなします。根拠は、AWSのドキュメント（2026-11-21にAWS MCP Serverで確認）です。この操作は、実行ロール（`Role`）、レイヤー（`Layers`）、コンテナイメージの起動コマンド（`ImageConfig`の`EntryPoint`と`Command`）を変えられます。コンテナイメージの関数は、設定の更新だけで任意のコマンドを動かせます。zip形式の関数でレイヤーを付けるには、呼び出す側のポリシーに`lambda:GetLayerVersion`が必要です（同じアカウントのレイヤー。ほかのアカウントのレイヤーは、持ち主がresource-based policyで許可します）。ProofGateは`GetLayerVersion`を検査しないため、zip形式の関数で、この権限がない場合は、実際より多く経路を報告します（過剰検出の側です）。

English: `lambda:UpdateFunctionConfiguration` alone is assumed to let a principal run an existing function as the passed role. Basis (AWS documentation, read through the AWS MCP Server on 2026-11-21): the operation can change the execution role (`Role`), the layers (`Layers`), and, for a container-image function, the entry point and command (`ImageConfig`). A container-image function can therefore run any command after a configuration update alone. For a zip function, attaching a layer needs `lambda:GetLayerVersion` in the caller's policy (for a layer of the same account; for another account the owner grants it in a resource-based policy). ProofGate does not check `GetLayerVersion`, so for a zip function without that permission it reports more paths than exist (over-approximation).

AWSのアクションに関する3つの表（S3の`object`リソースを取るアクション、バケットの権限を変えるアクション、`iam:PassRole`を伴う起動アクションと渡し先のサービス）は、AWS Service Reference（`https://servicereference.us-east-1.amazonaws.com/`）から`scripts/sync-service-reference.mjs`で生成し、`packages/core/src/aws-tables.generated.ts`としてコミットします（2026-11-21のスナップショット）。ProofGateは、このデータが正確で、その日付の時点で網羅的だと仮定します。その後にAWSが追加したアクションは表にありません。表の生成は開発時だけで、テストにも、利用者の`cdk synth`にも、ネットワークは使いません。渡し先のサービスがデータに書かれていない23個のアクションは、どのサービスにも渡せるものとして読みます（過剰検出の側です）。起動アクションは、`iam:PassRole`を伴うAPI操作が認可する、書き込みか権限管理のアクションに限ります（2026-11-21の検証で、読み取りのアクションが混ざっていた最初の規則を改めました）。この表と、S3のアクションの表は、AWS MCP Serverで、S3のユーザーガイド、IAM、Access Analyzerの情報と照らして確かめました（`.kiro/specs/proofgate-brushup/data-verification.md`）。`s3:PutReplicationConfiguration`だけでは複製は始まりません。複製用のロールを渡す権限も要るため、このActionをバケットへのアクセスとして数えるのは、推移的な経路を含めて読む、保守的な読み方です。

English: three tables of AWS actions (the S3 actions that take the `object` resource, the bucket actions that change permissions, and the launch actions that come with `iam:PassRole` with the service that receives the role) are generated from the AWS Service Reference (`https://servicereference.us-east-1.amazonaws.com/`) by `scripts/sync-service-reference.mjs` and committed as `packages/core/src/aws-tables.generated.ts` (snapshot of 2026-11-21). ProofGate assumes that the data is accurate and complete on that date. Actions that AWS adds later are not in the tables. The generation is a dev-time step; neither the tests nor a user's `cdk synth` use the network. The 23 actions whose data does not name a receiving service are read as passing the role to any service (over-approximation). Launch actions are limited to the write or permission-management actions that a PassRole-bearing operation authorizes (a first rule that also took read actions was corrected on 2026-11-21). Both tables were checked with the AWS MCP Server against the S3 User Guide, IAM, and IAM Access Analyzer (`.kiro/specs/proofgate-brushup/data-verification.md`). `s3:PutReplicationConfiguration` alone does not start a replication: the caller also needs `iam:PassRole` for a replication role, so counting it as access to the bucket is a conservative, transitive reading.
バケットに対するActionのうち、複製（`PutReplicationConfiguration`）とライフサイクル（`PutLifecycleConfiguration`）は、AWSの「Permissions management」の分類には入っていませんが、データの複製と消失につながるため、判断として数えます。この2つを数えたくない場合は、生成スクリプトではなく、評価器とオラクルの規則を見直す必要があります。

English: of the bucket actions, replication (`PutReplicationConfiguration`) and lifecycle (`PutLifecycleConfiguration`) are not in the AWS "Permissions management" class; they count by judgment because they can copy or remove every object.

IAMリソースのないテンプレートの受理（要件3）は、テンプレートに現れるものだけを根拠にします。CDKがProofGateへ渡すテンプレートの外にあるロール（ネストされたスタックの子テンプレート、`Transform`が作るロール）は検査できないため、それらを含むテンプレートは受理せずに拒否します。ProofGateは、CDKが渡したテンプレートが、デプロイされるものと一致すると仮定します（従来と同じ前提です）。

English: accepting a template without IAM resources rests only on what the template shows. Roles outside the templates that CDK passes (the child template of a nested stack, roles created by a `Transform`) cannot be checked, so a template that contains them is rejected, not accepted. As before, ProofGate assumes that the templates that CDK passes are what is deployed.

## PassRoleの要らない経路の表（spec proofgate-implicit-role-paths）

表のアクションは、リソースを変更できるだけで、新しいコードが動くことを要求しません。動かすのは、呼び出し、トリガー、`StartExecution`、スケジュールなど、別の操作です。その操作は要求しないため、指摘は多めになります（過大判定）。Lambdaのコード署名は、見えません。アクションに付いたCondition（たとえば`buildspecOverride`を禁じる条件）は、今までどおり`PG-IAM-003`で拒否します。名前のないリソースの`Resource`は、名前の部分にワイルドカードがあれば、実際の生成名に一致しうるものとして数えます（過大判定）。`allowedPassRoleTargets`に挙げたロールは、PassRoleの要らない経路も許可したものとして扱います（利用者の決定、2026-11-22）。CloudFormationのスタックロールは、テンプレートから見えないため、対象外です。ECS、SSM、Glue、SageMakerなど、ほかのサービスは、ドキュメントで確認できたものから表に足します。

English: an action of the table only has to be able to change the resource; running the new code (an invoke, a trigger, `StartExecution`, a schedule) is not required, so findings are too many. Lambda code signing is not visible. A `Condition` on the statement stays rejected with `PG-IAM-003`. For an unnamed resource a wildcard in the name part of the Resource counts. A role in `allowedPassRoleTargets` also allows the paths without `iam:PassRole` (the user's decision of 2026-11-22). CloudFormation stack roles are not visible in a template and are out of scope. More services are added to the table after their documentation is read.

## 起動アクションの表（spec proofgate-brushup, Step 5）

起動アクションの表は、AWS Service Referenceの`iam:PassedToService`の値をそのまま信頼します。`iam:PassRole`を認可に含む操作の書き込みと権限管理のアクションを、すべて起動アクションとみなします。中には、ロールを渡してもコードを動かせない操作もあり、指摘が多めになります。値のない23件は、どのサービスにも渡せるものとして読みます（2026-11-21にユーザーが承認）。`iam:*`は、表の`iam:AddRoleToInstanceProfile`（EC2）に一致するため、EC2の起動アクションとして数えます。

English: the launch table trusts the `iam:PassedToService` values of the AWS Service Reference and counts every write or permission-management action of an operation that authorizes `iam:PassRole`. Some of them cannot run code with the role, so findings can be too many. The 23 entries without a value count for any service (approved by the user on 2026-11-21). `iam:*` matches `iam:AddRoleToInstanceProfile` (EC2) and so counts as an EC2 launch action.
