# Changelog

All published packages (`@proofgate-cdk/model`, `@proofgate-cdk/extractor`, `@proofgate-cdk/core`, `@proofgate-cdk/cdk-plugin`) share one version.

## 1.0.0 - 2026-11-18

First stable release. The version is 1.0.0 because this release changes what ProofGate accepts and rejects. Read "Upgrade notes" before updating.

### Changed: more templates are rejected or reported

- **IAM policy variables in `Resource` are rejected with `PG-IAM-003`.** A Statement whose `Resource` string contains a policy variable such as `${aws:username}` is reported as unsupported, with the location of that `Resource`, and no model is produced. Before, the variable was read as plain text, which could hide access that the variable expands to at run time. The variables are not evaluated. This also applies to Deny statements and to statements about unrelated buckets. A `Resource` that is already an unsupported CloudFormation intrinsic keeps its existing findings.
- **Access to part of a protected bucket now counts (`PG-IAM-004`).** A grant on a prefix (`bucket/reports/*`), on one object, or through a bucket wildcard that can match the protected bucket is now access to the protected bucket. Before, only a `Resource` that matched `bucket/*` as a whole counted, so such grants were missed. A bucket-level ARN alone, and a different bucket, still do not count.
- **`?` is a single-character wildcard** in `Action` and `Resource` patterns, as in AWS. Before, `?` was read as a literal character, so a policy written with `?` could be missed.

All three changes only add findings or rejections. A comparison of the old and new evaluator over 18,014 inputs found no input that lost a finding, and the output for the two demo apps is unchanged.

### Added

- Generated tests (`tests/pbt/`, not published): an independent oracle, a seeded generator, a batched Lean runner, a shrinker, regression cases, and a self-check with deliberately broken components. See `tests/pbt/README.md`.
- `pnpm pack:check` rejects test-only files and anything other than `package.json`, `README.md`, `LICENSE`, `dist/`, and `lean/` in the published tarballs.

### Not changed

- Rule IDs (`PG-IAM-003`, `PG-IAM-004`), the validator API, the configuration, the Lean toolchain, and the supported Node.js version (26 or later).
- What the Lean check proves. It checks four facts that TypeScript computes for each candidate path. It does not verify the CloudFormation template or the IAM statements.

### Upgrade notes

- If `pnpm cdk synth` now fails with `PG-IAM-003` and the message "IAM policy variables in Resource are not supported", the stack uses a policy variable in a `Resource`. There is no setting to allow it. Write the `Resource` without the variable (for example, a fixed ARN) or do not enable ProofGate for that stack.
- If a stack that passed before now fails with `PG-IAM-004`, check for a grant on a prefix or an object of a protected bucket. It was missed before and is access to that bucket.

## 1.0.0 - 2026-11-18（日本語）

初の安定版です。受理・拒否の範囲が変わるため、バージョンを1.0.0にしました。更新前に「更新時の注意」を確認してください。

### 変更: より多くのテンプレートを拒否・検出します

- **`Resource`に含まれるIAMポリシー変数を`PG-IAM-003`で拒否します。** `${aws:username}`のようなポリシー変数を含む`Resource`は、未対応として報告し、モデルを作りません。以前は変数を単なる文字列として読んでいたため、実行時に展開される権限を見逃す可能性がありました。変数は評価しません。Denyの文や、保護対象と無関係なバケットへの文も対象です。すでにCloudFormationのintrinsicで未対応になっている`Resource`は、従来のfindingのままです。
- **保護対象バケットの一部へのアクセスも検出します（`PG-IAM-004`）。** プレフィックス（`bucket/reports/*`）、単一オブジェクト、保護対象バケットに一致しうるバケットワイルドカードへの許可は、保護対象バケットへのアクセスとみなします。以前は`bucket/*`全体に一致する`Resource`だけを数えていたため、見逃していました。バケットレベルのARNだけの場合や、別のバケットは、従来どおり対象外です。
- **`?`を任意の1文字として扱います。** `Action`と`Resource`のパターンで、AWSと同じ扱いにしました。以前は`?`を文字そのものとして読んでいたため、`?`を使ったポリシーを見逃す可能性がありました。

3つの変更は、検出または拒否を増やす方向だけです。旧版と新版を18,014件の入力で比較し、検出が消えた入力はなく、2つのデモアプリの出力も変わりませんでした。

### 追加

- 生成テスト（`tests/pbt/`、公開されません）: 独立したオラクル、seed固定のジェネレータ、Leanのバッチ実行、縮小器、回帰ケース、意図的に壊した部品による自己検査。詳細は`tests/pbt/README.md`（英語）を参照してください。
- `pnpm pack:check`が、公開tarballに入る`package.json`、`README.md`、`LICENSE`、`dist/`、`lean/`以外のファイルと、テスト専用ファイルを拒否します。

### 変更なし

- ルールID（`PG-IAM-003`、`PG-IAM-004`）、Validator API、設定、Leanツールチェーン、対応Node.js（26以降）。
- Lean検査が証明する範囲。Leanは、TypeScriptが候補経路ごとに計算した4つの事実を検査します。CloudFormationテンプレートやIAMステートメントそのものは検証しません。

### 更新時の注意

- `cdk synth`が`PG-IAM-003`（"IAM policy variables in Resource are not supported"）で失敗する場合、そのスタックは`Resource`にポリシー変数を使っています。許可する設定はありません。変数を使わない`Resource`（固定のARNなど）に書き換えるか、そのスタックではProofGateを有効にしないでください。
- 以前は通っていたスタックが`PG-IAM-004`で失敗する場合、保護対象バケットのプレフィックスやオブジェクトへの許可がないか確認してください。以前は見逃されていた、そのバケットへのアクセスです。
