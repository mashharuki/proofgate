import type { Stack } from "aws-cdk-lib";
import { InstanceProfile, PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { PROTECTED_BUCKET_ARN } from "../config.js";
import {
  ALL_PROTECTED_OBJECTS,
  DATA_ROLE_ARN,
  developerRole,
  passRole,
  stackOf,
} from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 起動サービスの経路のPatternです（RS-39〜RS-47, spec proofgate-brushup, 設計 10）。
 * 1.1.2は、Lambda以外のサービスを経由する経路を検査しません。実装の前に予想を書いてコミットします
 * （data/launch-probe-predictions.json）。
 * Patterns for paths through launch services other than Lambda. 1.1.2 checks Lambda only; the predictions
 * are committed before the rule is implemented.
 */
interface Launch {
  readonly id: `RS-${string}`;
  readonly title: string;
  readonly description: string;
  /** 対象ロールが信頼するサービスです。 */
  readonly service: string;
  /** デプロイ用ロールが持つ起動アクションです。 */
  readonly actions: readonly string[];
  readonly groundTruth: "safe" | "unsafe";
  /** 対象ロールがバケットで持つ権限です（既定は保護対象バケットのオブジェクトの読み取り）。 */
  readonly access?: { readonly actions: readonly string[]; readonly resources: readonly string[] };
  /** EC2のように、対象ロールをインスタンスプロファイルにも入れるか。 */
  readonly instanceProfile?: boolean;
}
const target = (stack: Stack, launch: Launch): Role => {
  const role = new Role(stack, "DataRole", {
    roleName: "data-role",
    assumedBy: new ServicePrincipal(launch.service),
  });
  role.addToPolicy(
    new PolicyStatement({
      actions: [...(launch.access?.actions ?? ["s3:GetObject"])],
      resources: [...(launch.access?.resources ?? [ALL_PROTECTED_OBJECTS])],
    }),
  );
  if (launch.instanceProfile) new InstanceProfile(stack, "Profile", { role });
  return role;
};
const launches: readonly Launch[] = [
  {
    id: "RS-39",
    title: "PassRole and ecs:RunTask, a task role that reads the protected bucket",
    description:
      "A deploy role can pass the task role and run ECS tasks. The task role trusts ecs-tasks and reads every object of the protected bucket. Anyone with the deploy role can run a task with any container image as that role.",
    service: "ecs-tasks.amazonaws.com",
    actions: ["ecs:RunTask"],
    groundTruth: "unsafe",
  },
  {
    id: "RS-40",
    title: "PassRole and ec2:RunInstances, an instance role that reads the protected bucket",
    description:
      "A deploy role can pass the role and start EC2 instances. The role trusts EC2, is in an instance profile, and reads the protected bucket. The deploy role can start an instance that runs its own code as that role.",
    service: "ec2.amazonaws.com",
    actions: ["ec2:RunInstances"],
    groundTruth: "unsafe",
    instanceProfile: true,
  },
  {
    id: "RS-41",
    title: "PassRole and codebuild:CreateProject, a project role that reads the protected bucket",
    description:
      "A deploy role can pass the role and create CodeBuild projects. The role trusts CodeBuild and reads the protected bucket. A new project runs its own buildspec as that role.",
    service: "codebuild.amazonaws.com",
    actions: ["codebuild:CreateProject"],
    groundTruth: "unsafe",
  },
  {
    id: "RS-42",
    title:
      "PassRole and cloudformation:CreateStack, a service role that reads the protected bucket",
    description:
      "A deploy role can pass the role and create CloudFormation stacks. The role trusts CloudFormation and reads the protected bucket. A new stack acts with that role (for example through a custom resource).",
    service: "cloudformation.amazonaws.com",
    actions: ["cloudformation:CreateStack"],
    groundTruth: "unsafe",
  },
  {
    id: "RS-43",
    title:
      "PassRole and states:CreateStateMachine, a state machine role that reads the protected bucket",
    description:
      "A deploy role can pass the role and create Step Functions state machines. The role trusts Step Functions and reads the protected bucket. A new state machine calls AWS APIs with that role.",
    service: "states.amazonaws.com",
    actions: ["states:CreateStateMachine"],
    groundTruth: "unsafe",
  },
  {
    id: "RS-44",
    title: "The Lambda path where the data role has only s3:GetObjectVersion",
    description:
      "The escalation path of RS-02, but the data role may only read object versions (s3:GetObjectVersion). Old versions of the objects are the data of the bucket.",
    service: "lambda.amazonaws.com",
    actions: ["lambda:CreateFunction"],
    groundTruth: "unsafe",
    access: { actions: ["s3:GetObjectVersion"], resources: [ALL_PROTECTED_OBJECTS] },
  },
  {
    id: "RS-45",
    title: "The Lambda path where the data role has only s3:PutBucketPolicy",
    description:
      "The escalation path of RS-02, but the data role may only set the bucket policy of the protected bucket. With a bucket policy the role can give itself, or anyone, read access to every object.",
    service: "lambda.amazonaws.com",
    actions: ["lambda:CreateFunction"],
    groundTruth: "unsafe",
    access: { actions: ["s3:PutBucketPolicy"], resources: [PROTECTED_BUCKET_ARN] },
  },
  {
    id: "RS-46",
    title: "RS-39 without ecs:RunTask",
    description:
      "The same task role, and a deploy role that can pass it, but the deploy role may only describe tasks (ecs:DescribeTasks). Nobody can start a task with the role.",
    service: "ecs-tasks.amazonaws.com",
    actions: ["ecs:DescribeTasks"],
    groundTruth: "safe",
  },
  {
    id: "RS-47",
    title: "A passable role that trusts a service that ProofGate does not know",
    description:
      "A deploy role can pass a role that trusts a made-up service principal and reads the protected bucket. Whether that service runs code with a passed role is unknown. The ground truth is recorded as unsafe (the worst case); the expected Result is a rejection because ProofGate cannot tell.",
    service: "made-up-service.amazonaws.com",
    actions: ["lambda:CreateFunction"],
    groundTruth: "unsafe",
  },
];
/** 起動サービスのPatternの一覧です。通常の一覧にも、ホールドアウトにも、構成の試しにも入れません。 */
export const launchProbeCatalog: readonly Pattern[] = launches.map((launch) => ({
  id: launch.id,
  title: launch.title,
  description: launch.description,
  groundTruth: launch.groundTruth,
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    target(stack, launch);
    developerRole(stack, [
      passRole([DATA_ROLE_ARN]),
      new PolicyStatement({ actions: [...launch.actions], resources: ["*"] }),
    ]);
  },
}));
