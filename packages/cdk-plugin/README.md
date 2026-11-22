# @proofgate-cdk/cdk-plugin

Leanでアプリケーション固有のIAM安全条件を検査する、AWS CDK Validation Pluginです。

## インストール

```bash
pnpm add @proofgate-cdk/cdk-plugin aws-cdk-lib
```

Node.js 26以降と、`elan`で導入したLean 4 / Lakeが必要です。Leanのバージョンはパッケージに同梱した`lean/lean-toolchain`で固定されています。プラグインは初回検証時に同梱Leanプロジェクトを自動ビルドし、同じ`synth`内では成果物を再利用します。

## CDKへの導入

```ts
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { App, Validations } from "aws-cdk-lib";

const app = new App();

Validations.of(app).addPlugins(
  new ProofGateValidator({
    protectedBucketArns: ["arn:aws:s3:::production-data"],
  }),
);
```

プラグインは`cdk synth`中に合成済みCloudFormationを読み取り、危険な権限昇格経路を`PG-IAM-004`、ロールが自分でIAMを書き換えられる構成を`PG-IAM-005`、未対応構文やツールチェーン障害を`PG-IAM-003`として報告します。
検査する経路は、次の2つです。(1) `iam:PassRole`と起動サービス（Lambda、ECS、EC2、CodeBuild、Step Functionsなど）の操作の組み合わせで、渡したロールが保護対象バケットへ届くもの。(2) `iam:PassRole`なしで、保護対象バケットへ届くロールで動いている既存のLambda関数、CodeBuildプロジェクト、Step Functionsのステートマシンを変更できるもの（`lambda:UpdateFunctionCode`、`codebuild:StartBuild`など）。どちらも`PG-IAM-004`です。`allowedPassRoleTargets`に挙げたロールは、両方の経路で許可されます。(3) ロールが、自分のロールにポリシーを付けられる（`iam:PutRolePolicy`、`iam:AttachRolePolicy`）、バケットに届く別のロールの信頼ポリシーを書き換えられる（`iam:UpdateAssumeRolePolicy`）、ロールを作ってポリシーを付けられる（`iam:CreateRole`と付与）もの。これは`PG-IAM-005`で、`Action: "*"`の管理者ロールも入ります。意図してIAMを書き換えるロールは、論理IDを`allowedPolicyWriters`に入れると許可されます。

`Resource`にIAMポリシー変数（`${aws:username}`など）を含むStatementは、評価せず未対応として`PG-IAM-003`で拒否します。

## 導入の注意

- 保護対象バケットは、固定の名前（`bucketName`）とリテラルのARNで指定します。`bucket.bucketArn`はトークンなので使えません。
- 普段の`synth`に影響させないため、`if (process.env.PROOFGATE === "1")`の中で登録し、`PROOFGATE=1 npx cdk synth`で検査します。
- 読む管理ポリシーは7件だけです（`AWSLambdaBasicExecutionRole`、`AWSLambdaVPCAccessExecutionRole`、`AmazonAPIGatewayPushToCloudWatchLogs`、`AmazonSSMManagedInstanceCore`、`AWSGlueServiceRole`、Backupの2件）。ほかの管理ポリシーや、`Resource`のパラメータ、`Fn::ImportValue`は`PG-IAM-003`になります。
- IAMリソースのないテンプレートは受理します。検査するプリンシパルがないからで、「証明済み」という意味ではありません。
- SCP、Permissions Boundary、リソースポリシー、条件、スタックをまたぐ参照、CloudFormationのスタックロール、PassRoleの要らない経路のうち上の3種類以外のサービス（ECS、SSM、Glueなど）、IAMユーザーとグループ、ロールの連鎖は、モデルの外です。

English: the path is `iam:PassRole` plus a launch action of a service (Lambda, ECS, EC2, CodeBuild, Step Functions, and others) whose passed role reaches a protected bucket. Paths without `iam:PassRole` (changing an existing Lambda function, CodeBuild project, or state machine) are `PG-IAM-004` too. A role that can change IAM itself (self-grant, take-over, creation grant; administrator roles included) is `PG-IAM-005`; list a role that writes IAM on purpose in `allowedPolicyWriters`. Use a fixed bucket name and a literal ARN, and register the plugin under `PROOFGATE=1`. Only seven managed policies are read. A template without IAM resources is accepted because there is nothing to check, not because it was proved safe.

詳細な対応IAM構文と信頼境界は、[ProofGateリポジトリ](https://github.com/mashharuki/proofgate)を参照してください。
