import type { CfnElement, Stack } from "aws-cdk-lib";
import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { ALL_PROTECTED_OBJECTS, dataRole, developerRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 自己昇格のPatternです（RS-63〜RS-72, spec proofgate-self-escalation）。
 * ロールが、IAMを書き換えて、自分に権限を与える、または別のロールを乗っ取る形です。
 * 実行の前に予想を書いてコミットします（data/policy-write-probe-predictions.json）。
 * Patterns for roles that change IAM: a self-grant, a take-over, a creation grant. The predictions are committed first.
 */
const allow = (actions: string[], resources: string[]) =>
  new PolicyStatement({ actions, resources });
/** バケットを読めないロール（Lambdaが引き受ける）です。 */
const quietRole = (stack: Stack, id: string, roleName?: string): Role =>
  new Role(stack, id, {
    ...(roleName === undefined ? {} : { roleName }),
    assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
  });
/** IAMを書き換えるロールです。EC2が引き受けます。 */
const writer = (stack: Stack, id: string, roleName?: string): Role =>
  new Role(stack, id, {
    ...(roleName === undefined ? {} : { roleName }),
    assumedBy: new ServicePrincipal("ec2.amazonaws.com"),
  });

interface PolicyWrite extends Omit<Pattern, "inScope" | "build" | "configFor"> {
  readonly inScope?: boolean;
  readonly boundary?: Pattern["boundary"];
  readonly build: (stack: Stack) => void;
  readonly configFor?: (stack: Stack) => { allowedPolicyWriters?: readonly string[] };
}
let acknowledgedWriter: Role | undefined;
const patterns: readonly PolicyWrite[] = [
  {
    id: "RS-63",
    title: "iam:PutRolePolicy on its own role",
    description:
      "A role may write an inline policy to its own role (iam:PutRolePolicy on its own ARN). It can give itself access to the protected bucket and to every other bucket.",
    groundTruth: "unsafe",
    build: (stack) => {
      const role = writer(stack, "Writer");
      role.addToPolicy(allow(["iam:PutRolePolicy"], [role.roleArn]));
    },
  },
  {
    id: "RS-64",
    title: "iam:AttachRolePolicy on its own role",
    description:
      "A role may attach a managed policy to its own role (iam:AttachRolePolicy on its own ARN, for example AdministratorAccess).",
    groundTruth: "unsafe",
    build: (stack) => {
      const role = writer(stack, "Writer");
      role.addToPolicy(allow(["iam:AttachRolePolicy"], [role.roleArn]));
    },
  },
  {
    id: "RS-65",
    title: "iam:PutRolePolicy on arn:aws:iam::*:role/*",
    description: "The Resource may denote the role itself. The role holds no other permission.",
    groundTruth: "unsafe",
    build: (stack) => {
      writer(stack, "Writer").addToPolicy(allow(["iam:PutRolePolicy"], ["arn:aws:iam::*:role/*"]));
    },
  },
  {
    id: "RS-66",
    title: "iam:PutRolePolicy on another role that nobody can use",
    description:
      "A role may write a policy to OtherRole only. OtherRole is assumed by a service, so the first role cannot use it, and OtherRole cannot reach the bucket. Role chains are not modeled; the ground truth is safe because the first role cannot become OtherRole.",
    groundTruth: "safe",
    build: (stack) => {
      const other = quietRole(stack, "OtherRole");
      writer(stack, "Writer").addToPolicy(allow(["iam:PutRolePolicy"], [other.roleArn]));
    },
  },
  {
    id: "RS-67",
    title: "iam:UpdateAssumeRolePolicy on the data role",
    description:
      "A role may rewrite the trust policy of the data role, which reads the protected bucket. It can add itself and assume the data role (take-over).",
    groundTruth: "unsafe",
    build: (stack) => {
      const data = dataRole(stack, [ALL_PROTECTED_OBJECTS]);
      developerRole(stack, [allow(["iam:UpdateAssumeRolePolicy"], [data.roleArn])]);
    },
  },
  {
    id: "RS-68",
    title: "iam:UpdateAssumeRolePolicy on a role that cannot reach the bucket",
    description:
      "The same, but the role whose trust policy can be rewritten cannot reach the protected bucket.",
    groundTruth: "safe",
    build: (stack) => {
      const other = quietRole(stack, "OtherRole");
      developerRole(stack, [allow(["iam:UpdateAssumeRolePolicy"], [other.roleArn])]);
    },
  },
  {
    id: "RS-69",
    title: "Creation grant: iam:CreateRole and iam:AttachRolePolicy on role/ci-*",
    description:
      "A named role may create roles and attach policies to roles whose names start with ci-. Its own name does not match, so only the creation grant applies. It creates a role with AdministratorAccess and a trust policy of its choice (the Unit 42 shape of 2024).",
    groundTruth: "unsafe",
    build: (stack) => {
      const role = writer(stack, "Pipeline", "pipeline-role");
      role.addToPolicy(
        allow(["iam:CreateRole", "iam:AttachRolePolicy"], ["arn:aws:iam::*:role/ci-*"]),
      );
    },
  },
  {
    id: "RS-70",
    title: "Creation grant with two prefixes and account *",
    description:
      "iam:CreateRole on arn:aws:iam::*:role/ci-* and iam:AttachRolePolicy on arn:aws:iam::*:role/data-*. A named role, so no self-grant. The prefixes look disjoint, but they share role ARNs: iam:CreateRole accepts a Path with a colon (IAM API Reference, CreateRole, read 2026-11-22), so the role created with Path /ci-a:role/data-/ has an ARN that matches both patterns (the account * takes '<account>:role/ci-a'). The ground truth was 'safe' until 2026-11-22 and was corrected to 'unsafe' with the user's approval; the predictions and the baseline keep the old value.",
    groundTruth: "unsafe",
    build: (stack) => {
      const role = writer(stack, "Pipeline", "pipeline-role");
      role.addToPolicy(allow(["iam:CreateRole"], ["arn:aws:iam::*:role/ci-*"]));
      role.addToPolicy(allow(["iam:AttachRolePolicy"], ["arn:aws:iam::*:role/data-*"]));
    },
  },
  {
    id: "RS-71",
    title: "An administrator role (Action * on Resource *)",
    description:
      "The only role of the stack has every permission. It can write IAM and reach every bucket. There is no other role to pass, so the PassRole rule reports nothing.",
    groundTruth: "unsafe",
    build: (stack) => {
      writer(stack, "Admin").addToPolicy(allow(["*"], ["*"]));
    },
  },
  {
    id: "RS-72",
    title: "A pipeline role that writes IAM on purpose, listed in allowedPolicyWriters",
    description:
      "The role may write a policy to its own role, and the author lists it in allowedPolicyWriters. The path exists (ground truth unsafe); the author has acknowledged it (not in scope). On main the field does not exist and is ignored.",
    groundTruth: "unsafe",
    inScope: false,
    boundary: "acknowledged",
    build: (stack) => {
      const role = writer(stack, "Pipeline");
      role.addToPolicy(allow(["iam:PutRolePolicy"], [role.roleArn]));
      acknowledgedWriter = role;
    },
    configFor: (stack) =>
      acknowledgedWriter === undefined
        ? {}
        : {
            allowedPolicyWriters: [
              stack.getLogicalId(acknowledgedWriter.node.defaultChild as CfnElement),
            ],
          },
  },
];

/** 自己昇格のPatternの一覧です。ほかの一覧には入れません。 */
export const policyWriteProbeCatalog: readonly Pattern[] = patterns.map((entry) => {
  let stack: Stack | undefined;
  return {
    id: entry.id,
    title: entry.title,
    description: entry.description,
    groundTruth: entry.groundTruth,
    inScope: entry.inScope ?? true,
    ...(entry.boundary === undefined ? {} : { boundary: entry.boundary }),
    build(app) {
      stack = stackOf(app);
      entry.build(stack);
    },
    ...(entry.configFor === undefined
      ? {}
      : {
          configFor: () => (stack === undefined ? {} : (entry.configFor?.(stack) ?? {})),
        }),
  };
});
