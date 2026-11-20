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
- Managed Policy、ポリシー変数、大部分のCloudFormation intrinsic function、IAM Condition
- 検査済みのCDK synthを経由しない変更やデプロイ後のドリフト

Extractorは、未対応の構文を安全とみなさず拒否します。AWSへのデプロイは、意図的にこのリポジトリのデモとテストの対象外にしています。

ResourceにIAMポリシー変数（`${aws:username}`など）を含むStatementは、変数を評価せず`PG-IAM-003`で拒否します。これは以前より多くの入力を拒否する変更です。
名前のないロール（`RoleName`なし）は、不透明な名前`_generated_<LogicalId>`として扱います。ロール名部分にワイルドカードを含む`iam:PassRole`のResourceは、実際の生成名に一致しうるものとして対象にします。実際の生成名がそのPatternに一致しない場合でも指摘が出ます（過剰検出）。生成名の形式はAWSが規定していないため、この読み方は仮定です。

English: a role without `RoleName` is read as the opaque name `_generated_<LogicalId>`. A `iam:PassRole` Resource with a wildcard in the role-name part counts as a possible match, even if the real generated name would not match (over-approximation). AWS does not specify the format of generated names, so this reading is an assumption.
