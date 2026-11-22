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

## 今のコードを使った試用（2026-11-22）

1.1.1の試用と同じアプリ（18の変種）で、npmの1.1.2と、このリポジトリの今のコード（パッケージにしたtarball）を比べました。違いは1つだけです。

- `apigw`（REST APIのCloudWatchロールに管理ポリシー`AmazonAPIGatewayPushToCloudWatchLogs`が付く）: 1.1.2では`PG-IAM-003`、今のコードでは受理です。`cloudWatchRole: false`は不要になりました。
- そのほかの17の変種は同じ結果です（`update-config-only`は1.1.2から`PG-IAM-004`）。`ecs`のタスクロールは保護対象バケットを読みますが、ロールを渡せる主体がないため受理します。
- 違反の文面は、サービスと起動アクションを書くようになりました（例: `... can pass role ReaderServiceRole... to lambda.amazonaws.com and launch it (lambda:CreateFunction) ...`）。

## Leanの検査が示すこと

Leanは、TypeScriptが計算した4つの事実（`canPassRole`、`canLaunch`、`targetTrustsService`、`targetCanAccess`。1.1.2までは`canControlLambda`と`targetIsLambdaAssumable`）を検査します。CloudFormationテンプレートやIAM Statementの意味そのものを検証するものではありません。抽出器、値リゾルバ、管理ポリシーの表は信頼する実装です（`docs/ASSUMPTIONS.md`）。
