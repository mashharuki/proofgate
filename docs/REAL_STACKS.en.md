# Results on realistic stacks

This document records how ProofGate behaved on stacks that are close to real CDK code (Patterns). The Patterns were chosen from common CDK usage before the supported syntax was decided. **The Patterns are a sample, not a coverage claim.** The table does not say how ProofGate behaves on other CDK projects.

Subject: `examples/real-stacks` (aws-cdk-lib 2.277.0). Protected bucket: `arn:aws:s3:::proofgate-protected-data`. No AWS credentials or network are used.

## How to run

```bash
pnpm build
pnpm real-stacks            # compares the 14 Patterns with the expected table (0 match, 1 difference, 2 harness error)
pnpm real-stacks --cli all   # also runs the real cdk synth CLI (about one minute)
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

## What the Lean check shows

Lean checks four facts that TypeScript computes (`canPassRole`, `canControlLambda`, `targetIsLambdaAssumable`, `targetCanAccess`). It does not verify the CloudFormation template or the IAM statements. The extractor, the value resolver, and the managed-policy table are trusted code (`docs/ASSUMPTIONS.md`).
