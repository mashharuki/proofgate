import { ProofGateValidator } from "@proofgate/cdk-plugin";
import { App, Stack, Validations } from "aws-cdk-lib";
import { Effect, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";

const protectedBucketArn = "arn:aws:s3:::proofgate-protected-data";
const app = new App();
const stack = new Stack(app, "SafeAppStack");

const dataRole = new Role(stack, "ProtectedDataRole", {
  roleName: "proofgate-protected-data-role",
  assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
});
dataRole.addToPolicy(new PolicyStatement({ effect: Effect.ALLOW, actions: ["s3:GetObject"], resources: [`${protectedBucketArn}/*`] }));

const developer = new Role(stack, "DeveloperRole", {
  roleName: "proofgate-safe-developer",
  assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
});
developer.addToPolicy(new PolicyStatement({ effect: Effect.ALLOW, actions: ["lambda:CreateFunction"], resources: ["*"] }));

if (process.env.PROOFGATE === "1") {
  Validations.of(app).addPlugins(new ProofGateValidator({ protectedBucketArns: [protectedBucketArn] }));
}

app.synth();
