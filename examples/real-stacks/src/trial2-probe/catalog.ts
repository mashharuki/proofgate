import { join } from "node:path";
import type { Stack } from "aws-cdk-lib";
import * as apigw2 from "aws-cdk-lib/aws-apigatewayv2";
import * as apigw2auth from "aws-cdk-lib/aws-apigatewayv2-authorizers";
import * as apigw2int from "aws-cdk-lib/aws-apigatewayv2-integrations";
import * as appsync from "aws-cdk-lib/aws-appsync";
import * as backup from "aws-cdk-lib/aws-backup";
import * as codebuild from "aws-cdk-lib/aws-codebuild";
import * as codepipeline from "aws-cdk-lib/aws-codepipeline";
import * as cpactions from "aws-cdk-lib/aws-codepipeline-actions";
import * as cognito from "aws-cdk-lib/aws-cognito";
import * as config from "aws-cdk-lib/aws-config";
import * as dynamodb from "aws-cdk-lib/aws-dynamodb";
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as glue from "aws-cdk-lib/aws-glue";
import * as iam from "aws-cdk-lib/aws-iam";
import * as firehose from "aws-cdk-lib/aws-kinesisfirehose";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as sources from "aws-cdk-lib/aws-lambda-event-sources";
import * as s3 from "aws-cdk-lib/aws-s3";
import * as scheduler from "aws-cdk-lib/aws-scheduler";
import { PROTECTED_BUCKET_ARN } from "../config.js";
import { ALL_PROTECTED_OBJECTS, developerRole, passRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 実際のCDKで使う構成の、2回目の試しです（RS-73〜RS-84, spec proofgate-brushup, Step 7）。
 * 実行の前に予想を書いてコミットします（data/trial2-predictions.json）。
 * A second round of common CDK constructs. The predictions are committed before the Patterns are run.
 */
const BUCKET_NAME = PROTECTED_BUCKET_ARN.replace("arn:aws:s3:::", "");
const readRole = (stack: Stack, id: string, service: string): iam.Role => {
  const role = new iam.Role(stack, id, { assumedBy: new iam.ServicePrincipal(service) });
  role.addToPolicy(
    new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [ALL_PROTECTED_OBJECTS] }),
  );
  return role;
};
const fn = (stack: Stack, id: string): lambda.Function =>
  new lambda.Function(stack, id, {
    runtime: lambda.Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: lambda.Code.fromInline("exports.handler = async () => ({});"),
  });
const protectedBucket = (stack: Stack): s3.Bucket =>
  new s3.Bucket(stack, "Protected", { bucketName: BUCKET_NAME, versioned: true });

