import { ProofGateValidator } from "@proofgate/cdk-plugin";
import { App, Stack, Validations } from "aws-cdk-lib";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

/**
 * ProofGateが許可する安全なCDKアプリの例です。
 * Lambda操作権限とS3アクセス権限は存在しますが、それらをつなぐiam:PassRole権限がないため、
 * 保護対象バケットへ至る完全な権限昇格経路は成立しません。
 */
const protectedBucketArn = "arn:aws:s3:::proofgate-protected-data";
const app = new App();
const stack = new Stack(app, "SafeAppStack");

// Lambdaが引き受け可能で、保護対象バケットを読み取れるデータアクセス用ロールです。
const dataRole = new Role(stack, "ProtectedDataRole", {
  roleName: "proofgate-protected-data-role",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
});
dataRole.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["s3:GetObject"],
    resources: [`${protectedBucketArn}/*`],
  }),
);

// 開発者ロールはLambdaを作成できますが、データアクセス用ロールを渡す権限は持ちません。
const developer = new Role(stack, "DeveloperRole", {
  roleName: "proofgate-safe-developer",
  assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
});
developer.addToPolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ["lambda:CreateFunction"],
    resources: ["*"],
  }),
);

// 環境変数でプラグインの有無を切り替え、通常synthと検証付きsynthの両方を再現します。
if (process.env.PROOFGATE === "1") {
  Validations.of(app).addPlugins(
    new ProofGateValidator({ protectedBucketArns: [protectedBucketArn] }),
  );
}

app.synth();
