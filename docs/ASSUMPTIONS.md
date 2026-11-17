# Assumptions and trust boundaries

## What is checked

For the extracted finite model, ProofGate checks that no principal simultaneously has a supported `iam:PassRole` edge to a role, a supported Lambda-control permission, a target role that trusts the Lambda service, and a target role with supported access to a configured S3 bucket.

## Trusted components

- the CloudFormation extractor and action/resource matcher;
- the TypeScript-to-Lean generator;
- the pinned Lean compiler, runtime used by `native_decide`, and Lean kernel;
- the synthesized CloudFormation template as a representation of the proposed deployment;
- AWS IAM and Lambda behaving according to their documented semantics.

## Not covered yet

- SCPs, permissions boundaries, session policies, resource policies, and explicit-deny evaluation;
- transitive role assumption and cross-stack or cross-account references;
- service-specific Lambda constraints beyond service trust, and `iam:PassedToService` conditions;
- managed policies, policy variables, most CloudFormation intrinsic functions, and IAM conditions;
- drift or changes made outside the checked CDK synthesis.

The extractor rejects unsupported constructs rather than treating them as safe. AWS deployment is intentionally outside this repository's demo and tests.
