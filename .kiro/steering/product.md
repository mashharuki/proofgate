# Product

ProofGate is a pre-deployment gate for AWS CDK. It reads the CloudFormation that `cdk synth` produces, extracts a small IAM model, and asks Lean 4 to prove an application-specific safety property before the stack is accepted.

## Problem

Individually reasonable IAM statements can combine into a privilege-escalation path. Linters check statements one at a time and do not express rules such as "no principal may reach this bucket through another role".

The first rule (`PG-IAM-004`) detects this path to a protected S3 bucket:

1. A principal holds `iam:PassRole` for a target role.
2. The same principal holds a launch action: an action that hands a role to a service, from the table generated from the AWS Service Reference (879 actions: Lambda `CreateFunction` and `UpdateFunctionConfiguration`, ECS `RunTask`, EC2 `RunInstances`, CodeBuild, CloudFormation, Step Functions, Glue, and others). Up to 1.1.2 only Lambda was checked; up to 1.1.1 a Lambda configuration update counted only with a code update.
3. The target role trusts the service that the launch action hands the role to (a regional principal is read as the global one; trust `*` counts for every service).
4. The target role can access a protected S3 bucket.

A second shape needs no `iam:PassRole` (spec `proofgate-implicit-role-paths`): a principal can change an existing Lambda function (`lambda:UpdateFunctionCode`, `lambda:UpdateFunctionConfiguration`), CodeBuild project (`codebuild:StartBuild`, `codebuild:StartBuildBatch`), or Step Functions state machine (`states:UpdateStateMachine`) that already runs as a role that can access a protected S3 bucket. Both shapes are `PG-IAM-004`. A resource whose role cannot be identified and that a principal can change is `PG-IAM-003`. `allowedPassRoleTargets` allows both shapes.

A third rule, `PG-IAM-005` (spec `proofgate-self-escalation`), reports a role that can change IAM itself: a self-grant (`iam:PutRolePolicy` or `iam:AttachRolePolicy` on its own role), a take-over (`iam:UpdateAssumeRolePolicy` on another role that reaches a protected bucket), or a creation grant (`iam:CreateRole` with a grant action on intersecting role-ARN Resources). A self-grant is reported even if the role reaches no bucket today; administrator roles are reported. `allowedPolicyWriters` allows a role that writes IAM on purpose.

## Users

- Platform and security engineers who own CDK-based AWS infrastructure and need deploy-time guardrails.
- Application teams who want to declare which resources are protected, in code, next to their stack.

## Outcomes

- Plain `cdk synth` still succeeds for both example apps.
- With ProofGate enabled, `safe-app` passes and `vulnerable-app` is rejected with `PG-IAM-004`.
- Anything ProofGate cannot model is rejected with `PG-IAM-003`, never assumed safe. This includes a passable, bucket-reaching role that trusts a service that is in no value of the launch table.
- A template without any `AWS::IAM::` resource is accepted with nothing to check; that is not a proof.

## Non-goals

- ProofGate is not a full IAM policy evaluator (see `docs/ASSUMPTIONS.md`).
- ProofGate does not depend on Kiro at runtime. Kiro is a development tool only.
