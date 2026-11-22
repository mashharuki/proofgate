import type { Stack } from "aws-cdk-lib";
import {
  AccountPrincipal,
  InstanceProfile,
  PolicyStatement,
  Role,
  ServicePrincipal,
} from "aws-cdk-lib/aws-iam";
import {
  Code,
  FunctionUrlAuthType,
  Function as LambdaFunction,
  Runtime,
} from "aws-cdk-lib/aws-lambda";
import { ALL_PROTECTED_OBJECTS, dataRole, developerRole, passRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 公開されたインシデントや攻撃手法の形をしたPatternです（RS-48〜RS-53, spec proofgate-brushup, Step 7）。
 * 実行の前に予想を書いてコミットします（data/incident-probe-predictions.json）。
 * Patterns shaped like public incidents and techniques (see .kiro/steering/direction-research.md).
 * The predictions are committed before the Patterns are run.
 */
const readerRole = (stack: Stack, id: string, service: string): Role => {
  const role = new Role(stack, id, {
    roleName: "data-role",
    assumedBy: new ServicePrincipal(service),
  });
  role.addToPolicy(
    new PolicyStatement({ actions: ["s3:GetObject"], resources: [ALL_PROTECTED_OBJECTS] }),
  );
  return role;
};
const functionWith = (stack: Stack, role: Role): LambdaFunction =>
  new LambdaFunction(stack, "Reader", {
    runtime: Runtime.NODEJS_22_X,
    handler: "index.handler",
    code: Code.fromInline("exports.handler = async () => ({});"),
    role,
  });

interface Incident extends Omit<Pattern, "inScope" | "build"> {
  readonly build: (stack: Stack) => void;
}
const incidents: readonly Incident[] = [
  {
    id: "RS-48",
    title: "Shape of the Sysdig 2025 intrusion: lambda:UpdateFunctionCode on an existing function",
    description:
      "A Lambda function runs as a role that reads the protected bucket. A developer role may change the code of any function (lambda:UpdateFunctionCode on *) and has no iam:PassRole. Changing the code runs the new code as the data role. This is the path of the Lambda code injection in the Sysdig report of 2025-11-28.",
    groundTruth: "unsafe",
    build: (stack) => {
      functionWith(stack, dataRole(stack, [ALL_PROTECTED_OBJECTS]));
      developerRole(stack, [
        new PolicyStatement({ actions: ["lambda:UpdateFunctionCode"], resources: ["*"] }),
      ]);
    },
  },
  {
    id: "RS-49",
    title: "Shape of the Unit 42 2024 self-escalation: iam:AttachRolePolicy on *",
    description:
      "A CI role may attach any managed policy to any role (iam:AttachRolePolicy on *). It can attach AdministratorAccess to itself and then read the protected bucket. A data role that reads the bucket exists, but nobody can pass it.",
    groundTruth: "unsafe",
    build: (stack) => {
      dataRole(stack, [ALL_PROTECTED_OBJECTS]);
      developerRole(stack, [
        new PolicyStatement({ actions: ["iam:AttachRolePolicy"], resources: ["*"] }),
      ]);
    },
  },
  {
    id: "RS-50",
    title: "Capital One-like: iam:PassRole on * and ec2:*, an instance role that reads the bucket",
    description:
      "A deploy role has iam:PassRole on * and ec2:*. An instance role (with an instance profile) reads every object of the protected bucket. The deploy role can start an instance that runs its own code as that role. The SSRF and IMDSv1 steps of the real incident are not visible in a template.",
    groundTruth: "unsafe",
    build: (stack) => {
      const role = readerRole(stack, "DataRole", "ec2.amazonaws.com");
      new InstanceProfile(stack, "Profile", { role });
      developerRole(stack, [
        passRole(["*"]),
        new PolicyStatement({ actions: ["ec2:*"], resources: ["*"] }),
      ]);
    },
  },
  {
    id: "RS-51",
    title: "Cryptomining-shaped: iam:PassRole on * and ecs:RunTask",
    description:
      "A role has iam:PassRole on * and ecs:RunTask. An ECS task role reads the protected bucket. Anyone with the role can run a task with any image as the task role.",
    groundTruth: "unsafe",
    build: (stack) => {
      readerRole(stack, "DataRole", "ecs-tasks.amazonaws.com");
      developerRole(stack, [
        passRole(["*"]),
        new PolicyStatement({ actions: ["ecs:RunTask"], resources: ["*"] }),
      ]);
    },
  },
  {
    id: "RS-52",
    title: "A role chain: a pipeline role assumes a data role that trusts the account",
    description:
      "A pipeline role may call sts:AssumeRole on a data role. The data role trusts the account (an AWS principal, not a service) and reads the protected bucket. The pipeline role can reach the bucket in two steps. ProofGate reads trust principals that are services only.",
    groundTruth: "unsafe",
    build: (stack) => {
      const data = new Role(stack, "DataRole", {
        roleName: "data-role",
        assumedBy: new AccountPrincipal("123456789012"),
      });
      data.addToPolicy(
        new PolicyStatement({ actions: ["s3:GetObject"], resources: [ALL_PROTECTED_OBJECTS] }),
      );
      developerRole(stack, [
        new PolicyStatement({
          actions: ["sts:AssumeRole"],
          resources: ["arn:aws:iam::123456789012:role/data-role"],
        }),
      ]);
    },
  },
  {
    id: "RS-53",
    title: "A public Lambda function URL on a function whose role reads the bucket",
    description:
      "A function with AuthType NONE runs as a role that reads the protected bucket. Anyone on the internet can invoke it. No principal can pass or change anything. The ground truth is recorded as unsafe (the worst case): the function's own code decides what it returns.",
    groundTruth: "unsafe",
    build: (stack) => {
      const fn = functionWith(stack, dataRole(stack, [ALL_PROTECTED_OBJECTS]));
      fn.addFunctionUrl({ authType: FunctionUrlAuthType.NONE });
    },
  },
];

/** インシデントの形をしたPatternの一覧です。通常の一覧にも、ホールドアウトにも、ほかの試しにも入れません。 */
export const incidentProbeCatalog: readonly Pattern[] = incidents.map((incident) => ({
  id: incident.id,
  title: incident.title,
  description: incident.description,
  groundTruth: incident.groundTruth,
  inScope: true,
  build(app) {
    incident.build(stackOf(app));
  },
}));
