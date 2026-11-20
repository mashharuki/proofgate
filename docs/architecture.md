# アーキテクチャ

CDKアプリはCloudFormationを合成し、安定版のPolicy Validation Plugin APIを通じて`ProofGateValidator`を呼び出します。Validatorは各テンプレートを次の手順で処理します。

1. `@proofgate-cdk/extractor`が、対応しているIAMロールとインラインポリシーを決定的な中間モデルへ変換する。Resourceの`Fn::Join`、疑似パラメータ、同じテンプレート内のバケットとロールへの`Ref`・`Fn::GetAtt`は値リゾルバ（`resolve.ts`）で文字列に変換し、管理ポリシー`AWSLambdaBasicExecutionRole`は表（`managed-policies.ts`）からStatementへ展開する。読めない値は`PG-IAM-003`にする
2. `@proofgate-cdk/core`が、有限グラフ上の4つの事実（`canPassRole`、`canControlLambda`、`targetIsLambdaAssumable`、`targetCanAccess`）を解決する
3. Generatorが各候補経路を具体的なLeanの`EscalationPath`値として直列化する
4. `ProofGate.Security.safe`が、4条件をすべて満たす経路が存在しないことを要求する
5. `lake env lean`が、生成された`generatedStackIsSafe`定理を`native_decide`で検査する
6. プラグインがTypeScript参照実装の結果とLeanの結果を比較する。不一致はFail Closedで拒否する。Leanの実行・ツールチェーン障害は定理の拒否と区別し、`PG-IAM-003`として報告する

現在の実装ではLeanをローカルのサブプロセスとして実行します。将来のパッケージング段階では、中間モデルを変更せずに、バージョン固定済みのビルド済みVerifierへ置き換えられます。

Extractorの値リゾルバと管理ポリシーの表は、Leanへ渡す中間モデルの型を変えません。Leanが検査するのは、TypeScriptが計算した有限モデル上の4つの事実だけです。リゾルバ、表、不透明な名前`_generated_<LogicalId>`の読み方は、信頼する実装の一部です（`docs/ASSUMPTIONS.md`）。

English: the value resolver (`resolve.ts`: `Fn::Join`, pseudo-parameters, `Ref` and `Fn::GetAtt` of buckets and roles in the same template) and the managed-policy table (`managed-policies.ts`, one entry) run inside the extractor. They do not change the intermediate model passed to Lean. Lean checks only the four facts that TypeScript computes on the finite model; the resolver, the table, and the opaque names are trusted code (see `docs/ASSUMPTIONS.md`).
