# 実スタックでの試験結果

この文書は、実際のCDKコードに近い構成（Pattern）でProofGateを試した結果です。PatternはProofGateの対応範囲を決める前に、ふつうのCDKの書き方から選びました。**Patternは標本であり、網羅の主張ではありません。** ここに書いた以外のCDKプロジェクトでProofGateがどう動くかは、この表からは言えません。

対象: `examples/real-stacks`（aws-cdk-lib 2.277.0）。保護対象バケットは`arn:aws:s3:::proofgate-protected-data`です。AWSの認証情報もネットワークも使いません。

## 実行方法

```bash
pnpm build
pnpm real-stacks            # 14 Patternを期待表と比べます（0: 一致、1: 差がある、2: ハーネスの異常）
pnpm real-stacks --cli all   # 実際のcdk synthのCLIでも確かめます（約1分）
```

1つのPatternを合成するには、`examples/real-stacks`で`pnpm exec cdk synth -c pattern=RS-02`（ProofGateあり: `PROOFGATE=1`）を使います。

## 評価用の14 Pattern（RS-01〜RS-14）

正解（ground truth）はAWSの意味論に基づいてレビューで決めた値で、ProofGateの結果とは独立です。予想（Predicted）は、どのPatternもProofGateで実行する前にコミットしました（`data/predictions.json`）。1.0.1の予想に外れはありませんでした。

1.0.1では14件中8件が`PG-IAM-003`（未対応）でした。主な原因は、リテラルではない`Resource`、管理ポリシー、信頼ポリシーの`Condition`です。後続のspec `proofgate-cdk-construct-support`で、これらの一部を読めるようにしました（`docs/SUPPORTED_IAM.md`）。現在の結果は、その目標どおりです。

| ID    | Pattern                                                         | Ground truth | In scope            | Predicted (1.0.1) | 1.0.1      | 1.0.1 reasons                                                        | Current    | Current class                   |
| ----- | --------------------------------------------------------------- | ------------ | ------------------- | ----------------- | ---------- | -------------------------------------------------------------------- | ---------- | ------------------------------- |
| RS-01 | Literal roles, the data role reaches another bucket             | safe         | yes                 | accepted          | accepted   | -                                                                    | accepted   | correct acceptance              |
| RS-02 | Literal roles, a complete escalation path                       | unsafe       | yes                 | PG-IAM-004        | PG-IAM-004 | -                                                                    | PG-IAM-004 | correct detection               |
| RS-03 | A prefix grant, a ? wildcard, and split Lambda statements       | unsafe       | yes                 | PG-IAM-004        | PG-IAM-004 | -                                                                    | PG-IAM-004 | correct detection               |
| RS-04 | The same path, written as role-level inline policies            | unsafe       | yes                 | PG-IAM-004        | PG-IAM-004 | -                                                                    | PG-IAM-004 | correct detection               |
| RS-05 | A Lambda function with bucket.grantRead                         | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, managed policy, vacuous proof                  | accepted   | correct acceptance              |
| RS-06 | A role with bucket.grantReadWrite                               | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, vacuous proof                                  | accepted   | correct acceptance              |
| RS-07 | A Step Functions state machine that invokes a Lambda function   | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, trust Condition, managed policy, vacuous proof | accepted   | correct acceptance              |
| RS-08 | An ECS Fargate task with grantReadWrite on the task role        | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, vacuous proof                                  | accepted   | correct acceptance              |
| RS-09 | An EventBridge rule with a Lambda target                        | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | managed policy, vacuous proof                                        | accepted   | correct acceptance              |
| RS-10 | A CodeBuild project that can pass any role and create functions | unsafe       | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource                                                 | PG-IAM-004 | correct detection               |
| RS-11 | The escalation path next to an unrelated grantRead              | unsafe       | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, managed policy                                 | PG-IAM-004 | correct detection               |
| RS-12 | A policy variable in a resource                                 | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | policy variable, vacuous proof                                       | PG-IAM-003 | rejected as unsupported         |
| RS-13 | The escalation path crosses two stacks                          | unsafe       | no (cross-template) | accepted          | accepted   | -                                                                    | accepted   | outside the documented boundary |
| RS-14 | The author acknowledges the finding                             | unsafe       | no (acknowledged)   | accepted          | accepted   | -                                                                    | accepted   | outside the documented boundary |

