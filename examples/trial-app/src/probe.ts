// Probe of common CDK constructs (exploratory, not a reviewed test). Each probe adds one construct to a
// fresh stack that also has the protected bucket. No AWS calls; synth only.
import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { App, Duration, RemovalPolicy, Stack, Validations } from "aws-cdk-lib";
import * as cloudfront from "aws-cdk-lib/aws-cloudfront";
import * as origins from "aws-cdk-lib/aws-cloudfront-origins";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as ecsPatterns from "aws-cdk-lib/aws-ecs-patterns";
import * as events from "aws-cdk-lib/aws-events";
import * as targets from "aws-cdk-lib/aws-events-targets";
import * as iam from "aws-cdk-lib/aws-iam";
import * as kinesis from "aws-cdk-lib/aws-kinesis";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as logs from "aws-cdk-lib/aws-logs";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as s3deploy from "aws-cdk-lib/aws-s3-deployment";
import * as secrets from "aws-cdk-lib/aws-secretsmanager";
import * as sns from "aws-cdk-lib/aws-sns";
import * as subs from "aws-cdk-lib/aws-sns-subscriptions";
import * as cr from "aws-cdk-lib/custom-resources";

const PB = "proofgate-trial-customer-data";
const fn = (s: Stack, id: string, props: Partial<lambda.FunctionProps> = {}) =>
  new lambda.Function(s, id, {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: lambda.Code.fromInline("exports.handler = async () => ({});"),
    ...props,
  });
const probes: Record<string, (s: Stack, data: s3.Bucket) => void> = {
  "lambda-vpc": (s) => fn(s, "F", { vpc: new ec2.Vpc(s, "Vpc", { maxAzs: 1, natGateways: 0 }) }),
  "lambda-tracing": (s) => fn(s, "F", { tracing: lambda.Tracing.ACTIVE }),
  "lambda-log-retention": (s) => fn(s, "F", { logRetention: logs.RetentionDays.ONE_WEEK }),
  "lambda-log-group": (s) =>
    fn(s, "F", { logGroup: new logs.LogGroup(s, "Lg", { removalPolicy: RemovalPolicy.DESTROY }) }),
  "sns-lambda": (s) =>
    new sns.Topic(s, "T").addSubscription(new subs.LambdaSubscription(fn(s, "F"))),
  "kinesis-grant": (s) => new kinesis.Stream(s, "K").grantRead(fn(s, "F")),
  "secret-grant": (s) => new secrets.Secret(s, "Sec").grantRead(fn(s, "F")),
  "cognito-pool": (s) => new cognito.UserPool(s, "Pool"),
  "cloudfront-s3": (s, data) =>
    new cloudfront.Distribution(s, "Cdn", {
      defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(data) },
    }),
  "bucket-deployment": (s, data) =>
    new s3deploy.BucketDeployment(s, "Deploy", {
      sources: [s3deploy.Source.data("a.txt", "x")],
      destinationBucket: data,
    }),
  "aws-custom-resource": (s) =>
    new cr.AwsCustomResource(s, "Acr", {
      onCreate: {
        service: "SSM",
        action: "getParameter",
        parameters: { Name: "x" },
        physicalResourceId: cr.PhysicalResourceId.of("x"),
      },
      policy: cr.AwsCustomResourcePolicy.fromSdkCalls({
        resources: cr.AwsCustomResourcePolicy.ANY_RESOURCE,
      }),
    }),
  "codebuild-project": (s) =>
    new codebuild.Project(s, "Build", {
      buildSpec: codebuild.BuildSpec.fromObject({
        version: "0.2",
        phases: { build: { commands: ["echo"] } },
      }),
    }),
  "ecs-alb-fargate": (s) =>
    new ecsPatterns.ApplicationLoadBalancedFargateService(s, "Svc", {
      vpc: new ec2.Vpc(s, "Vpc", { maxAzs: 2, natGateways: 0 }),
      taskImageOptions: {
        image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/nginx:latest"),
      },
      assignPublicIp: true,
    }),
  "events-schedule": (s) =>
    new events.Rule(s, "R", { schedule: events.Schedule.rate(Duration.hours(1)) }).addTarget(
      new targets.LambdaFunction(fn(s, "F")),
    ),
  "bucket-autodelete": (s) =>
    new s3.Bucket(s, "Tmp", { autoDeleteObjects: true, removalPolicy: RemovalPolicy.DESTROY }),
  "role-from-lookup-arn": (s) => {
    const f = fn(s, "F");
    f.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: [`arn:aws:ssm:${s.region}:${s.account}:parameter/app/*`],
      }),
    );
  },
};
const name = process.env.PROBE ?? "";
const probe = probes[name];
if (probe === undefined) throw new Error(`PROBE must be one of: ${Object.keys(probes).join(", ")}`);
const app = new App();
const stack = new Stack(app, "ProbeStack");
const data = new s3.Bucket(stack, "CustomerData", { bucketName: PB });
probe(stack, data);
Validations.of(app).addPlugins(
  new ProofGateValidator({ protectedBucketArns: [`arn:aws:s3:::${PB}`] }),
);
app.synth();
