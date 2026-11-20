# ProofGate

## 概要

ProofGateは、AWS CDKが生成したCloudFormationを解析し、危険なIAM権限昇格経路が存在しないことをデプロイ前にLeanで機械検証するCDK Validation Pluginです。

現在の実装では、対応範囲内のIAM構成において、`iam:PassRole`とLambda操作権限を組み合わせ、Lambda実行ロールを経由して保護対象S3バケットへ到達する経路を検査します。安全条件を満たさないスタックは、通常のCDKワークフロー内でデプロイ前に拒否されます。

![ProofGateのアーキテクチャ概念図](docs/images/proofgate-architecture-ja.png)

> [!IMPORTANT]
> ProofGateが現在検証するのは、すべてのIAMロールが一般的な意味で最小権限であることではありません。対応するCloudFormation・IAM構文と設定された保護対象バケットを前提として、上記の特定の権限昇格経路が存在しないことを検証します。

## 解決しようとしている課題

IAMの危険性は、単一のポリシーや単一のロールだけを見ても分からない場合があります。個別には正当そうに見える権限でも、次の権限が異なるロールをまたいで組み合わさると、保護データへ到達する権限昇格経路になります。

1. IAMプリンシパルが対象ロールに対する`iam:PassRole`権限を持っている
2. 同じプリンシパルがLambda関数を作成できる、またはLambda関数のロール設定とコードの両方を更新できる
3. 対象ロールがLambdaサービスを信頼している
4. 対象ロールが設定で指定された保護対象S3バケットへアクセスできる

通常の`cdk synth`は有効なCloudFormationを生成できますが、その構成がアプリケーション固有の安全条件を満たしているかまでは判断しません。人手によるレビューだけで、複数のIAM Statement、信頼ポリシー、Lambda操作権限、S3アクセスの関係を継続的に追跡することも困難です。

ProofGateは、このような「権限の組み合わせによって初めて成立する攻撃経路」を、デプロイ前の再現可能な検証対象にします。

## アプローチ方法

ProofGateは、CDKの合成処理に次の検証パイプラインを追加します。

1. **CloudFormationを取得する**: CDK Validation Pluginとして、`cdk synth`が生成したテンプレートを受け取ります。
2. **IAM情報を抽出する**: ロール、インラインポリシー、信頼関係、`Action`、`Resource`を、CDKに依存しない中間モデルへ変換します。
3. **候補経路を評価する**: TypeScript評価器が、PassRole、Lambda操作、Lambda信頼、保護対象S3アクセスの組み合わせを列挙します。
4. **Leanで安全条件を検査する**: 候補経路からLeanモジュールを生成し、完全な権限昇格経路が存在しないことを固定されたLeanツールチェーンで判定します。
5. **CDKへ結果を返す**: 危険な経路は`PG-IAM-004`として拒否し、未対応構文やTypeScriptとLeanの判定不一致は`PG-IAM-003`としてFail Closedで拒否します。

Leanが検査する事実は、CloudFormationからTypeScriptで抽出・構成された候補経路です。そのため、ProofGateはLeanがIAMやCloudFormationの意味論全体を独立して証明すると主張しません。抽出器とTypeScript評価器はテストおよび独立Oracleで検証し、Leanは生成された安全条件を機械的に検査する、という責務分担を採用しています。

このリポジトリはKiroに依存しません。TypeScript、Lean 4、pnpm、およびAWS CDKの安定版`IPolicyValidationPlugin` APIを使用します。

## 必要な環境

- Node.js 26以降（`.nvmrc`では26.13.1に固定）
- pnpm 11
- `elan`で導入したLean 4 / Lake（正確なバージョンは`packages/cdk-plugin/lean/lean-toolchain`で固定）

## デモの実行

