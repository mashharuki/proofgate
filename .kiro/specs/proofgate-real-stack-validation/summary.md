# Summary: proofgate-real-stack-validation

English summary for the Kiroween submission. The numbers come from `examples/real-stacks/data/` and are not rounded.

## What was tried

ProofGate 1.0.1 was run on 14 CDK stacks (Patterns RS-01 to RS-14) written the way ordinary CDK code is written: `grantRead`, Lambda functions, Step Functions, ECS, EventBridge, CodeBuild, and a few hand-written escalation paths. The ground truth and a predicted Result for each Pattern were committed before any Pattern was run with ProofGate. A runner (`pnpm real-stacks`) synthesizes each Pattern with and without the real plugin and compares the Result with a reviewed table.

## What was found

- On 1.0.1, 8 of 14 Patterns were rejected as unsupported (`PG-IAM-003`). The causes were non-literal `Resource` values (6 Patterns), the vacuous-proof rejection that follows from them (6), managed policies (4), a trust-policy `Condition` (1), and a policy variable (1). No prediction was wrong. There were no false negatives and no false positives inside the modeled scope.
- Two Patterns are outside the model and are accepted: a path that crosses two stacks (RS-13), and a finding silenced by the author with CDK `acknowledge` (RS-14).
- By the definition in the requirements, this result was "poor". The user chose to widen what ProofGate reads in a follow-up spec (`proofgate-cdk-construct-support`) instead of documenting the limit only.
- While designing that follow-up, a defect of 1.0.1 was found by reasoning, not by a test: a role without `RoleName` was never a `iam:PassRole` target for `role/*`. The independent oracle and the generator shared this blind spot. It was fixed first (merged as PR #4).
- After the follow-up, the 14 Patterns give their targets: RS-05 to RS-09 are accepted, RS-10 and RS-11 report `PG-IAM-004`, and only RS-12 (policy variable) stays `PG-IAM-003`. A differential check against 1.0.1 over 3034 inputs lost no finding.
- Eight hold-out Patterns (RS-15 to RS-22), written with predictions before the implementation and run once after it, gave 8 of 8 as predicted. RS-15 stays `PG-IAM-003` because of a managed policy that is not in the table. RS-20 and RS-21 are not fully independent of the implementation, because the unit tests that exposed a resolver defect copy their layouts.
- `PG-IAM-003` messages now carry a short hint for four reasons. The verdicts did not change.

## What is not shown

- The Patterns are a sample. They do not show how ProofGate behaves on other CDK projects.
- Lean checks four facts that TypeScript computes. It does not verify the template, the IAM statements, the extractor, or the value resolver.
- Nothing was deployed to AWS. The tests use no credentials and no network.
- Not modeled: cross-stack paths, acknowledgements, SCPs, permissions boundaries, resource policies, conditions on permission statements, and managed policies other than `AWSLambdaBasicExecutionRole`.
