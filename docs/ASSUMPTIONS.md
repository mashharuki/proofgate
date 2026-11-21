# 前提と信頼境界

## 検査するもの

ProofGateは抽出した有限モデルについて、次の4条件を同時に満たすプリンシパルからの経路が存在しないことを検査します。

- 対象ロールへの、対応範囲内の`iam:PassRole`権限がある
- 対応範囲内のLambda制御権限がある
- 対象ロールがLambdaサービスを信頼している
- 対象ロールが設定された保護対象S3バケットへ、対応範囲内のアクセス権限を持っている
  - 保護対象バケット内の一部のプレフィックスや単一オブジェクトへのアクセスも、アクセスを持つものとして扱います

## 信頼するもの

- CloudFormation ExtractorとAction・Resource Matcherの実装
- TypeScriptからLeanへのGenerator
- バージョン固定済みLeanコンパイラ、`native_decide`が使用するランタイム、Leanカーネル
- 合成されたCloudFormationテンプレートが予定されるデプロイ内容を表していること
- AWS IAMとLambdaが公開仕様どおりに動作すること

## 現在の検査対象外

- SCP、Permissions Boundary、Session Policy、Resource Policy、Explicit Denyの評価
- 推移的なロール引き受け、スタック間参照、クロスアカウント参照
- サービス信頼以外のLambda固有制約と`iam:PassedToService` Condition
- 表にないManaged Policy（`AWSLambdaBasicExecutionRole`だけを読みます）、ポリシー変数、大部分のCloudFormation intrinsic function、権限StatementのIAM Condition
- 検査済みのCDK synthを経由しない変更やデプロイ後のドリフト

Extractorは、未対応の構文を安全とみなさず拒否します。AWSへのデプロイは、意図的にこのリポジトリのデモとテストの対象外にしています。

ResourceにIAMポリシー変数（`${aws:username}`など）を含むStatementは、変数を評価せず`PG-IAM-003`で拒否します。これは以前より多くの入力を拒否する変更です。
名前のないロール（`RoleName`なし）は、不透明な名前`_generated_<LogicalId>`として扱います。ロール名部分にワイルドカードを含む`iam:PassRole`のResourceは、実際の生成名に一致しうるものとして対象にします。実際の生成名がそのPatternに一致しない場合でも指摘が出ます（過剰検出）。生成名の形式はAWSが規定していないため、この読み方は仮定です。

English: a role without `RoleName` is read as the opaque name `_generated_<LogicalId>`. A `iam:PassRole` Resource with a wildcard in the role-name part counts as a possible match, even if the real generated name would not match (over-approximation). AWS does not specify the format of generated names, so this reading is an assumption.

管理ポリシー`AWSLambdaBasicExecutionRole`の内容は、AWSのドキュメント（2026-11-19に確認、v1）のとおりだと仮定します。AWSが新しい既定バージョンを公開すると、この仮定は古くなります。Trust Policyの`Allow`に付いた`Condition`は引き受けられる主体を狭めるだけだと仮定し、無視します（実際より多くの主体が引き受けられるものとして読むため、指摘が増える側です）。

English: the content of the managed policy `AWSLambdaBasicExecutionRole` is assumed to be that of the AWS documentation (checked on 2026-11-19, v1); a new default version published by AWS makes this assumption stale. A `Condition` on an `Allow` trust statement is assumed to only narrow who can assume the role, so it is ignored (the role is read as assumable by more principals, which only adds findings).

CloudFormationは、バケットの`Ref`にバケット名を、`Fn::GetAtt Arn`に`arn:<パーティション>:s3:::<バケット名>`を、ロールの`Ref`にロール名を、`Fn::GetAtt Arn`にロールのARNを返すと仮定します（AWSのCloudFormationテンプレートリファレンス、2026-11-19に確認）。パーティションは`aws`、`aws-cn`、`aws-us-gov`のいずれかだと仮定します（IAMユーザーガイドのARNの形式）。新しいパーティションが加わると、この仮定は古くなります。Allowの中の未知の部分（リージョン、アカウントID、ほかのリソースの物理ID）は`*`として読み、経路を隠さないと仮定します。保護バケットは、同じテンプレートの名前のない`AWS::S3::Bucket`ではないと仮定します。名前のないバケットは不透明な名前で表し、リテラルの保護バケット名とは交わらないものとして読むためです。前回のデプロイで生成された名前を保護バケットとして設定し、そのバケットがテンプレートでは名前のないままの場合、経路を見逃します。この場合は、テンプレートでバケットに`BucketName`を付けてください。

