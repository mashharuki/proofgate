import { ProofGateValidator } from "@proofgate-cdk/cdk-plugin";
import { App, CfnParameter, Stack, Validations } from "aws-cdk-lib";
import { LambdaIntegration, RestApi } from "aws-cdk-lib/aws-apigateway";
import { BuildSpec, Project } from "aws-cdk-lib/aws-codebuild";
import { AttributeType, Table } from "aws-cdk-lib/aws-dynamodb";
import { ContainerImage, FargateTaskDefinition } from "aws-cdk-lib/aws-ecs";
import type { CfnRole } from "aws-cdk-lib/aws-iam";
import { ManagedPolicy, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { SqsEventSource } from "aws-cdk-lib/aws-lambda-event-sources";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { DefinitionBody, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { LambdaInvoke } from "aws-cdk-lib/aws-stepfunctions-tasks";
import { VARIANTS } from "./variants.js";

// The bucket to protect. ProofGate needs a literal ARN, so the bucket has a fixed name.
const PROTECTED_BUCKET_NAME = "proofgate-trial-customer-data";
const PROTECTED_BUCKET_ARN = `arn:aws:s3:::${PROTECTED_BUCKET_NAME}`;

const app = new App();
const variant = app.node.tryGetContext("variant") ?? "safe";

const uses = (name: string) => variant === name || variant === "all-risky";
if (!(VARIANTS as readonly string[]).includes(variant)) {
  throw new Error(`Unknown variant "${variant}". Use -c variant=<${VARIANTS.join("|")}>.`);
}
const stack = new Stack(app, "TrialStack");

// An ordinary CDK layout: a Lambda function that reads the protected bucket through grantRead.
const data = new Bucket(stack, "CustomerData", { bucketName: PROTECTED_BUCKET_NAME });
const reader = new LambdaFunction(stack, "Reader", {
  runtime: Runtime.NODEJS_22_X,
  handler: "index.handler",
  code: Code.fromInline("exports.handler = async () => ({});"),
});
data.grantRead(reader);

if (variant === "risky" || variant === "all-risky" || variant === "acknowledged") {
  // A deploy role that may pass the reader's execution role and create Lambda functions.
  // Anyone with this role can create a new function that runs as the reader role and reads the bucket.
  const deployer = new Role(stack, "Deployer", {
    assumedBy: new ServicePrincipal("codebuild.amazonaws.com"),
  });
  deployer.addToPolicy(
    new PolicyStatement({ actions: ["iam:PassRole"], resources: [reader.role?.roleArn ?? "*"] }),
  );
  deployer.addToPolicy(
    new PolicyStatement({ actions: ["lambda:CreateFunction"], resources: ["*"] }),
  );
}

if (variant === "apigw" || variant === "apigw-no-log-role") {
  // A REST API in front of the reader. By default CDK also creates a CloudWatch logs role for
  // API Gateway with the managed policy AmazonAPIGatewayPushToCloudWatchLogs.
  const api = new RestApi(stack, "Api", { cloudWatchRole: variant === "apigw" });
  api.root.addMethod("GET", new LambdaIntegration(reader));
}

if (variant === "parameter") {
  // A second bucket whose name is a CloudFormation parameter, read by the same function.
  const name = new CfnParameter(stack, "ArchiveBucketName", { type: "String" });
  reader.addToRolePolicy(
    new PolicyStatement({
      actions: ["s3:GetObject"],
      resources: [`arn:aws:s3:::${name.valueAsString}/*`],
    }),
  );
}

if (uses("sqs")) {
  // The reader consumes messages from a queue (CDK adds sqs:ReceiveMessage and friends on the queue ARN).
  const jobs = new Queue(stack, "Jobs");
  reader.addEventSource(new SqsEventSource(jobs));
}
if (uses("dynamodb")) {
  const table = new Table(stack, "Orders", {
    partitionKey: { name: "id", type: AttributeType.STRING },
  });
  table.grantReadWriteData(reader);
}
if (uses("stepfunctions")) {
  new StateMachine(stack, "Flow", {
    definitionBody: DefinitionBody.fromChainable(
      new LambdaInvoke(stack, "InvokeReader", { lambdaFunction: reader }),
    ),
  });
}
if (uses("ecs")) {
  // A Fargate task whose task role reads the protected bucket.
  const task = new FargateTaskDefinition(stack, "Report");
  task.addContainer("App", {
    image: ContainerImage.fromRegistry("public.ecr.aws/docker/library/busybox:latest"),
  });
  data.grantRead(task.taskRole);
}

// Other ways to write the same escalation path (B of the trial).
const deployerIn = (scope: Stack) =>
  new Role(scope, "Deployer", { assumedBy: new ServicePrincipal("codebuild.amazonaws.com") });
const createFunctions = new PolicyStatement({
  actions: ["lambda:CreateFunction"],
  resources: ["*"],
});
if (variant === "pass-wildcard") {
  const d = deployerIn(stack);
  d.addToPolicy(
    new PolicyStatement({ actions: ["iam:PassRole"], resources: ["arn:aws:iam::*:role/*"] }),
  );
  d.addToPolicy(createFunctions);
}
if (variant === "pass-prefix") {
  const d = deployerIn(stack);
  d.addToPolicy(
    new PolicyStatement({
      actions: ["iam:PassRole"],
      resources: [`arn:aws:iam::${stack.account}:role/TrialStack-*`],
    }),
  );
  d.addToPolicy(createFunctions);
}
if (variant === "grant-pass") {
  const d = deployerIn(stack);
  reader.role?.grantPassRole(d);
  d.addToPolicy(createFunctions);
}
if (variant === "update-pair" || variant === "update-config-only") {
  const d = deployerIn(stack);
  reader.role?.grantPassRole(d);
  const actions =
    variant === "update-pair"
      ? ["lambda:UpdateFunctionConfiguration", "lambda:UpdateFunctionCode"]
      : ["lambda:UpdateFunctionConfiguration"];
  d.addToPolicy(new PolicyStatement({ actions, resources: [reader.functionArn] }));
}
if (variant === "admin-managed") {
  const d = deployerIn(stack);
  d.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName("AdministratorAccess"));
}
if (variant === "cross-stack") {
  const other = new Stack(app, "DeployerStack");
  const d = deployerIn(other);
  d.addToPolicy(
    new PolicyStatement({ actions: ["iam:PassRole"], resources: [reader.role?.roleArn ?? "*"] }),
  );
  d.addToPolicy(createFunctions);
}
// Paths without iam:PassRole (spec proofgate-implicit-role-paths): a deploy role may change an existing resource that runs as a
// role that reads the protected bucket.
if (variant.startsWith("implicit-")) {
  const d = deployerIn(stack);
  if (variant === "implicit-code") {
    d.addToPolicy(
      new PolicyStatement({ actions: ["lambda:UpdateFunctionCode"], resources: ["*"] }),
    );
  }
  if (variant === "implicit-function-arn") {
    d.addToPolicy(
      new PolicyStatement({
        actions: ["lambda:UpdateFunctionCode"],
        resources: [reader.functionArn],
      }),
    );
  }
  if (variant === "implicit-other-function") {
    const other = new LambdaFunction(stack, "Other", {
      runtime: Runtime.NODEJS_22_X,
      handler: "index.handler",
      code: Code.fromInline("exports.handler = async () => ({});"),
    });
    d.addToPolicy(
      new PolicyStatement({
        actions: ["lambda:UpdateFunctionCode"],
        resources: [other.functionArn],
      }),
    );
  }
  if (variant === "implicit-codebuild") {
    const project = new Project(stack, "Build", {
      buildSpec: BuildSpec.fromObject({
        version: "0.2",
        phases: { build: { commands: ["echo hi"] } },
      }),
    });
    data.grantRead(project);
    d.addToPolicy(new PolicyStatement({ actions: ["codebuild:StartBuild"], resources: ["*"] }));
  }
}
// Roles that change IAM themselves (spec proofgate-self-escalation, PG-IAM-005): a deploy role may attach any managed
// policy to any role, its own included.
const policyWriters: string[] = [];
if (variant === "policy-attach-star" || variant === "policy-writer-allowed") {
  const d = deployerIn(stack);
  d.addToPolicy(new PolicyStatement({ actions: ["iam:AttachRolePolicy"], resources: ["*"] }));
  if (variant === "policy-writer-allowed") {
    policyWriters.push(stack.getLogicalId(d.node.defaultChild as CfnRole));
  }
}
if (variant === "acknowledged") {
  Validations.of(app).acknowledge({
    id: "ProofGate::PG-IAM-004",
    reason: "Trial: shows what an acknowledgement does. Not a real exception.",
  });
}

// Register ProofGate only when PROOFGATE=1, so plain synth and deploy are not affected.
if (process.env.PROOFGATE === "1") {
  Validations.of(app).addPlugins(
    // allowedPolicyWritersは1.1.2の次の版からあります。npmの1.1.2と比べるコピー（scripts/prepare-npm-copy.mjs）でも
    // コンパイルできるよう、型を広げて渡します。1.1.2はこの項目を無視します。
    // allowedPolicyWriters exists from the version after 1.1.2. The cast keeps the copy that uses 1.1.2 from npm
    // (scripts/prepare-npm-copy.mjs) compiling; 1.1.2 ignores the field.
    new ProofGateValidator({
      protectedBucketArns: [PROTECTED_BUCKET_ARN],
      ...(policyWriters.length > 0 ? { allowedPolicyWriters: policyWriters } : {}),
    } as ConstructorParameters<typeof ProofGateValidator>[0]),
  );
}

app.synth();
