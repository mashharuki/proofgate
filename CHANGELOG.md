# Changelog

All published packages (`@proofgate-cdk/model`, `@proofgate-cdk/extractor`, `@proofgate-cdk/core`, `@proofgate-cdk/cdk-plugin`) share one version.

## Unreleased

### Fixed: the hint of an unsupported-syntax message now starts a new sentence

In 1.1.0 the hint was appended directly after the reason, for example `... in the first vertical slice Hint: ...`. The description now reads `<reason>. Hint: <hint>`. The `fix` text keeps `Hint:` because its sentence already ends with a period. The reason text and every verdict are unchanged. Tools that split the description on `Hint:` should split on `. Hint: `.

## 1.1.0 - 2026-11-20

The version is 1.1.0 because ProofGate reads more CDK templates than 1.0.1. The changes below can only add findings or make rejected templates readable; no finding of 1.0.1 disappears.

### Fixed: a role without `RoleName` was never a `iam:PassRole` target for a wildcard

A role with no `RoleName` (the default in CDK) was not found as the target of a `iam:PassRole` Resource such as `arn:aws:iam::*:role/*` or `role/MyStack-*`. Only `*` matched, through the logical ID. A privilege-escalation path through such a role was missed. The role is now read as the opaque name `_generated_<LogicalId>`: a Resource with `*` or `?` in the role-name part matches, and a literal matches only that opaque name. The change can only add findings; a template that was accepted before may now report `PG-IAM-004`. See `docs/SUPPORTED_IAM.md` and `docs/ASSUMPTIONS.md`.

### Changed: more CDK templates are read

ProofGate now reads three forms that CDK writes for ordinary constructs. Before, each of them made the template `PG-IAM-003`. Anything else stays `PG-IAM-003`.

- `Resource` values built with `Fn::Join`, the pseudo-parameters `AWS::Partition` (expanded to `aws`, `aws-cn`, `aws-us-gov`), `AWS::Region`, `AWS::AccountId`, `AWS::URLSuffix` (read as `*`), and `Ref` and `Fn::GetAtt` of resources in the same template. An unnamed bucket or role is read as the opaque name `_generated_<LogicalId>`.
- The managed policy `AWSLambdaBasicExecutionRole` in `ManagedPolicyArns` (no other managed policy).
- A `Condition` object on an `Allow` statement of a trust policy is read as absent.

Unknown parts of an `Allow` are read larger, never smaller, so a template that was rejected may now be accepted or report `PG-IAM-004`, and no `PG-IAM-004` of 1.0.1 disappears (checked against 1.0.1 over 3034 inputs). Assumption: the protected bucket is not an unnamed bucket of the same template (see `docs/ASSUMPTIONS.md`). On the 14 real-stack Patterns, RS-05 to RS-09 are now accepted and RS-10 and RS-11 report `PG-IAM-004`.

## 1.0.1 - 2026-11-18

The first version published to npm. There is no change in behavior or in the code compared with 1.0.0; the packages were renamed.

### Package names

The packages are published under the npm scope `@proofgate-cdk`: `@proofgate-cdk/model`, `@proofgate-cdk/extractor`, `@proofgate-cdk/core`, and `@proofgate-cdk/cdk-plugin`. Import paths use the new scope.

The tag and GitHub release `v1.0.0` are a source release only. At that tag the packages were still named `@proofgate/*`, a scope that was never published. 1.0.1 is the first version on npm; use it instead of `v1.0.0`. The behavior changes listed under 1.0.0 are all included.

## 1.0.0 - 2026-11-18

Source release only (tag `v1.0.0`). The packages were named `@proofgate/*` at that tag and were not published to npm. See 1.0.1.

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

## 1.0.1 - 2026-11-18（日本語）

npmに公開する最初のバージョンです。1.0.0からコードと挙動の変更はなく、パッケージ名を変更しました。

### パッケージ名

パッケージはnpmのスコープ`@proofgate-cdk`で公開します: `@proofgate-cdk/model`、`@proofgate-cdk/extractor`、`@proofgate-cdk/core`、`@proofgate-cdk/cdk-plugin`。importのパスも新しいスコープです。

タグとGitHub Releaseの`v1.0.0`は、ソースのみのリリースです。このタグの時点では、パッケージ名は`@proofgate/*`で、このスコープは公開されていません。npmに公開した最初のバージョンは1.0.1です。`v1.0.0`ではなく1.0.1を使ってください。1.0.0に記載した挙動の変更は、すべて含まれます。

## 1.0.0 - 2026-11-18（日本語）

ソースのみのリリースです（タグ`v1.0.0`）。このタグの時点のパッケージ名は`@proofgate/*`で、npmには公開していません。1.0.1を参照してください。

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