interface Trial extends Omit<Pattern, "inScope" | "build"> {
  readonly build: (stack: Stack) => void;
}
const trials: readonly Trial[] = [
  {
    id: "RS-73",
    title: "A Kinesis Data Firehose delivery stream that writes to the protected bucket",
    description:
      "An L1 delivery stream with its own role. The role writes to the protected bucket. Nobody can pass or change the role.",
    groundTruth: "safe",
    build: (stack) => {
      const role = new iam.Role(stack, "FirehoseRole", {
        assumedBy: new iam.ServicePrincipal("firehose.amazonaws.com"),
      });
      role.addToPolicy(
        new iam.PolicyStatement({ actions: ["s3:PutObject"], resources: [ALL_PROTECTED_OBJECTS] }),
      );
      new firehose.CfnDeliveryStream(stack, "Stream", {
        deliveryStreamType: "DirectPut",
        extendedS3DestinationConfiguration: {
          bucketArn: PROTECTED_BUCKET_ARN,
          roleArn: role.roleArn,
        },
      });
    },
  },
  {
    id: "RS-74",
    title: "A Glue job whose role has the managed policy AWSGlueServiceRole",
    description:
      "A Glue job role with the AWS managed policy service-role/AWSGlueServiceRole and a read statement on the protected bucket.",
    groundTruth: "safe",
    build: (stack) => {
      const role = readRole(stack, "GlueRole", "glue.amazonaws.com");
      role.addManagedPolicy(
        iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSGlueServiceRole"),
      );
      new glue.CfnJob(stack, "Job", {
        role: role.roleArn,
        command: { name: "glueetl", scriptLocation: "s3://scripts/job.py" },
      });
    },
  },
  {
    id: "RS-75",
    title: "A CodePipeline with an S3 source (the protected bucket) and a CodeBuild action",
    description:
      "The pipeline reads its source from the protected bucket. CDK creates the pipeline role, whose trust policy names the account.",
    groundTruth: "safe",
    build: (stack) => {
      const bucket = protectedBucket(stack);
      const output = new codepipeline.Artifact();
      new codepipeline.Pipeline(stack, "Pipeline", {
        stages: [
          {
            stageName: "Source",
            actions: [
              new cpactions.S3SourceAction({
                actionName: "Source",
                bucket,
                bucketKey: "src.zip",
                output,
              }),
            ],
          },
          {
            stageName: "Build",
            actions: [
              new cpactions.CodeBuildAction({
                actionName: "Build",
                input: output,
                project: new codebuild.PipelineProject(stack, "Project"),
              }),
            ],
          },
        ],
      });
    },
  },
  {
    id: "RS-76",
    title: "An API Gateway HTTP API with a Lambda authorizer",
    description:
      "An HTTP API with a Lambda authorizer and a Lambda integration. No principal can pass or change a role.",
    groundTruth: "safe",
    build: (stack) => {
      const authorizer = new apigw2auth.HttpLambdaAuthorizer("Auth", fn(stack, "AuthFn"), {
        responseTypes: [apigw2auth.HttpLambdaResponseType.SIMPLE],
      });
      const api = new apigw2.HttpApi(stack, "Api");
      api.addRoutes({
        path: "/items",
        methods: [apigw2.HttpMethod.GET],
        integration: new apigw2int.HttpLambdaIntegration("Int", fn(stack, "Handler")),
        authorizer,
      });
    },
  },
  {
    id: "RS-77",
    title: "A DynamoDB stream that triggers a Lambda function",
    description:
      "A table with a stream and a Lambda event source mapping (the function role gets stream permissions).",
    groundTruth: "safe",
    build: (stack) => {
      const table = new dynamodb.Table(stack, "Table", {
        partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
        stream: dynamodb.StreamViewType.NEW_IMAGE,
      });
      fn(stack, "Consumer").addEventSource(
        new sources.DynamoEventSource(table, { startingPosition: lambda.StartingPosition.LATEST }),
      );
    },
  },
  {
    id: "RS-78",
    title: "An AppSync GraphQL API with a Lambda data source",
    description:
      "An AppSync API whose data source invokes a Lambda function (AppSync service role with an inline policy).",
    groundTruth: "safe",
    build: (stack) => {
      const api = new appsync.GraphqlApi(stack, "Graph", {
        name: "g",
        definition: appsync.Definition.fromSchema(
          appsync.SchemaFile.fromAsset(join(process.cwd(), "src/trial2-probe/schema.graphql")),
        ),
      });
      api.addLambdaDataSource("Source", fn(stack, "Resolver"));
    },
  },
  {
    id: "RS-79",
    title: "A Cognito identity pool with an unauthenticated role that reads the protected bucket",
    description:
      "The pool allows unauthenticated identities and the unauthenticated role reads the protected bucket. Anyone on the internet can get the credentials. The trust policy names a Federated principal with Conditions.",
    groundTruth: "unsafe",
    build: (stack) => {
      const pool = new cognito.CfnIdentityPool(stack, "Pool", {
        allowUnauthenticatedIdentities: true,
      });
      const role = new iam.Role(stack, "Unauth", {
        assumedBy: new iam.FederatedPrincipal(
          "cognito-identity.amazonaws.com",
          {
            StringEquals: { "cognito-identity.amazonaws.com:aud": pool.ref },
            "ForAnyValue:StringLike": { "cognito-identity.amazonaws.com:amr": "unauthenticated" },
          },
          "sts:AssumeRoleWithWebIdentity",
        ),
      });
      role.addToPolicy(
        new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [ALL_PROTECTED_OBJECTS] }),
      );
      new cognito.CfnIdentityPoolRoleAttachment(stack, "Attach", {
        identityPoolId: pool.ref,
        roles: { unauthenticated: role.roleArn },
      });
    },
  },
  {
    id: "RS-80",
    title: "iam:PassRole and sagemaker:CreateNotebookInstance",
    description:
      "A deploy role may pass a role that trusts SageMaker and reads the protected bucket, and may create notebook instances.",
    groundTruth: "unsafe",
    build: (stack) => {
      const role = readRole(stack, "NotebookRole", "sagemaker.amazonaws.com");
      developerRole(stack, [
        passRole([role.roleArn]),
        new iam.PolicyStatement({
          actions: ["sagemaker:CreateNotebookInstance"],
          resources: ["*"],
        }),
      ]);
    },
  },
  {
    id: "RS-81",
    title: "An AWS Backup plan with a selection",
    description: "CDK creates a service role with AWS managed policies for the selection.",
    groundTruth: "safe",
    build: (stack) => {
      const plan = backup.BackupPlan.daily35DayRetention(stack, "Plan");
      plan.addSelection("Sel", {
        resources: [
          backup.BackupResource.fromDynamoDbTable(
            new dynamodb.Table(stack, "Orders", {
              partitionKey: { name: "id", type: dynamodb.AttributeType.STRING },
            }),
          ),
        ],
      });
    },
  },
  {
    id: "RS-82",
    title: "An AWS Config recorder with the managed policy AWS_ConfigRole",
    description:
      "A configuration recorder with a role that has the managed policy service-role/AWS_ConfigRole.",
    groundTruth: "safe",
    build: (stack) => {
      const role = new iam.Role(stack, "ConfigRole", {
        assumedBy: new iam.ServicePrincipal("config.amazonaws.com"),
        managedPolicies: [
          iam.ManagedPolicy.fromAwsManagedPolicyName("service-role/AWS_ConfigRole"),
        ],
      });
      new config.CfnConfigurationRecorder(stack, "Recorder", { roleArn: role.roleArn });
    },
  },
  {
    id: "RS-83",
    title: "An EC2 instance with AmazonSSMManagedInstanceCore and a read of the protected bucket",
    description:
      "An instance whose role has the managed policy AmazonSSMManagedInstanceCore (for Session Manager) and may read the protected bucket.",
    groundTruth: "safe",
    build: (stack) => {
      const vpc = new ec2.Vpc(stack, "Vpc", { maxAzs: 1, natGateways: 0 });
      const instance = new ec2.Instance(stack, "Host", {
        vpc,
        instanceType: new ec2.InstanceType("t3.micro"),
        machineImage: ec2.MachineImage.latestAmazonLinux2023(),
        ssmSessionPermissions: true,
      });
      instance.role.addToPrincipalPolicy(
        new iam.PolicyStatement({ actions: ["s3:GetObject"], resources: [ALL_PROTECTED_OBJECTS] }),
      );
    },
  },
  {
    id: "RS-84",
    title: "An EventBridge Scheduler schedule with a role that may invoke a function",
    description:
      "An L1 schedule whose role trusts scheduler.amazonaws.com and may invoke a Lambda function.",
    groundTruth: "safe",
    build: (stack) => {
      const target = fn(stack, "Target");
      const role = new iam.Role(stack, "SchedulerRole", {
        assumedBy: new iam.ServicePrincipal("scheduler.amazonaws.com"),
      });
      target.grantInvoke(role);
      new scheduler.CfnSchedule(stack, "Schedule", {
        scheduleExpression: "rate(1 hour)",
        flexibleTimeWindow: { mode: "OFF" },
        target: { arn: target.functionArn, roleArn: role.roleArn },
      });
    },
  },
];

/** 2回目の構成の試しのPatternの一覧です。ほかの一覧には入れません。 */
export const trial2ProbeCatalog: readonly Pattern[] = trials.map((entry) => ({
  id: entry.id,
  title: entry.title,
  description: entry.description,
  groundTruth: entry.groundTruth,
  inScope: true,
  build(app) {
    entry.build(stackOf(app));
  },
}));