- 「outside the documented boundary」は、経路がモデルの範囲外にあるPatternです。RS-13は経路が2つのスタックにまたがり、RS-14は作者がCDKの`acknowledge`で指摘を消しています。どちらもProofGateは受理します。
- RS-12は、`Resource`にIAMポリシー変数があるため、今も`PG-IAM-003`です（正解はsafeですが、変数は評価しません）。

## ホールドアウトの8 Pattern（RS-15〜RS-22）

規則の設計に使わず、正解と予想を実装の前にコミットし（`data/holdout-predictions.json`）、実装の後に1回だけ実行しました（`data/holdout-results.json`）。8件すべてが予想どおりでした。

| ID    | Pattern                                                                        | Ground truth | In scope            | 1.0.1      | Predicted after | Observed after | Class                           | Reasons        |
| ----- | ------------------------------------------------------------------------------ | ------------ | ------------------- | ---------- | --------------- | -------------- | ------------------------------- | -------------- |
| RS-15 | An API Gateway REST API with a Lambda integration                              | safe         | yes                 | PG-IAM-003 | PG-IAM-003      | PG-IAM-003     | rejected as unsupported         | managed policy |
| RS-16 | An SQS queue with grantSendMessages to a Lambda function                       | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-17 | A DynamoDB table with grantReadWriteData to a Lambda function                  | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-18 | A Lambda function with an S3 event source                                      | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-19 | A KMS key with grantEncryptDecrypt to a role                                   | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-20 | A deploy role passes an unnamed execution role that reads the protected bucket | unsafe       | yes                 | PG-IAM-003 | PG-IAM-004      | PG-IAM-004     | correct detection               | -              |
| RS-21 | A deploy role passes an unnamed execution role that reads another bucket       | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-22 | A deploy role passes an imported role                                          | unsafe       | no (cross-template) | accepted   | accepted        | accepted       | outside the documented boundary | -              |

- RS-15は、API Gatewayのログ用ロールが、表にない管理ポリシー`AmazonAPIGatewayPushToCloudWatchLogs`を使うため、今も`PG-IAM-003`です。
- RS-20とRS-21は、実装から完全には独立していません。値リゾルバの欠陥を見つけた単体テストが、この2つの構成を写しているためです。

## npmの1.1.1を使った試用（2026-11-20）

npmから`@proofgate-cdk/cdk-plugin@1.1.1`を入れた、リポジトリの外の小さなCDKアプリで試しました（aws-cdk-lib 2.277.0、保護バケットは名前を固定した`arn:aws:s3:::proofgate-trial-customer-data`）。各構成の予想は実行の前に書きました。18構成すべてが予想どおりでした。ProofGateなしの`cdk synth`は、すべて成功しました。この試用アプリはリポジトリに含めていません。

