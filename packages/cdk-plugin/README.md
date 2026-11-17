# @proofgate/cdk-plugin

Leanでアプリケーション固有のIAM安全条件を検査する、AWS CDK Validation Pluginです。

## インストール

```bash
pnpm add @proofgate/cdk-plugin aws-cdk-lib
```

Node.js 26以降と、`elan`で導入したLean 4 / Lakeが必要です。Leanのバージョンはパッケージに同梱した`lean/lean-toolchain`で固定されています。

## CDKへの導入

```ts
import { ProofGateValidator } from "@proofgate/cdk-plugin";
import { App, Validations } from "aws-cdk-lib";

const app = new App();

Validations.of(app).addPlugins(
  new ProofGateValidator({
    protectedBucketArns: ["arn:aws:s3:::production-data"],
  }),
);
```

プラグインは`cdk synth`中に合成済みCloudFormationを読み取り、危険な権限昇格経路を`PG-IAM-004`、未対応構文やツールチェーン障害を`PG-IAM-003`として報告します。

詳細な対応IAM構文と信頼境界は、[ProofGateリポジトリ](https://github.com/mashharuki/proofgate)を参照してください。