English: CloudFormation is assumed to return the documented values for `Ref` and `Fn::GetAtt Arn` of buckets and roles (CloudFormation template reference, checked 2026-11-19). The partition is assumed to be one of `aws`, `aws-cn`, `aws-us-gov` (IAM User Guide, ARN format); a new partition makes this stale. Unknown parts of an `Allow` (region, account id, physical IDs of other resources) are read as `*`, which cannot hide a path. The protected bucket is assumed not to be an unnamed `AWS::S3::Bucket` of the same template: an unnamed bucket is read as an opaque name that does not meet a literal protected name. If the protected ARN was copied from the generated name of an earlier deployment and the template still gives the bucket no `BucketName`, a path is missed. Give such a bucket a `BucketName`.

`lambda:UpdateFunctionConfiguration`だけでも、既存の関数を渡したロールで動かせるとみなします。ほかのアカウントのレイヤーを付けるときに、呼び出す側のIAMポリシーにも`lambda:GetLayerVersion`が必要かどうかは、AWSのドキュメントからは確かめられませんでした。必要だとしても、その権限は検査しないため、実際より多くの経路を報告することがあります（過剰検出の側です）。

English: `lambda:UpdateFunctionConfiguration` alone is assumed to let a principal run an existing function as the passed role. Whether the caller also needs `lambda:GetLayerVersion` in its own policy to attach a layer of another account could not be confirmed from the AWS documentation. That permission is not checked, so ProofGate may report more paths than exist (over-approximation).

AWSのアクションに関する3つの表（S3の`object`リソースを取るアクション、バケットの権限を変えるアクション、`iam:PassRole`を伴う起動アクションと渡し先のサービス）は、AWS Service Reference（`https://servicereference.us-east-1.amazonaws.com/`）から`scripts/sync-service-reference.mjs`で生成し、`packages/core/src/aws-tables.generated.ts`としてコミットします（2026-11-21のスナップショット）。ProofGateは、このデータが正確で、その日付の時点で網羅的だと仮定します。その後にAWSが追加したアクションは表にありません。表の生成は開発時だけで、テストにも、利用者の`cdk synth`にも、ネットワークは使いません。渡し先のサービスがデータに書かれていない23個のアクションは、どのサービスにも渡せるものとして読みます（過剰検出の側です）。

English: three tables of AWS actions (the S3 actions that take the `object` resource, the bucket actions that change permissions, and the launch actions that come with `iam:PassRole` with the service that receives the role) are generated from the AWS Service Reference (`https://servicereference.us-east-1.amazonaws.com/`) by `scripts/sync-service-reference.mjs` and committed as `packages/core/src/aws-tables.generated.ts` (snapshot of 2026-11-21). ProofGate assumes that the data is accurate and complete on that date. Actions that AWS adds later are not in the tables. The generation is a dev-time step; neither the tests nor a user's `cdk synth` use the network. The 23 actions whose data does not name a receiving service are read as passing the role to any service (over-approximation).

バケットに対するActionのうち、複製（`PutReplicationConfiguration`）とライフサイクル（`PutLifecycleConfiguration`）は、AWSの「Permissions management」の分類には入っていませんが、データの複製と消失につながるため、判断として数えます。この2つを数えたくない場合は、生成スクリプトではなく、評価器とオラクルの規則を見直す必要があります。

English: of the bucket actions, replication (`PutReplicationConfiguration`) and lifecycle (`PutLifecycleConfiguration`) are not in the AWS "Permissions management" class; they count by judgment because they can copy or remove every object.
