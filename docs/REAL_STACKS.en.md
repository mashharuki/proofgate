# Results on realistic stacks

This document records how ProofGate behaved on stacks that are close to real CDK code (Patterns). The Patterns were chosen from common CDK usage before the supported syntax was decided. **The Patterns are a sample, not a coverage claim.** The table does not say how ProofGate behaves on other CDK projects.

Subject: `examples/real-stacks` (aws-cdk-lib 2.277.0). Protected bucket: `arn:aws:s3:::proofgate-protected-data`. No AWS credentials or network are used.

## How to run

```bash
pnpm build
pnpm real-stacks            # compares the 14 Patterns with the expected table (0 match, 1 difference, 2 harness error)
pnpm real-stacks --cli all   # also runs the real cdk synth CLI (about one minute)
pnpm real-stacks --implicit --cli none   # the nine Patterns RS-54 to RS-62 (paths without iam:PassRole)
pnpm real-stacks --incident --cli none   # the six incident-shaped Patterns RS-48 to RS-53 (observed only; --holdout, --probe, --launch work the same way)
```

To synthesize one Pattern, run `pnpm exec cdk synth -c pattern=RS-02` in `examples/real-stacks` (with ProofGate: `PROOFGATE=1`).

## The 14 Patterns of the acceptance set (RS-01 to RS-14)

The ground truth is a reviewed value based on AWS semantics, independent of ProofGate's result. Every prediction was committed before any Pattern was run with ProofGate (`data/predictions.json`). No prediction for 1.0.1 was wrong.

On 1.0.1, 8 of 14 Patterns gave `PG-IAM-003` (unsupported). The common causes were a non-literal `Resource`, managed policies, and a trust-policy `Condition`. The follow-up spec `proofgate-cdk-construct-support` made part of these readable (`docs/SUPPORTED_IAM.md`). The current Results are its targets.

| ID    | Pattern                                                         | Ground truth | In scope            | Predicted (1.0.1) | 1.0.1      | 1.0.1 reasons                                                        | Current    | Current class                   |
| ----- | --------------------------------------------------------------- | ------------ | ------------------- | ----------------- | ---------- | -------------------------------------------------------------------- | ---------- | ------------------------------- |
| RS-01 | Literal roles, the data role reaches another bucket             | safe         | yes                 | accepted          | accepted   | -                                                                    | accepted   | correct acceptance              |
| RS-02 | Literal roles, a complete escalation path                       | unsafe       | yes                 | PG-IAM-004        | PG-IAM-004 | -                                                                    | PG-IAM-004 | correct detection               |
| RS-03 | A prefix grant, a ? wildcard, and split Lambda statements       | unsafe       | yes                 | PG-IAM-004        | PG-IAM-004 | -                                                                    | PG-IAM-004 | correct detection               |
| RS-04 | The same path, written as role-level inline policies            | unsafe       | yes                 | PG-IAM-004        | PG-IAM-004 | -                                                                    | PG-IAM-004 | correct detection               |
| RS-05 | A Lambda function with bucket.grantRead                         | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, managed policy, vacuous proof                  | accepted   | correct acceptance              |
| RS-06 | A role with bucket.grantReadWrite                               | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, vacuous proof                                  | accepted   | correct acceptance              |
| RS-07 | A Step Functions state machine that invokes a Lambda function   | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, trust Condition, managed policy, vacuous proof | accepted   | correct acceptance              |
| RS-08 | An ECS Fargate task with grantReadWrite on the task role        | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, vacuous proof                                  | accepted   | correct acceptance              |
| RS-09 | An EventBridge rule with a Lambda target                        | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | managed policy, vacuous proof                                        | accepted   | correct acceptance              |
| RS-10 | A CodeBuild project that can pass any role and create functions | unsafe       | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource                                                 | PG-IAM-004 | correct detection               |
| RS-11 | The escalation path next to an unrelated grantRead              | unsafe       | yes                 | PG-IAM-003        | PG-IAM-003 | non-literal Resource, managed policy                                 | PG-IAM-004 | correct detection               |
| RS-12 | A policy variable in a resource                                 | safe         | yes                 | PG-IAM-003        | PG-IAM-003 | policy variable, vacuous proof                                       | PG-IAM-003 | rejected as unsupported         |
| RS-13 | The escalation path crosses two stacks                          | unsafe       | no (cross-template) | accepted          | accepted   | -                                                                    | accepted   | outside the documented boundary |
| RS-14 | The author acknowledges the finding                             | unsafe       | no (acknowledged)   | accepted          | accepted   | -                                                                    | accepted   | outside the documented boundary |

