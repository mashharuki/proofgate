import { Duration, RemovalPolicy, type Stack } from "aws-cdk-lib";
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
import { PROTECTED_BUCKET_ARN } from "../config.js";
import { stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 構成の試し（spec proofgate-brushup, 2026-11-21）から作ったPatternです（RS-23〜RS-38）。
 * どのPatternも、名前を固定した保護対象バケットと、よく使う構成を1つだけ持ちます。
 * 誰も`iam:PassRole`を持たないため、どれも正解は安全です。
 * この試しは1.1.2で一度実行したため、1.1.2の結果は予想ではなく観測です（data/construct-probe-predictions.json）。
 * Patterns made from the 16-construct probe. Each has the protected bucket with a fixed name and one
 * common construct. Nobody holds iam:PassRole, so every ground truth is safe.
 */
const fn = (scope: Stack, id: string, props: Partial<lambda.FunctionProps> = {}) =>
  new lambda.Function(scope, id, {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: lambda.Code.fromInline("exports.handler = async () => ({});"),
    ...props,
  });
const vpc = (scope: Stack, maxAzs: number) => new ec2.Vpc(scope, "Vpc", { maxAzs, natGateways: 0 });

interface Probe {
  readonly id: `RS-${string}`;
  readonly title: string;
  readonly description: string;
  readonly add: (stack: Stack, data: s3.Bucket) => void;
}
const probes: readonly Probe[] = [
  {
    id: "RS-23",
    title: "A Lambda function in a VPC",
    description:
      "A Lambda function in a VPC without NAT gateways. CDK gives its role the managed policies AWSLambdaBasicExecutionRole and AWSLambdaVPCAccessExecutionRole. Nobody can pass a role.",
    add: (s) => fn(s, "Fn", { vpc: vpc(s, 1) }),
  },
  {
    id: "RS-24",
    title: "A Lambda function with active X-Ray tracing",
    description: "Tracing adds literal X-Ray statements to the role. Nobody can pass a role.",
    add: (s) => fn(s, "Fn", { tracing: lambda.Tracing.ACTIVE }),
  },
  {
    id: "RS-25",
    title: "A Lambda function with logRetention",
    description:
      "The deprecated logRetention option adds a custom-resource function and role. Nobody can pass a role.",
    add: (s) => fn(s, "Fn", { logRetention: logs.RetentionDays.ONE_WEEK }),
  },
  {
    id: "RS-26",
    title: "A Lambda function with its own log group",
    description: "A log group resource given to the function. Nobody can pass a role.",
    add: (s) =>
      fn(s, "Fn", {
        logGroup: new logs.LogGroup(s, "Logs", { removalPolicy: RemovalPolicy.DESTROY }),
      }),
  },
  {
    id: "RS-27",
    title: "An SNS topic with a Lambda subscription",
    description: "A topic invokes a Lambda function. Nobody can pass a role.",
    add: (s) => new sns.Topic(s, "Topic").addSubscription(new subs.LambdaSubscription(fn(s, "Fn"))),
  },
  {
    id: "RS-28",
    title: "A Kinesis stream with grantRead to a Lambda function",
    description: "A Lambda function may read a stream. Nobody can pass a role.",
    add: (s) => new kinesis.Stream(s, "Stream").grantRead(fn(s, "Fn")),
  },
  {
    id: "RS-29",
    title: "A Secrets Manager secret with grantRead to a Lambda function",
    description: "A Lambda function may read a secret. Nobody can pass a role.",
    add: (s) => new secrets.Secret(s, "Secret").grantRead(fn(s, "Fn")),
  },
  {
    id: "RS-30",
    title: "A Cognito user pool",
    description: "A user pool with default settings. The template has no IAM resource.",
    add: (s) => new cognito.UserPool(s, "Pool"),
  },
  {
    id: "RS-31",
    title: "A CloudFront distribution with the protected bucket as an S3 origin",
    description:
      "Origin access control adds a bucket policy for CloudFront. The template has no IAM resource. The bucket policy is a resource policy, which ProofGate does not model.",
    add: (s, data) =>
      new cloudfront.Distribution(s, "Cdn", {
        defaultBehavior: { origin: origins.S3BucketOrigin.withOriginAccessControl(data) },
      }),
  },
  {
    id: "RS-32",
    title: "A BucketDeployment into the protected bucket",
    description:
      "The deployment's custom-resource role reads the CDK bootstrap asset bucket (written with Fn::Sub) and writes the protected bucket. Nobody can pass that role.",
    add: (s, data) =>
      new s3deploy.BucketDeployment(s, "Deploy", {
        sources: [s3deploy.Source.data("a.txt", "x")],
        destinationBucket: data,
      }),
  },
  {
    id: "RS-33",
    title: "An AwsCustomResource calling SSM",
    description:
      "AwsCustomResource with a policy from its SDK calls on any resource. Nobody can pass a role.",
    add: (s) =>
      new cr.AwsCustomResource(s, "Call", {
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
  },
  {
    id: "RS-34",
    title: "A CodeBuild project with an inline buildspec",
    description: "A project with its own service role. Nobody can pass a role.",
    add: (s) =>
      new codebuild.Project(s, "Build", {
        buildSpec: codebuild.BuildSpec.fromObject({
          version: "0.2",
          phases: { build: { commands: ["echo"] } },
        }),
      }),
  },
  {
    id: "RS-35",
    title: "An Application Load Balanced Fargate service",
    description:
      "The ecs-patterns construct with a VPC, a load balancer, a task role, and an execution role. Nobody can pass a role.",
    add: (s) =>
      new ecsPatterns.ApplicationLoadBalancedFargateService(s, "Service", {
        vpc: vpc(s, 2),
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry("public.ecr.aws/docker/library/nginx:latest"),
        },
        assignPublicIp: true,
      }),
  },
  {
    id: "RS-36",
    title: "A scheduled EventBridge rule with a Lambda target",
    description: "An hourly rule invokes a Lambda function. Nobody can pass a role.",
    add: (s) =>
      new events.Rule(s, "Hourly", { schedule: events.Schedule.rate(Duration.hours(1)) }).addTarget(
        new targets.LambdaFunction(fn(s, "Fn")),
      ),
  },
  {
    id: "RS-37",
    title: "A bucket with autoDeleteObjects",
    description:
      "Another bucket with autoDeleteObjects. CDK adds a custom-resource provider role whose managed policy ARN is written with Fn::Sub. Nobody can pass a role.",
    add: (s) =>
      new s3.Bucket(s, "Scratch", {
        autoDeleteObjects: true,
        removalPolicy: RemovalPolicy.DESTROY,
      }),
  },
  {
    id: "RS-38",
    title: "A Lambda function with an SSM statement built from the stack account and region",
    description:
      "addToRolePolicy with a resource built from stack.region and stack.account (pseudo-parameters). Nobody can pass a role.",
    add: (s) =>
      fn(s, "Fn").addToRolePolicy(
        new iam.PolicyStatement({
          actions: ["ssm:GetParameter"],
          resources: [`arn:aws:ssm:${s.region}:${s.account}:parameter/app/*`],
        }),
      ),
  },
];
const PROTECTED_BUCKET_NAME = PROTECTED_BUCKET_ARN.slice("arn:aws:s3:::".length);
/** 構成の試しのPatternの一覧です。通常の一覧にもホールドアウトにも入れません。 */
export const constructProbeCatalog: readonly Pattern[] = probes.map((probe) => ({
  id: probe.id,
  title: probe.title,
  description: probe.description,
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const data = new s3.Bucket(stack, "Protected", { bucketName: PROTECTED_BUCKET_NAME });
    probe.add(stack, data);
  },
}));