| 構成                 | 内容                                                                                                          | ProofGateあり                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `safe`               | `grantRead`で保護バケットを読むLambda                                                                         | 受理                              |
| `risky`              | safeに、実行ロールを`role.roleArn`で渡せる`iam:PassRole`と`lambda:CreateFunction`を持つデプロイ用ロールを追加 | `PG-IAM-004`                      |
| `apigw`              | REST API（CDKがログ用ロールに管理ポリシー`AmazonAPIGatewayPushToCloudWatchLogs`を付ける）                     | `PG-IAM-003`                      |
| `apigw-no-log-role`  | apigwに`cloudWatchRole: false`                                                                                | 受理                              |
| `parameter`          | バケット名をCloudFormationパラメータで受け取るStatement                                                       | `PG-IAM-003`                      |
| `sqs`                | SQSのイベントソース                                                                                           | 受理                              |
| `dynamodb`           | `grantReadWriteData`                                                                                          | 受理                              |
| `stepfunctions`      | LambdaをStep Functionsから呼ぶ                                                                                | 受理                              |
| `ecs`                | Fargateのタスクロールが保護バケットを読む                                                                     | 受理                              |
| `all-risky`          | sqs、dynamodb、stepfunctions、ecs、riskyの全部                                                                | `PG-IAM-004`（経路は1本）         |
| `pass-wildcard`      | `iam:PassRole`を`arn:aws:iam::*:role/*`で許可                                                                 | `PG-IAM-004`                      |
| `pass-prefix`        | `iam:PassRole`を`role/TrialStack-*`（アカウントはトークン）で許可                                             | `PG-IAM-004`                      |
| `grant-pass`         | `role.grantPassRole(deployer)`                                                                                | `PG-IAM-004`                      |
| `update-pair`        | 作成ではなく、設定の更新とコードの更新                                                                        | `PG-IAM-004`                      |
| `update-config-only` | 設定の更新だけ                                                                                                | 受理（見逃しの候補）              |
| `admin-managed`      | デプロイ用ロールに`AdministratorAccess`                                                                       | `PG-IAM-003`                      |
| `cross-stack`        | デプロイ用ロールを別スタックに置き、ARNをスタック間参照で渡す                                                 | `PG-IAM-003`（`Fn::ImportValue`） |
| `acknowledged`       | riskyを`acknowledge`で抑止                                                                                    | 受理（範囲外）                    |

この試用で分かったこと:

- `update-config-only`は、今の規則の定義どおり受理されます。規則は、既存の関数の乗っ取りを「設定の更新とコードの更新の両方」がそろったときだけ数えるためです。ところがAWSのAPIリファレンスでは、`UpdateFunctionConfiguration`だけで実行ロール（`Role`）とレイヤー（`Layers`、ほかのアカウントのものも可）を変えられます。そのため、コードの更新なしで任意のコードを動かせる可能性があります。修正タスクとして扱います（`CHANGELOG.md`を参照）。
- `ecs`のタスクロールは保護バケットを読めますが、指摘は出ません。`PG-IAM-004`が見るのはLambdaを使う経路だけで、`iam:PassRole`と`ecs:RunTask`のようなECSの経路は検査の対象外です。
- `cross-stack`は、ARNをスタック間参照で渡したため`PG-IAM-003`になりました。ARNを文字列で直接書いた場合（RS-13）は受理されます。
- 保護バケットには`bucketName`を付けて、リテラルのARNで指定しました。名前のないバケットを保護対象にすると経路を見逃します（`docs/ASSUMPTIONS.md`）。

## 構成の試し（RS-23〜RS-38）と起動サービス（RS-39〜RS-47）（spec proofgate-brushup、2026-11-21）

よく使うCDKの構成16個を、1.1.2と今のコードで試しました。今のコードの結果は、実装の前にコミットした予想（`examples/real-stacks/data/construct-probe-predictions.json`）とすべて一致しました。どれも危険な経路はありません（正解は安全）。1.1.2では5件が`PG-IAM-003`でした。原因は、管理ポリシー`AWSLambdaVPCAccessExecutionRole`、IAMリソースのないテンプレート（2件）、`Fn::Sub`（2件）です。