- "outside the documented boundary" means the path is outside the model: RS-13 crosses two stacks, and in RS-14 the author silences the finding with CDK `acknowledge`. ProofGate accepts both.
- RS-12 still gives `PG-IAM-003` because its `Resource` contains an IAM policy variable (the ground truth is safe, but variables are not evaluated).

## The 8 hold-out Patterns (RS-15 to RS-22)

They were not used to design the rules. Ground truth and predictions were committed before the implementation (`data/holdout-predictions.json`), and the set was run once after it (`data/holdout-results.json`). All 8 were as predicted.

| ID    | Pattern                                                                        | Ground truth | In scope            | 1.0.1      | Predicted after | Observed after | Class                           | Reasons        |
| ----- | ------------------------------------------------------------------------------ | ------------ | ------------------- | ---------- | --------------- | -------------- | ------------------------------- | -------------- |
| RS-15 | An API Gateway REST API with a Lambda integration                              | safe         | yes                 | PG-IAM-003 | PG-IAM-003      | PG-IAM-003     | rejected as unsupported         | managed policy |
| RS-16 | An SQS queue with grantSendMessages to a Lambda function                       | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-17 | A DynamoDB table with grantReadWriteData to a Lambda function                  | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-18 | A Lambda function with an S3 event source                                      | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-19 | A KMS key with grantEncryptDecrypt to a role                                   | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-20 | A deploy role passes an unnamed execution role that reads the protected bucket | unsafe       | yes                 | PG-IAM-003 | PG-IAM-004      | PG-IAM-004     | correct detection               | -              |
| RS-21 | A deploy role passes an unnamed execution role that reads another bucket       | safe         | yes                 | PG-IAM-003 | accepted        | accepted       | correct acceptance              | -              |
| RS-22 | A deploy role passes an imported role                                          | unsafe       | no (cross-template) | accepted   | accepted        | accepted       | outside the documented boundary | -              |

- RS-15 still gives `PG-IAM-003`: the API Gateway logging role uses the managed policy `AmazonAPIGatewayPushToCloudWatchLogs`, which is not in the table.
- RS-20 and RS-21 are not fully independent of the implementation: the unit tests that found a defect of the value resolver copy their layouts.

## Trial with 1.1.1 from npm (2026-11-20)

`@proofgate-cdk/cdk-plugin@1.1.1` was installed from npm in a small CDK app outside the repository (aws-cdk-lib 2.277.0; protected bucket with a fixed name, `arn:aws:s3:::proofgate-trial-customer-data`). The expected result of each variant was written before it was run. All 18 variants gave the expected result. Every `cdk synth` without ProofGate passed. The trial app is not part of the repository.

| Variant              | Content                                                                                           | With ProofGate                   |
| -------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------- |
| `safe`               | a Lambda function reads the protected bucket through `grantRead`                                  | accepted                         |
| `risky`              | safe plus a deploy role with `iam:PassRole` on `role.roleArn` and `lambda:CreateFunction`         | `PG-IAM-004`                     |
| `apigw`              | a REST API (CDK gives its logging role the managed policy `AmazonAPIGatewayPushToCloudWatchLogs`) | `PG-IAM-003`                     |
| `apigw-no-log-role`  | apigw with `cloudWatchRole: false`                                                                | accepted                         |
| `parameter`          | a statement whose bucket name is a CloudFormation parameter                                       | `PG-IAM-003`                     |
| `sqs`                | an SQS event source                                                                               | accepted                         |
| `dynamodb`           | `grantReadWriteData`                                                                              | accepted                         |
| `stepfunctions`      | a Step Functions state machine invokes the function                                               | accepted                         |
| `ecs`                | a Fargate task role reads the protected bucket                                                    | accepted                         |
| `all-risky`          | sqs, dynamodb, stepfunctions, ecs, and risky together                                             | `PG-IAM-004` (one path)          |
| `pass-wildcard`      | `iam:PassRole` on `arn:aws:iam::*:role/*`                                                         | `PG-IAM-004`                     |
| `pass-prefix`        | `iam:PassRole` on `role/TrialStack-*` (account as a token)                                        | `PG-IAM-004`                     |
| `grant-pass`         | `role.grantPassRole(deployer)`                                                                    | `PG-IAM-004`                     |
| `update-pair`        | configuration update and code update instead of creation                                          | `PG-IAM-004`                     |
| `update-config-only` | configuration update only                                                                         | accepted (likely missed path)    |
| `admin-managed`      | `AdministratorAccess` on the deploy role                                                          | `PG-IAM-003`                     |
| `cross-stack`        | the deploy role in another stack, the ARN passed by a cross-stack reference                       | `PG-IAM-003` (`Fn::ImportValue`) |
| `acknowledged`       | risky, silenced with `acknowledge`                                                                | accepted (outside the boundary)  |

