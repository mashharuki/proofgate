import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { App, Stack, Validations } from "aws-cdk-lib";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

/**
 * ProofGateが拒否する脆弱なCDKアプリの例です。
 * DeveloperRoleからLambdaを経由して保護対象バケットへ到達するための4条件を、
 * 意図的にすべて成立させています。
 */
const protectedBucketArn = "arn:aws:s3:::proofgate-protected-data";
const app = new App();
const stack = new Stack(app, "VulnerableAppStack");

// Lambdaが引き受け可能で、保護対象バケットのオブジェクトを読み書きできる高権限ロールです。
const dataRole = new Role(stack, "ProtectedDataRole", {
  roleName: "proofgate-protected-data-role",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
});
dataRole.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:GetObject", "s3:PutObject"],
    resources: [`${protectedBucketArn}/*`],
  }),
);

// 攻撃の起点を表すロールです。次の2つのPolicy Statementの組み合わせが問題になります。
const developer = new Role(stack, "DeveloperRole", {
  roleName: "proofgate-vulnerable-developer",
  assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
});
// 条件1: 保護データ用ロールをLambdaへ渡せます。
developer.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["iam:PassRole"],
    resources: ["arn:aws:iam::*:role/proofgate-protected-data-role"],
  }),
);
// 条件2: 渡したロールを使うLambda関数のコードや実行を制御できます。
developer.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda:CreateFunction", "lambda:UpdateFunctionCode", "lambda:InvokeFunction"],
    resources: ["*"],
  }),
);

// PROOFGATE=1の場合だけ検証プラグインを登録し、拒否される経路をデモします。
if (process.env.PROOFGATE === "1") {
  // 検証が有効なことを、合成の出力で分かるようにします（成功時、CDKはプラグインの結果を表示しません）。
  // Say that the gate is on, because CDK prints nothing about a plugin that passes.
  console.error(`ProofGate is on: protected bucket ${protectedBucketArn}`);
  Validations.of(app).addPlugins(
    new ProofGateValidator({ protectedBucketArns: [protectedBucketArn] }),
  );
}

app.synth();