| ID    | 構成                                                           | 1.1.2      | 今のコード |
| ----- | -------------------------------------------------------------- | ---------- | ---------- |
| RS-23 | VPC内のLambda関数                                              | PG-IAM-003 | accepted   |
| RS-24 | X-Rayのトレースを有効にしたLambda関数                          | accepted   | accepted   |
| RS-25 | logRetentionを付けたLambda関数                                 | accepted   | accepted   |
| RS-26 | 専用のロググループを持つLambda関数                             | accepted   | accepted   |
| RS-27 | Lambdaを購読するSNSトピック                                    | accepted   | accepted   |
| RS-28 | Kinesisストリームの`grantRead`                                 | accepted   | accepted   |
| RS-29 | Secrets Managerのシークレットの`grantRead`                     | accepted   | accepted   |
| RS-30 | Cognitoのユーザープール                                        | PG-IAM-003 | accepted   |
| RS-31 | 保護対象バケットをS3オリジンにしたCloudFront                   | PG-IAM-003 | accepted   |
| RS-32 | 保護対象バケットへのBucketDeployment                           | PG-IAM-003 | accepted   |
| RS-33 | SSMを呼ぶAwsCustomResource                                     | accepted   | accepted   |
| RS-34 | インラインのbuildspecを持つCodeBuildプロジェクト               | accepted   | accepted   |
| RS-35 | ALB付きのFargateサービス                                       | accepted   | accepted   |
| RS-36 | Lambdaを呼ぶEventBridgeの定期ルール                            | accepted   | accepted   |
| RS-37 | `autoDeleteObjects`を付けたバケット                            | PG-IAM-003 | accepted   |
| RS-38 | アカウントとリージョンから作ったSSMのStatementを持つLambda関数 | accepted   | accepted   |

起動サービスの9 Patternは、`pnpm real-stacks --launch`で試します。今のコードの結果は、予想（`launch-probe-predictions.json`）とすべて一致しました。1.1.2は、危険な8件のうち7件を受理していました（見逃し）。RS-40は、インスタンスプロファイルを読めなかったため`PG-IAM-003`でした。

| ID    | 構成                                                               | 正解                   | 1.1.2      | 今のコード |
| ----- | ------------------------------------------------------------------ | ---------------------- | ---------- | ---------- |
| RS-39 | `iam:PassRole`と`ecs:RunTask`                                      | 危険                   | accepted   | PG-IAM-004 |
| RS-40 | `iam:PassRole`と`ec2:RunInstances`（インスタンスプロファイル付き） | 危険                   | PG-IAM-003 | PG-IAM-004 |
| RS-41 | `iam:PassRole`と`codebuild:CreateProject`                          | 危険                   | accepted   | PG-IAM-004 |
| RS-42 | `iam:PassRole`と`cloudformation:CreateStack`                       | 危険                   | accepted   | PG-IAM-004 |
| RS-43 | `iam:PassRole`と`states:CreateStateMachine`                        | 危険                   | accepted   | PG-IAM-004 |
| RS-44 | Lambdaの経路で、データロールが`s3:GetObjectVersion`だけ            | 危険                   | accepted   | PG-IAM-004 |
| RS-45 | Lambdaの経路で、データロールが`s3:PutBucketPolicy`だけ             | 危険                   | accepted   | PG-IAM-004 |
| RS-46 | RS-39から`ecs:RunTask`を除いたもの                                 | 安全                   | accepted   | accepted   |
| RS-47 | ProofGateの知らないサービスを信頼する、渡せるロール                | 不明（危険として記録） | accepted   | PG-IAM-003 |

## インシデントの形をしたPattern（RS-48〜RS-53）とpathfinding.cloudの91経路（Step 7、2026-11-22）

公開されたインシデントや攻撃手法の形をしたPatternを6つ作り、実行の前に予想をコミットしてから（`examples/real-stacks/data/incident-probe-predictions.json`）、`pnpm real-stacks --incident`で試しました。結果は`incident-probe-results.json`にあります。分類は`.kiro/steering/direction-research.md`のものです（A: PassRoleと起動アクション、B: 既存リソースの書き換え、C: 自己昇格、C': ロールの連鎖、D: リソースポリシーによる露出）。正解はすべて「危険」です。

