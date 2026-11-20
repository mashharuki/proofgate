# Product

ProofGate is a pre-deployment gate for AWS CDK. It reads the CloudFormation that `cdk synth` produces, extracts a small IAM model, and asks Lean 4 to prove an application-specific safety property before the stack is accepted.

## Problem

Individually reasonable IAM statements can combine into a privilege-escalation path. Linters check statements one at a time and do not express rules such as "no principal may reach this bucket through another role".

The first rule (`PG-IAM-004`) detects this path to a protected S3 bucket:

1. A principal holds `iam:PassRole` for a target role.
2. The same principal can create a Lambda function, or update the configuration of an existing one (`lambda:UpdateFunctionConfiguration` can change `Role` and `Layers`; up to 1.1.1 both a configuration and a code update were required).
3. The target role trusts the Lambda service.
4. The target role can access a protected S3 bucket.

## Users

- Platform and security engineers who own CDK-based AWS infrastructure and need deploy-time guardrails.
- Application teams who want to declare which resources are protected, in code, next to their stack.

## Outcomes

- Plain `cdk synth` still succeeds for both example apps.
- With ProofGate enabled, `safe-app` passes and `vulnerable-app` is rejected with `PG-IAM-004`.
- Anything ProofGate cannot model is rejected with `PG-IAM-003`, never assumed safe.

## Non-goals

- ProofGate is not a full IAM policy evaluator (see `docs/ASSUMPTIONS.md`).
- ProofGate does not depend on Kiro at runtime. Kiro is a development tool only.
