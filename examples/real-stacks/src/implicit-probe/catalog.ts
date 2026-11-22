import { CfnParameter, type Stack } from "aws-cdk-lib";
import { BuildSpec, Project } from "aws-cdk-lib/aws-codebuild";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Code, Function as LambdaFunction, Runtime } from "aws-cdk-lib/aws-lambda";
import { DefinitionBody, Pass, StateMachine } from "aws-cdk-lib/aws-stepfunctions";
import { ALL_PROTECTED_OBJECTS, developerRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * PassRoleの要らない経路のPatternです（RS-54〜RS-62, spec proofgate-implicit-role-paths）。
 * 実行の前に予想を書いてコミットします（data/implicit-probe-predictions.json）。
 * Patterns for paths without iam:PassRole: a principal changes a resource that already runs as a role.
 * The predictions are committed before the Patterns are run.
 */
const readerRole = (
  stack: Stack,
  id: string,
  service: string,
  resource = ALL_PROTECTED_OBJECTS,
): Role => {
  const role = new Role(stack, id, { assumedBy: new ServicePrincipal(service) });
  role.addToPolicy(new PolicyStatement({ actions: ["s3:GetObject"], resources: [resource] }));
  return role;
};
const OTHER_BUCKET_OBJECTS = "arn:aws:s3:::some-other-bucket/*";
const lambdaAs = (stack: Stack, id: string, role: Role): LambdaFunction =>
  new LambdaFunction(stack, id, {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: Code.fromInline("exports.handler = async () => ({});"),
    role,
  });
const projectAs = (stack: Stack, id: string, role: Role): Project =>
  new Project(stack, id, {
    role,
    buildSpec: BuildSpec.fromObject({
      version: "0.2",
      phases: { build: { commands: ["echo hi"] } },
    }),
  });
const machineAs = (stack: Stack, id: string, role: Role): StateMachine =>
  new StateMachine(stack, id, {
    definitionBody: DefinitionBody.fromChainable(new Pass(stack, `${id}Pass`)),
    role,
  });
const allow = (actions: string[], resources: string[] = ["*"]) =>
  new PolicyStatement({ actions, resources });

interface Implicit extends Omit<Pattern, "inScope" | "build"> {
  readonly build: (stack: Stack) => void;
}
const patterns: readonly Implicit[] = [
  {
    id: "RS-54",
    title: "lambda:UpdateFunctionCode on an existing function that reads the protected bucket",
    description:
      "A developer role may change the code of any Lambda function (lambda:UpdateFunctionCode on *) and has no iam:PassRole. The function runs as a role that reads every object of the protected bucket. The new code runs as that role (the shape of the Sysdig report of 2025-11-28).",
    groundTruth: "unsafe",
    build: (stack) => {
      lambdaAs(stack, "Reader", readerRole(stack, "DataRole", "lambda.amazonaws.com"));
      developerRole(stack, [allow(["lambda:UpdateFunctionCode"])]);
    },
  },
  {
    id: "RS-55",
    title:
      "lambda:UpdateFunctionConfiguration on an existing function that reads the protected bucket",
    description:
      "The same as RS-54 with lambda:UpdateFunctionConfiguration. A configuration update can add a layer or change the container command, which runs code in the function with its role.",
    groundTruth: "unsafe",
    build: (stack) => {
      lambdaAs(stack, "Reader", readerRole(stack, "DataRole", "lambda.amazonaws.com"));
      developerRole(stack, [allow(["lambda:UpdateFunctionConfiguration"])]);
    },
  },
  {
    id: "RS-56",
    title: "codebuild:StartBuild on a project whose service role reads the protected bucket",
    description:
      "A developer role may start builds of any CodeBuild project and override the buildspec. The project runs as a service role that reads the protected bucket.",
    groundTruth: "unsafe",
    build: (stack) => {
      projectAs(stack, "Builder", readerRole(stack, "BuildRole", "codebuild.amazonaws.com"));
      developerRole(stack, [allow(["codebuild:StartBuild"])]);
    },
  },
  {
    id: "RS-57",
    title: "codebuild:StartBuildBatch on a project whose service role reads the protected bucket",
    description: "The same as RS-56 with codebuild:StartBuildBatch.",
    groundTruth: "unsafe",
    build: (stack) => {
      projectAs(stack, "Builder", readerRole(stack, "BuildRole", "codebuild.amazonaws.com"));
      developerRole(stack, [allow(["codebuild:StartBuildBatch"])]);
    },
  },
  {
    id: "RS-58",
    title: "states:UpdateStateMachine on a state machine whose role reads the protected bucket",
    description:
      "A developer role may update any state machine (definition only). The state machine runs as a role that reads the protected bucket. A new definition calls AWS APIs as that role.",
    groundTruth: "unsafe",
    build: (stack) => {
      machineAs(stack, "Flow", readerRole(stack, "FlowRole", "states.amazonaws.com"));
      developerRole(stack, [allow(["states:UpdateStateMachine"])]);
    },
  },
  {
    id: "RS-59",
    title: "StartBuild scoped to a project that cannot reach the protected bucket",
    description:
      "Two CodeBuild projects. Project A runs as a role that reads the protected bucket, project B as a role that reads another bucket. The developer role may start builds of project B only (the Resource is the ARN of project B). Nothing reaches the protected bucket. Read as *, the ARN would match project A.",
    groundTruth: "safe",
    build: (stack) => {
      projectAs(stack, "ProjectA", readerRole(stack, "RoleA", "codebuild.amazonaws.com"));
      const b = projectAs(
        stack,
        "ProjectB",
        readerRole(stack, "RoleB", "codebuild.amazonaws.com", OTHER_BUCKET_OBJECTS),
      );
      developerRole(stack, [allow(["codebuild:StartBuild"], [b.projectArn])]);
    },
  },
  {
    id: "RS-60",
    title: "UpdateFunctionCode on a function that cannot reach the protected bucket",
    description:
      "The function runs as a role that reads another bucket only. The developer role may change any function. Nothing reaches the protected bucket.",
    groundTruth: "safe",
    build: (stack) => {
      lambdaAs(
        stack,
        "Reader",
        readerRole(stack, "DataRole", "lambda.amazonaws.com", OTHER_BUCKET_OBJECTS),
      );
      developerRole(stack, [allow(["lambda:UpdateFunctionCode"])]);
    },
  },
  {
    id: "RS-61",
    title: "A function whose role comes from a parameter, and a role that may change any function",
    description:
      "The role of the function is a CloudFormation parameter, so ProofGate cannot see what it can reach. A developer role may change any function. The ground truth is recorded as unsafe (the worst case); the expected Result is a rejection because ProofGate cannot tell.",
    groundTruth: "unsafe",
    build: (stack) => {
      const roleArn = new CfnParameter(stack, "FunctionRoleArn", { type: "String" });
      new LambdaFunction(stack, "Reader", {
        runtime: Runtime.NODEJS_22_X,
        handler: "index.handler",
        code: Code.fromInline("exports.handler = async () => ({});"),
        role: Role.fromRoleArn(stack, "ImportedRole", roleArn.valueAsString, { mutable: false }),
      });
      developerRole(stack, [allow(["lambda:UpdateFunctionCode"])]);
    },
  },
  {
    id: "RS-62",
    title: "A role that changes the function that runs as itself",
    description:
      "The function runs as the developer role itself (it trusts Lambda, reads the protected bucket, and may change the function). Changing its own function gives it nothing it does not already have.",
    groundTruth: "safe",
    build: (stack) => {
      const role = readerRole(stack, "SelfRole", "lambda.amazonaws.com");
      role.addToPolicy(allow(["lambda:UpdateFunctionCode"]));
      lambdaAs(stack, "Reader", role);
    },
  },
];

/** PassRoleの要らない経路のPatternの一覧です。ほかの一覧には入れません。 */
export const implicitProbeCatalog: readonly Pattern[] = patterns.map((entry) => ({
  id: entry.id,
  title: entry.title,
  description: entry.description,
  groundTruth: entry.groundTruth,
  inScope: true,
  build(app) {
    entry.build(stackOf(app));
  },
}));