| ID    | 構成                                                                                     | 分類 | 予想       | 結果       |
| ----- | ---------------------------------------------------------------------------------------- | ---- | ---------- | ---------- |
| RS-48 | Sysdig 2025型: 既存のLambda関数のコード更新（`lambda:UpdateFunctionCode`）               | B    | accepted   | accepted   |
| RS-49 | Unit 42 2024型: `iam:AttachRolePolicy`を`*`に                                            | C    | accepted   | accepted   |
| RS-50 | Capital One風: `iam:PassRole`を`*`、`ec2:*`、バケットを読むインスタンスロール            | A    | PG-IAM-004 | PG-IAM-004 |
| RS-51 | 暗号資産の採掘型: `iam:PassRole`を`*`、`ecs:RunTask`                                     | A    | PG-IAM-004 | PG-IAM-004 |
| RS-52 | ロールの連鎖: パイプラインのロールが、アカウントを信頼するデータロールを`sts:AssumeRole` | C'   | accepted   | PG-IAM-003 |
| RS-53 | バケットを読むロールで動く関数の、公開関数URL（`AuthType: NONE`）                        | D    | accepted   | accepted   |

- 分類Aの2件は検出しました。見逃しは、まだ対応していない分類B、C、Dの3件で、予想どおりです。
- RS-52は、予想では受理でしたが、拒否（`PG-IAM-003`）でした。CDKの`AccountPrincipal`は`Fn::Join`と`Ref AWS::Partition`で書かれ、信頼ポリシーの中では読めないためです。リテラルのアカウントARNなら、このテンプレートは受理され、連鎖は見逃します。
- RS-48は、Sysdigの報告（2025-11-28）と同じ形です。`proofgate-implicit-role-paths`の最初の対象です。