```bash
pnpm install
pnpm build
pnpm lean:build

# 通常のsynthは両方とも成功する
pnpm --filter @proofgate-cdk/safe-app synth
pnpm --filter @proofgate-cdk/vulnerable-app synth

# ProofGateはsafe-appを許可する
pnpm --filter @proofgate-cdk/safe-app synth:proofgate

# ProofGateはvulnerable-appをPG-IAM-004、終了コード1で拒否する
pnpm --filter @proofgate-cdk/vulnerable-app synth:proofgate
```

自動テスト一式は`pnpm test`で実行できます。生成テスト（独立したオラクルとLeanによる照合、CloudFormation断片の読み戻し）の実行方法と環境変数は、[`tests/pbt/README.md`](tests/pbt/README.md)（英語）を参照してください。

コード品質チェックは次のコマンドで実行できます。

```bash
pnpm quality
```

このコマンドはBiomeによるフォーマット・Lint・Assist検査、Knipによる未使用ファイル・依存関係・export検査、jscpdによる重複コード検査を順番に実行します。自動修正可能なBiomeの指摘は`pnpm biome:fix`で修正できます。

## 公開パッケージ

次の4パッケージをnpmへ公開できる構成にしています。

- `@proofgate-cdk/cdk-plugin`: CDK利用者向けのValidation Plugin。固定済みLeanプロジェクトを同梱
- `@proofgate-cdk/core`: TypeScript参照評価器とLeanモジュール生成器
- `@proofgate-cdk/extractor`: CloudFormation IAM Extractor
- `@proofgate-cdk/model`: CDK非依存の中間モデル

公開前に、各tarballのエントリーポイント、型定義、README、ライセンス、Leanソース、workspace依存のsemver変換を検査できます。

```bash
pnpm pack:check
```

実際にnpmへ公開するには、`@proofgate-cdk`スコープを利用できるnpmアカウントまたはOrganizationの設定が別途必要です。

## CDKへの導入

```ts
import { App, Validations } from "aws-cdk-lib";
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";

const app = new App();
Validations.of(app).addPlugins(
  new ProofGateValidator({
    protectedBucketArns: ["arn:aws:s3:::production-data"],
  }),
);
```

プラグインは`IPolicyValidationContext.templatePaths`を読み取り、意図的に範囲を限定したIAMモデルを抽出します。次に、具体的なLeanモジュールを生成し、完全な権限昇格経路が存在しないことをLeanカーネルに検査させます。未対応のポリシー構文は`PG-IAM-003`として報告し、Fail Closedで拒否します。

## 現在の対応範囲

これは最初のEnd-to-End実装であり、完全なIAM評価器ではありません。ローカルのIAMロールと、`Effect`、`Action`、`Resource`がリテラル値で記述されたインラインポリシーに対応しています。デプロイ制御として使用する前に、[対応するIAM構文](docs/SUPPORTED_IAM.md)と[前提・信頼境界](docs/ASSUMPTIONS.md)を確認してください。

未リリースの変更（`CHANGELOG.md`のUnreleased）では、これに加えて、Resourceの`Fn::Join`、疑似パラメータ、同じテンプレート内のバケットとロールへの`Ref`・`Fn::GetAtt`、管理ポリシー`AWSLambdaBasicExecutionRole`、信頼ポリシーの`Allow`に付いた`Condition`を読みます。実際のCDKコードに近い14の構成で試したところ、1.0.1では8件が未対応（`PG-IAM-003`）でした。主な原因は、管理ポリシー、リテラルではない`Resource`、信頼ポリシーの`Condition`です。未リリースの変更では、未対応は14件中1件（IAMポリシー変数）、実装の後に1回だけ試した別の8構成では1件（表にない管理ポリシー）です。これらは標本であり、ほかのプロジェクトで同じ結果になるとは限りません。結果の表は[実スタックでの試験結果](docs/REAL_STACKS.md)にあります。

S3アクセスは、保護対象バケット内の一部（プレフィックスや単一オブジェクト）へのアクセスも検出します。`Resource`にIAMポリシー変数（`${aws:username}`など）を含むStatementは評価せず、`PG-IAM-003`で拒否します。
