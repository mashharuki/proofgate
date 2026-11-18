# @proofgate-cdk/model

ProofGateがCloudFormation IAMをTypeScriptとLeanの間で受け渡すための、CDK非依存の中間モデルです。

通常は`@proofgate-cdk/cdk-plugin`から間接的に利用します。独自Extractorや検証ツールを実装する場合に、`StackModel`、`RoleModel`、`ProofGateConfig`などを直接importできます。

```bash
pnpm add @proofgate-cdk/model
```

対応範囲と信頼境界は、[ProofGateリポジトリ](https://github.com/mashharuki/proofgate)のドキュメントを参照してください。