次に、Datadogの[pathfinding.cloud](https://pathfinding.cloud/)（Apache-2.0）のAWSの91経路を、「攻撃者ロール（必要な権限）と、保護バケットを読む対象ロール」の2ロールのモデルにして、ProofGateが指摘するかを測りました（`tests/pathfinding-benchmark.test.ts`、データは`tests/data/pathfinding-cloud/`）。予想（`predictions.json`）は実行前にコミットしました。

| 分類                | 経路数 | `PG-IAM-004` | `PG-IAM-003` | 受理（見逃し） |
| ------------------- | ------ | ------------ | ------------ | -------------- |
| `new-passrole`      | 47     | 44           | 1            | 2              |
| `existing-passrole` | 22     | 0            | 0            | 22             |
| `principal-access`  | 14     | 0            | 0            | 14             |
| `self-escalation`   | 8      | 0            | 0            | 8              |

- 指摘したのは44件です。`new-passrole`の47件のうち44件（`cloudformation-005`はPassRoleのない経路で、受理）です。`existing-passrole`（22件、PassRoleのない経路）、`principal-access`（14件）、`self-escalation`（8件）は、まだ対応していないため、すべて受理です。
- 予想と違ったのは3件です。`cognitoidentity-001`は、予想より良く検出しました。`apprunner-001`は、信頼先のサービス（`tasks.apprunner.amazonaws.com`）が起動アクションの表の値（`bullet.amazonaws.com`）と違うため、検出ではなく`PG-IAM-003`で拒否しました。`gamelift-001`は**見逃し**です。フリートのインスタンスロールは`ec2.amazonaws.com`を信頼しますが、表は`gamelift:CreateFleet`を`gamelift.amazonaws.com`に結びつけているため、信頼先が一致しません。EMRやImage Builderのように、EC2のインスタンスロールを渡すサービスでも同じ種類のずれが起こりえます。直す案は「起動サービスがインスタンスプロファイルを渡すときは、`ec2.amazonaws.com`への信頼も数える」です。指摘を増やす方向だけの変更で、別のspecで扱います。
- 上の2件（`apprunner-001`、`gamelift-001`）は、同じ日に直しました（`launch-supplements.ts`）。直した後は、91件中46件を指摘し、45件が受理（まだ対応していない分類B、C）です。
- ベンチマークのモデルの誤りが2件ありました（`cloudformation-004`、`batch-001`）。モデルを直して、`results.json`に書きました。
- このベンチマークは、攻撃の前提（権限の組み合わせ）だけを再現します。実際に攻撃が成立するかは見ていません。

## PassRoleの要らない経路（RS-54〜RS-62、spec proofgate-implicit-role-paths、2026-11-22）

9つのPatternを、実装の前に予想をコミットしてから（`implicit-probe-predictions.json`）、`pnpm real-stacks --implicit`で試しました。実装前の`main`では、9件すべてが受理でした（危険な5件と、特定できないロールの1件は見逃し）。実装後は、予想とすべて一致しました。

| ID    | 構成                                                                | `main`（実装前） | 予想       | 結果       |
| ----- | ------------------------------------------------------------------- | ---------------- | ---------- | ---------- |
| RS-54 | `lambda:UpdateFunctionCode`、関数のロールがバケットを読む           | accepted         | PG-IAM-004 | PG-IAM-004 |
| RS-55 | `lambda:UpdateFunctionConfiguration`、同上                          | accepted         | PG-IAM-004 | PG-IAM-004 |
| RS-56 | `codebuild:StartBuild`、プロジェクトのロールがバケットを読む        | accepted         | PG-IAM-004 | PG-IAM-004 |
| RS-57 | `codebuild:StartBuildBatch`、同上                                   | accepted         | PG-IAM-004 | PG-IAM-004 |
| RS-58 | `states:UpdateStateMachine`、ステートマシンのロールがバケットを読む | accepted         | PG-IAM-004 | PG-IAM-004 |
| RS-59 | `StartBuild`を、バケットに届かない別のプロジェクトのARNに絞る       | accepted         | accepted   | accepted   |
| RS-60 | 関数のロールが別のバケットだけを読む                                | accepted         | accepted   | accepted   |
| RS-61 | 関数のロールがパラメータ（特定できない）                            | accepted         | PG-IAM-003 | PG-IAM-003 |
| RS-62 | 自分自身が動いている関数を変更するロール                            | accepted         | accepted   | accepted   |

- RS-48（Sysdig 2025型）は、実装前は見逃しでしたが、実装後は`PG-IAM-004`です。
- RS-59は、リゾルバの絞り込み（`GetAtt Arn`を`*`ではなくARNにする）の確認です。`*`と読んでいたら、プロジェクトAに一致して誤検出になります。
- pathfinding.cloudの91経路は、52件を指摘するようになりました（修正前46件）。増えたのは、`lambda-003`、`lambda-004`、`lambda-005`、`codebuild-002`、`codebuild-003`、`stepfunctions-002`の6件です。指摘は52件、受理は39件（PassRoleの要らない残り16件、`principal-access`の14件、`self-escalation`の8件、`new-passrole`の1件）です。

## 今のコードを使った試用（2026-11-22）

1.1.1の試用と同じアプリ（18の変種）で、npmの1.1.2と、このリポジトリの今のコード（パッケージにしたtarball）を比べました。違いは1つだけです。

- `apigw`（REST APIのCloudWatchロールに管理ポリシー`AmazonAPIGatewayPushToCloudWatchLogs`が付く）: 1.1.2では`PG-IAM-003`、今のコードでは受理です。`cloudWatchRole: false`は不要になりました。
- そのほかの17の変種は同じ結果です（`update-config-only`は1.1.2から`PG-IAM-004`）。`ecs`のタスクロールは保護対象バケットを読みますが、ロールを渡せる主体がないため受理します。
- 違反の文面は、サービスと起動アクションを書くようになりました（例: `... can pass role ReaderServiceRole... to lambda.amazonaws.com and launch it (lambda:CreateFunction) ...`）。

## Leanの検査が示すこと

Leanは、TypeScriptが計算した4つの事実（`canPassRole`、`canLaunch`、`targetTrustsService`、`targetCanAccess`。1.1.2までは`canControlLambda`と`targetIsLambdaAssumable`）を検査します。CloudFormationテンプレートやIAM Statementの意味そのものを検証するものではありません。抽出器、値リゾルバ、管理ポリシーの表は信頼する実装です（`docs/ASSUMPTIONS.md`）。
