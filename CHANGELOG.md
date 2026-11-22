# Changelog

All published packages (`@proofgate-cdk/model`, `@proofgate-cdk/extractor`, `@proofgate-cdk/core`, `@proofgate-cdk/cdk-plugin`) share one version.

## Unreleased

### Added: roles that change IAM themselves (`PG-IAM-005`)

A new rule ID, `PG-IAM-005`, reports a role that can change IAM itself and so give itself access to a protected bucket later. Three shapes are checked: a self-grant (`iam:PutRolePolicy` or `iam:AttachRolePolicy` on a Resource that may denote the role's own ARN), a take-over (`iam:UpdateAssumeRolePolicy` on another role that reaches a protected bucket), and a creation grant (`iam:CreateRole` with a grant action whose role-ARN Resources intersect; the Unit 42 shape of 2024). A self-grant is reported even if the role reaches no bucket today, and an administrator role (`Action: "*"` on `*`) is reported. The new config field `allowedPolicyWriters` (Logical IDs) allows a role that writes IAM on purpose; `allowedPassRoleTargets` also excludes the target of a take-over. Public type changes (minor version): `Violation.ruleId` is `"PG-IAM-004" | "PG-IAM-005"`, and `ProofGateConfig` has the optional `allowedPolicyWriters`. Code that compares `ruleId` with `"PG-IAM-004"` only should handle the new value. Lean checks a third list, `PolicyWritePath`, with a third theorem; the first two lists are unchanged. The change can only add findings. Pathfinding.cloud benchmark: 60 of 91 paths are reported (52 before); the eight new ones are iam-005, iam-009, iam-012, iam-014, iam-017, iam-019, iam-020, iam-021.

### Changed: a trust principal that is not a service is read when it is written with an intrinsic

A trust-policy principal of type `AWS` or `Federated` that is written with `Fn::Join`, `Fn::Sub`, `Fn::GetAtt`, or pseudo-parameters is now ignored like a literal one (the extractor reads only the services that can assume the role). CDK writes `AccountPrincipal` this way, so a CodePipeline role, for example, was rejected with `PG-IAM-003` ("Trust principals must contain literal strings"). A value that cannot be read (a parameter, an import, `Fn::If`) and a `Service` principal that is not literal are still rejected. This accepts more templates; it does not hide a path that was seen before, because non-service principals were never modeled (role chains are a documented limit).

### Added: four more AWS managed policies are read

`AmazonSSMManagedInstanceCore` (v2), `AWSGlueServiceRole` (v5), `AWSBackupServiceRolePolicyForBackup` (v30), and `AWSBackupServiceRolePolicyForRestores` (v36) are read from `ManagedPolicyArns`, so a role that has one of them is no longer rejected with `PG-IAM-003`. The statements are copied one by one from the AWS documentation (read 2026-11-22); the `Condition` of an Allow statement is not copied, which only adds findings. Two of them matter for the result: the Glue policy allows S3 object actions on `arn:aws:s3:::*/*aws-glue-*/*` (a key that contains `aws-glue-` in any bucket), so a role that holds it counts as reaching a protected bucket; the Backup restore policy holds `iam:PassRole` and launch actions, so it can be part of a `PG-IAM-004` path. Any other managed policy, including `AWS_ConfigRole` (3775 actions, not read yet), is still rejected.

### Added: paths without `iam:PassRole`

A principal that can change a resource that already runs as a role (a Lambda function, a CodeBuild project, a Step Functions state machine) runs code of its choice as that role, with no `iam:PassRole`. This is the shape of the Lambda code injection in the Sysdig report of 2025-11-28. `PG-IAM-004` now also reports this path: the principal holds `lambda:UpdateFunctionCode`, `lambda:UpdateFunctionConfiguration`, `codebuild:StartBuild`, `codebuild:StartBuildBatch`, or `states:UpdateStateMachine` on a resource that may denote the resource, and the role of the resource reaches a protected bucket. The violation names the resource and the action. A resource whose role cannot be identified (a parameter, an import) that a principal can change is rejected with `PG-IAM-003`. `allowedPassRoleTargets` also allows these paths. The extractor reads the role of these three resource types, and reads `Ref` and `Fn::GetAtt Arn` of them exactly instead of `*`. The model gets an optional `resources` field and the violation an optional `resourceLogicalId` (minor version). Lean checks a second list, `ImplicitPath`, and the fields of the first are unchanged. The change can only add findings. Pathfinding.cloud benchmark: 52 of 91 paths are reported (46 before); the six new ones are lambda-003, lambda-004, lambda-005, codebuild-002, codebuild-003, stepfunctions-002.

### Fixed: roles that trust another service than the launch table says

The launch table maps an action to the service that receives the role (`iam:PassedToService` of the AWS Service Reference). A role that is passed to a service can trust another principal. The pathfinding.cloud benchmark showed two cases. A GameLift fleet instance role is assumed by EC2 instances (trust `ec2.amazonaws.com`), but the table says `gamelift.amazonaws.com`, so `iam:PassRole` with `gamelift:CreateFleet` was missed. An App Runner instance role trusts `tasks.apprunner.amazonaws.com` and the access role `build.apprunner.amazonaws.com`, but the table says `bullet.amazonaws.com`, so the path was only rejected with `PG-IAM-003`. A reviewed list of such additions (`packages/core/src/launch-supplements.ts`, one source per entry) now adds those trusted services for `gamelift:CreateFleet`, `apprunner:CreateService`, and `apprunner:UpdateService`. The change can only add findings (checked against the previous `main`: no finding lost). More entries are added only after the documentation confirms them.

### Fixed: paths through launch services other than Lambda

Up to 1.1.2 only Lambda counted: a principal that could pass a role to ECS (`ecs:RunTask`), EC2 (`ec2:RunInstances`), CodeBuild, CloudFormation, Step Functions, Glue, or another service was not checked, so those paths were missed. Now every launch action of a table generated from the AWS Service Reference (879 actions of operations that authorize `iam:PassRole`) counts, together with a target role that trusts the service the action passes the role to. A regional service principal (`states.us-east-1.amazonaws.com`) is read as the global one. `AWS::IAM::InstanceProfile` is read instead of rejected. A passable role that reaches a protected bucket and trusts a service that is in no value of the table is rejected with `PG-IAM-003`. The violation text names the service and the launch action. The Lean fields `canControlLambda` and `targetIsLambdaAssumable` are renamed `canLaunch` and `targetTrustsService`, and a `service` field is added. The change can only add findings (checked against 1.1.2 over 3038 inputs: no finding lost).

### Added: `Fn::Sub` and two managed policies

`Resource` and `ManagedPolicyArns` now read the string form of `Fn::Sub` (no variable map): `${Name}` like `Ref`, `${Id.Attr}` like `Fn::GetAtt`, `${!Text}` as the literal `${Text}`. CDK writes `Fn::Sub` in the bootstrap asset bucket statement and in the `ManagedPolicyArns` of the `autoDeleteObjects` provider role, so those stacks were rejected before. Unknown names, parameters, a variable map, and an IAM policy variable still reject with `PG-IAM-003`. Two managed policies are added to the checked table: `AWSLambdaVPCAccessExecutionRole` (v3) and `AmazonAPIGatewayPushToCloudWatchLogs` (v1). Any other managed policy stays rejected. Neither policy touches S3 or `iam:PassRole`.

### Changed: a template without IAM resources is accepted

A template with no resource whose type starts with `AWS::IAM::` (a stack with only a Cognito user pool or a CloudFront distribution, for example) used to be rejected with `PG-IAM-003` ("No IAM roles were found; refusing a vacuous proof"). It is now accepted: there is no IAM principal to check, so neither the evaluator nor Lean runs and nothing is reported. This is permissive, and it does not mean "proved safe". A template that cannot be called free of IAM stays rejected: it contains a nested stack, a `Transform`, an `Fn::Transform`, an `AWS::Serverless::` resource, or an entry that cannot be read, or it has IAM resources without a role or without a readable statement. See `docs/SUPPORTED_IAM.md`.

### Fixed: more S3 actions count as access to a protected bucket

Up to 1.1.2 only `s3:GetObject`, `s3:PutObject`, and `s3:DeleteObject` counted as access. A role with only `s3:GetObjectVersion`, `s3:DeleteObjectVersion`, `s3:PutObjectAcl`, `s3:ReplicateObject`, or `s3:PutBucketPolicy` on the protected bucket was reported as having no access, so a path through it was missed. Now the 44 actions that take the S3 `object` resource count on the objects of the bucket, and 7 bucket actions count on the bucket ARN itself: the five "permissions management" actions (`PutBucketPolicy`, `DeleteBucketPolicy`, `PutBucketAcl`, `PutBucketOwnershipControls`, `PutBucketPublicAccessBlock`), `PutReplicationConfiguration`, and `PutLifecycleConfiguration`. The tables are generated from the AWS Service Reference (see `docs/ASSUMPTIONS.md`). The change can only add findings: a template that was accepted may now report `PG-IAM-004` (checked against 1.1.2 over 3038 inputs: no finding lost).

## 1.1.2 - 2026-11-20

### Fixed: a configuration update alone is Lambda control

Up to 1.1.1, taking over an existing Lambda function counted only with both `lambda:UpdateFunctionConfiguration` and `lambda:UpdateFunctionCode`. But `UpdateFunctionConfiguration` alone can change the execution role (`Role`) and the layers (`Layers`, also from other accounts), so together with `iam:PassRole` it can run code as the passed role. It now counts on its own. `lambda:UpdateFunctionCode` alone still does not (it cannot change the role). Found in a trial of 1.1.1 from npm. The change can only add findings: a template that was accepted may now report `PG-IAM-004` (checked against 1.1.1 over 3034 inputs: no finding lost).

## 1.1.1 - 2026-11-20

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

Not published to npm. (Correction, 2026-11-21: this entry first said that 1.0.1 was the first version published to npm. The publish attempt failed and was not repeated; the first version on npm is 1.1.0.) There is no change in behavior or in the code compared with 1.0.0; the packages were renamed.

### Package names

The packages use the npm scope `@proofgate-cdk`: `@proofgate-cdk/model`, `@proofgate-cdk/extractor`, `@proofgate-cdk/core`, and `@proofgate-cdk/cdk-plugin`. Import paths use the new scope.

The tag and GitHub release `v1.0.0` are a source release only. At that tag the packages were still named `@proofgate/*`, a scope that was never published. The behavior changes listed under 1.0.0 are all included in 1.0.1. Use 1.1.0 or later from npm.

## 1.0.0 - 2026-11-18

Source release only (tag `v1.0.0`). The packages were named `@proofgate/*` at that tag and were not published to npm. See 1.0.1 and 1.1.0.

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
