# @proofgate/core

ProofGateのTypeScript参照評価器と、決定的なLeanモジュール生成器を提供します。

```bash
pnpm add @proofgate/core
```

正規化済み`StackModel`に対して`evaluate`で権限昇格経路を評価し、`generateLean`で同じ有限モデルを検査するLeanコードを生成できます。通常は`@proofgate/cdk-plugin`から間接的に利用します。