What the trial showed:

- `update-config-only` is accepted, as the current rule defines: taking over an existing function counts only with both a configuration update and a code update. But the AWS API reference shows that `UpdateFunctionConfiguration` alone can change the execution role (`Role`) and the layers (`Layers`, also from other accounts), so arbitrary code may run without a code update. This is handled as a fix task (see `CHANGELOG.md`).
- The `ecs` task role can read the protected bucket, and nothing is reported. `PG-IAM-004` covers paths through Lambda only; an ECS path such as `iam:PassRole` with `ecs:RunTask` is not checked.
- `cross-stack` gives `PG-IAM-003` because the ARN is passed by a cross-stack reference. With the ARN written as a literal (RS-13), the template is accepted.
- The protected bucket has a `bucketName` and is given as a literal ARN. An unnamed protected bucket makes ProofGate miss the path (`docs/ASSUMPTIONS.md`).

## Construct probe (RS-23 to RS-38) and launch services (RS-39 to RS-47) (spec proofgate-brushup, 2026-11-21)

Sixteen common CDK constructs were run with 1.1.2 and with the current code. The current results all match the predictions committed before the implementation (`examples/real-stacks/data/construct-probe-predictions.json`). None has an escalation path (ground truth safe). On 1.1.2 five gave `PG-IAM-003`: the managed policy `AWSLambdaVPCAccessExecutionRole`, a template without IAM resources (two), and `Fn::Sub` (two).

| ID    | Construct                                                                       | 1.1.2      | Current code |
| ----- | ------------------------------------------------------------------------------- | ---------- | ------------ |
| RS-23 | A Lambda function in a VPC                                                      | PG-IAM-003 | accepted     |
| RS-24 | A Lambda function with active X-Ray tracing                                     | accepted   | accepted     |
| RS-25 | A Lambda function with logRetention                                             | accepted   | accepted     |
| RS-26 | A Lambda function with its own log group                                        | accepted   | accepted     |
| RS-27 | An SNS topic with a Lambda subscription                                         | accepted   | accepted     |
| RS-28 | A Kinesis stream with grantRead to a Lambda function                            | accepted   | accepted     |
| RS-29 | A Secrets Manager secret with grantRead to a Lambda function                    | accepted   | accepted     |
| RS-30 | A Cognito user pool                                                             | PG-IAM-003 | accepted     |
| RS-31 | A CloudFront distribution with the protected bucket as an S3 origin             | PG-IAM-003 | accepted     |
| RS-32 | A BucketDeployment into the protected bucket                                    | PG-IAM-003 | accepted     |
| RS-33 | An AwsCustomResource calling SSM                                                | accepted   | accepted     |
| RS-34 | A CodeBuild project with an inline buildspec                                    | accepted   | accepted     |
| RS-35 | An Application Load Balanced Fargate service                                    | accepted   | accepted     |
| RS-36 | A scheduled EventBridge rule with a Lambda target                               | accepted   | accepted     |
| RS-37 | A bucket with autoDeleteObjects                                                 | PG-IAM-003 | accepted     |
| RS-38 | A Lambda function with an SSM statement built from the stack account and region | accepted   | accepted     |

The nine launch-service Patterns run with `pnpm real-stacks --launch`. The current results all match the predictions (`launch-probe-predictions.json`). 1.1.2 accepted seven of the eight unsafe ones (missed paths); RS-40 gave `PG-IAM-003` because the instance profile could not be read.

| ID    | Layout                                                           | Ground truth                 | 1.1.2      | Current code |
| ----- | ---------------------------------------------------------------- | ---------------------------- | ---------- | ------------ |
| RS-39 | `iam:PassRole` and `ecs:RunTask`                                 | unsafe                       | accepted   | PG-IAM-004   |
| RS-40 | `iam:PassRole` and `ec2:RunInstances` (with an instance profile) | unsafe                       | PG-IAM-003 | PG-IAM-004   |
| RS-41 | `iam:PassRole` and `codebuild:CreateProject`                     | unsafe                       | accepted   | PG-IAM-004   |
| RS-42 | `iam:PassRole` and `cloudformation:CreateStack`                  | unsafe                       | accepted   | PG-IAM-004   |
| RS-43 | `iam:PassRole` and `states:CreateStateMachine`                   | unsafe                       | accepted   | PG-IAM-004   |
| RS-44 | The Lambda path, the data role has only `s3:GetObjectVersion`    | unsafe                       | accepted   | PG-IAM-004   |
| RS-45 | The Lambda path, the data role has only `s3:PutBucketPolicy`     | unsafe                       | accepted   | PG-IAM-004   |
| RS-46 | RS-39 without `ecs:RunTask`                                      | safe                         | accepted   | accepted     |
| RS-47 | A passable role that trusts a service ProofGate does not know    | unknown (recorded as unsafe) | accepted   | PG-IAM-003   |

