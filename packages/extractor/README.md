# @proofgate-cdk/extractor

合成済みCloudFormationから、ProofGateが対応するIAMロール、Trust Policy、インラインポリシーをFail Closedで抽出します。

```bash
pnpm add @proofgate-cdk/extractor
```

未対応のCondition、NotAction、NotResource、Managed Policy、解決不能な式は安全とみなさず、`UnsupportedFinding`として返します。通常は`@proofgate-cdk/cdk-plugin`から間接的に利用します。
