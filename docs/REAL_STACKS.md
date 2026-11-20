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

## Leanの検査が示すこと

Leanは、TypeScriptが計算した4つの事実（`canPassRole`、`canControlLambda`、`targetIsLambdaAssumable`、`targetCanAccess`）を検査します。CloudFormationテンプレートやIAM Statementの意味そのものを検証するものではありません。抽出器、値リゾルバ、管理ポリシーの表は信頼する実装です（`docs/ASSUMPTIONS.md`）。