## Incident-shaped Patterns (RS-48 to RS-53) and the 91 pathfinding.cloud paths (Step 7, 2026-11-22)

Six Patterns shaped like public incidents and techniques were run with `pnpm real-stacks --incident` after their predictions were committed (`examples/real-stacks/data/incident-probe-predictions.json`); results are in `incident-probe-results.json`. The classes are those of `.kiro/steering/direction-research.md` (A: PassRole plus a launch action, B: change an existing resource, C: self-escalation, C': role chain, D: exposure through a resource policy). Every ground truth is unsafe.

| ID    | Pattern                                                                                  | Class | Predicted  | Observed   |
| ----- | ---------------------------------------------------------------------------------------- | ----- | ---------- | ---------- |
| RS-48 | Sysdig 2025 shape: `lambda:UpdateFunctionCode` on an existing function                   | B     | accepted   | accepted   |
| RS-49 | Unit 42 2024 shape: `iam:AttachRolePolicy` on `*`                                        | C     | accepted   | accepted   |
| RS-50 | Capital One-like: `iam:PassRole` on `*`, `ec2:*`, an instance role that reads the bucket | A     | PG-IAM-004 | PG-IAM-004 |
| RS-51 | Cryptomining-shaped: `iam:PassRole` on `*` and `ecs:RunTask`                             | A     | PG-IAM-004 | PG-IAM-004 |
| RS-52 | Role chain: a pipeline role assumes a data role that trusts the account                  | C'    | accepted   | PG-IAM-003 |
| RS-53 | A public function URL on a function whose role reads the bucket                          | D     | accepted   | accepted   |

- The two class-A Patterns are detected. The three misses are classes B, C, and D, which are not supported yet, as predicted.
- RS-52 was predicted to be accepted but is rejected (`PG-IAM-003`): CDK writes `AccountPrincipal` as `Fn::Join` with `Ref AWS::Partition`, which cannot be read in a trust policy. With a literal account ARN the template is accepted and the chain is missed.
- RS-48 has the shape of the Sysdig report of 2025-11-28. It is the first target of `proofgate-implicit-role-paths`.

Then the 91 AWS paths of Datadog [pathfinding.cloud](https://pathfinding.cloud/) (Apache-2.0) were each turned into a two-role model (an attacker role with the required permissions, and a target role that reads the protected bucket) and checked (`tests/pathfinding-benchmark.test.ts`, data in `tests/data/pathfinding-cloud/`). The predictions (`predictions.json`) were committed before the run.

| Category            | Paths | `PG-IAM-004` | `PG-IAM-003` | Accepted (missed) |
| ------------------- | ----- | ------------ | ------------ | ----------------- |
| `new-passrole`      | 47    | 44           | 1            | 2                 |
| `existing-passrole` | 22    | 0            | 0            | 22                |
| `principal-access`  | 14    | 0            | 0            | 14                |
| `self-escalation`   | 8     | 0            | 0            | 8                 |

- 44 paths are reported: 44 of the 47 `new-passrole` paths (`cloudformation-005` has no PassRole and is accepted). `existing-passrole` (22, paths without PassRole), `principal-access` (14), and `self-escalation` (8) are not supported yet, so all are accepted.
- Three results differ from the predictions. `cognitoidentity-001` is detected, better than predicted. `apprunner-001` is rejected with `PG-IAM-003` instead of reported, because the target role trusts `tasks.apprunner.amazonaws.com` while the launch table says `bullet.amazonaws.com`. `gamelift-001` is a **miss**: the fleet instance role trusts `ec2.amazonaws.com` but the table maps `gamelift:CreateFleet` to `gamelift.amazonaws.com`, so the trust does not match. Services that pass an EC2 instance role (EMR, Image Builder) can have the same kind of gap. A candidate fix is to count trust of `ec2.amazonaws.com` too when the launch service passes an instance profile. It only adds findings and belongs to a separate spec.
- Both (`apprunner-001`, `gamelift-001`) were fixed the same day (`launch-supplements.ts`). After the fix 46 of the 91 paths are reported and 45 are accepted (classes B and C, not supported yet).
- Two mistakes in the benchmark model (`cloudformation-004`, `batch-001`) were corrected and are written in `results.json`.
- The benchmark reproduces only the preconditions (the combination of permissions). It does not check that an attack really works.

## Paths without iam:PassRole (RS-54 to RS-62, spec proofgate-implicit-role-paths, 2026-11-22)

Nine Patterns were run with `pnpm real-stacks --implicit` after their predictions were committed (`implicit-probe-predictions.json`). On `main` before the implementation all nine were accepted (the five unsafe ones and the unknown-role one were missed). After the implementation all nine match the predictions.

| ID    | Pattern                                                                        | `main` (before) | Predicted  | Observed   |
| ----- | ------------------------------------------------------------------------------ | --------------- | ---------- | ---------- |
| RS-54 | `lambda:UpdateFunctionCode`, the function role reads the bucket                | accepted        | PG-IAM-004 | PG-IAM-004 |
| RS-55 | `lambda:UpdateFunctionConfiguration`, same                                     | accepted        | PG-IAM-004 | PG-IAM-004 |
| RS-56 | `codebuild:StartBuild`, the project role reads the bucket                      | accepted        | PG-IAM-004 | PG-IAM-004 |
| RS-57 | `codebuild:StartBuildBatch`, same                                              | accepted        | PG-IAM-004 | PG-IAM-004 |
| RS-58 | `states:UpdateStateMachine`, the state machine role reads the bucket           | accepted        | PG-IAM-004 | PG-IAM-004 |
| RS-59 | `StartBuild` scoped to the ARN of another project that cannot reach the bucket | accepted        | accepted   | accepted   |
| RS-60 | the function role reads another bucket only                                    | accepted        | accepted   | accepted   |
| RS-61 | the function role is a parameter (cannot be identified)                        | accepted        | PG-IAM-003 | PG-IAM-003 |
| RS-62 | a role that changes the function that runs as itself                           | accepted        | accepted   | accepted   |

- RS-48 (the Sysdig 2025 shape) was a miss before and is `PG-IAM-004` now.
- RS-59 checks the resolver narrowing (`GetAtt Arn` as an ARN instead of `*`). Read as `*` it would match project A and be a false alarm.
- The 91 pathfinding.cloud paths: 52 are reported now (46 before). The six new ones are `lambda-003`, `lambda-004`, `lambda-005`, `codebuild-002`, `codebuild-003`, `stepfunctions-002`. 39 are accepted (the other 16 paths without PassRole, 14 `principal-access`, 8 `self-escalation`, 1 `new-passrole`).

## Trial with the current code (2026-11-22)

The same app as the 1.1.1 trial (18 variants) was run with 1.1.2 from npm and with the current code of this repository (packed tarballs). One result differs:

- `apigw` (the REST API logging role gets the managed policy `AmazonAPIGatewayPushToCloudWatchLogs`): `PG-IAM-003` on 1.1.2, accepted now. `cloudWatchRole: false` is no longer needed.
- Four variants were added (paths without PassRole; the expected results were written before the run). On 1.1.2 all four are accepted; on the current code `implicit-code` (`lambda:UpdateFunctionCode` on `*`), `implicit-function-arn` (the Resource is `reader.functionArn`), and `implicit-codebuild` (a CodeBuild project that reads the bucket and `codebuild:StartBuild`) give `PG-IAM-004`, and `implicit-other-function` (the ARN of another function that cannot reach the bucket) is accepted. Of the 22 variants, `apigw` and three of these four differ between 1.1.2 and the current code.
- Of the original 18, the other 17 variants give the same result (`update-config-only` is `PG-IAM-004` since 1.1.2). The `ecs` task role reads the protected bucket but nobody can pass it, so it is accepted.
- The violation text now names the service and the launch action (for example `... can pass role ReaderServiceRole... to lambda.amazonaws.com and launch it (lambda:CreateFunction) ...`).

## What the Lean check shows

Lean checks four facts that TypeScript computes (`canPassRole`, `canLaunch`, `targetTrustsService`, `targetCanAccess`; up to 1.1.2 `canControlLambda` and `targetIsLambdaAssumable`). It does not verify the CloudFormation template or the IAM statements. The extractor, the value resolver, and the managed-policy table are trusted code (`docs/ASSUMPTIONS.md`).
