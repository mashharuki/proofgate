# ProofGate

ProofGateは、Leanを利用したAWS CDK向けのデプロイ前検証ゲートです。

最初の実装では、合成されたCloudFormationから次の権限昇格経路を検出します。

1. IAMプリンシパルが対象ロールに対する`iam:PassRole`権限を持っている
2. 同じプリンシパルがLambda関数を作成できる、またはLambda関数のロール設定とコードの両方を更新できる
3. 対象ロールがLambdaサービスを信頼している
4. 対象ロールが設定で指定された保護対象S3バケットへアクセスできる

このリポジトリはKiroに依存しません。TypeScript、Lean 4、pnpm、およびAWS CDKの安定版`IPolicyValidationPlugin` APIを使用します。

## 必要な環境

- Node.js 26以降（`.nvmrc`では26.13.1に固定）
- pnpm 11
- `elan`で導入したLean 4 / Lake（正確なバージョンは`lean/lean-toolchain`で固定）

## デモの実行

```bash
pnpm install
pnpm build
pnpm lean:build

# 通常のsynthは両方とも成功する
pnpm --filter @proofgate/safe-app synth
pnpm --filter @proofgate/vulnerable-app synth

# ProofGateはsafe-appを許可する
pnpm --filter @proofgate/safe-app synth:proofgate

# ProofGateはvulnerable-appをPG-IAM-004、終了コード1で拒否する
pnpm --filter @proofgate/vulnerable-app synth:proofgate
```

自動テスト一式は`pnpm test`で実行できます。

コード品質チェックは次のコマンドで実行できます。

```bash
pnpm quality
```

このコマンドはBiomeによるフォーマット・Lint・Assist検査、Knipによる未使用ファイル・依存関係・export検査、jscpdによる重複コード検査を順番に実行します。自動修正可能なBiomeの指摘は`pnpm biome:fix`で修正できます。

## CDKへの導入

```ts
import { App, Validations } from "aws-cdk-lib";
import { ProofGateValidator } from "@proofgate/cdk-plugin";

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
