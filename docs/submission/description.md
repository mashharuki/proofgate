# ProofGate: a pre-deployment proof gate for AWS CDK

## The problem

A CDK change can pass synthesis and still let someone read your customer data. Two IAM statements that each look reasonable, one role that may pass a role to Lambda and another that can read a bucket, together let the first role run code with the second role's access. Linters check statements one at a time, so they do not say "this principal can now reach this bucket through that role".

## Who it is for

Platform and security engineers who own CDK infrastructure, and application teams who want to say, in code next to their stack, which data must stay out of reach.

## What it does

ProofGate is a CDK validation plugin. During `cdk synth` it:

1. reads the synthesized CloudFormation and builds a small typed model of roles, policies, trust, and resources;
2. lists every candidate path to a protected S3 bucket;
3. asks Lean 4 to prove that no candidate is complete;
4. if the proof fails, stops the synthesis and names the principal, the role, the service, and the bucket, with a suggested fix.

Three findings:

- `PG-IAM-004`: a path through `iam:PassRole` and one of 879 launch actions (Lambda, ECS, EC2, CodeBuild, Step Functions, Glue, and more, generated from the AWS Service Reference), or through a change of an existing Lambda function, CodeBuild project, or state machine.
- `PG-IAM-005`: a role that can change IAM itself.
- `PG-IAM-003`: anything ProofGate cannot read. It is rejected, never assumed safe.

## The demo: one stack, four steps

On `examples/vulnerable-app`, without an AWS account:

1. Plain `cdk synth`: exit 0.
2. `cdk synth` with ProofGate: exit 1, `DeveloperRole ... can pass role ProtectedDataRole ... to lambda.amazonaws.com and launch it (lambda:CreateFunction); ProtectedDataRole ... can access protected bucket arn:aws:s3:::proofgate-protected-data`.
3. Remove one statement (`iam:PassRole`, 8 lines).
4. The same stack with ProofGate: exit 0. The wide Lambda permissions are still there; ProofGate rejects the path, not wide permissions by themselves.

`pnpm demo:fix` runs all four steps and checks them, and every CI run of the repository shows them.

## Why Frankenstein

ProofGate stitches together parts that are not usually combined:

- AWS CDK's validation plugin API;
- the Lean 4 theorem prover, with `native_decide` on a generated module;
- data generated from the AWS Service Reference;
- the 91 AWS privilege-escalation paths of Datadog's pathfinding.cloud (Apache-2.0), used as a benchmark: 60 are reported today;
- an independent test oracle, checked against decisions of the real IAM engine.

## How it compares

On the same stack, cdk-nag 3.1.0 (`AwsSolutionsChecks`) reports three wildcard findings before the fix and two after, statement by statement. ProofGate reports one path before the fix and nothing after. Both flag the `iam:PassRole` statement, for different reasons. The tools answer different questions and can run together. Details, raw outputs, and limits are in [`docs/submission/comparison.md`](comparison.md).

## Limits

- Not modeled: SCPs, permissions boundaries, resource policies, explicit deny, conditions, role chains, IAM users and groups, cross-stack references, and changes after deployment.
- Lean proves a property of the finite model that TypeScript builds. It does not prove IAM or CloudFormation semantics.
- The extractor and the evaluator are trusted. They are tested against an independent oracle.

## Try it

- Guide: [`docs/GETTING_STARTED.en.md`](../GETTING_STARTED.en.md), with a GitHub Codespace, a local run, or the CI log.
- npm: `@proofgate-cdk/cdk-plugin` 1.2.1.
- License: Apache-2.0.

## Built with Kiro

Developed in Kiro IDE from 2026-11-18, through seven specs, steering, a quality-gate hook, and MCP servers. See [`docs/submission/kiro-usage.md`](kiro-usage.md).
