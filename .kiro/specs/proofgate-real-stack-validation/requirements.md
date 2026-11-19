# Requirements: proofgate-real-stack-validation

Status: APPROVED (revision 3). Pattern RS-14 was added at the user's decision. `design.md` and `tasks.md` are written. No code has been changed for this spec.

## Introduction

ProofGate's tests so far use hand-built models, generated fragments, and two small demo apps. None of them uses the templates that everyday CDK code produces. This spec adds a set of realistic CDK stacks under `examples/`, runs ProofGate on each of them, and records what happens, so that the results can be published honestly before the packages go to npm.

### Evidence that motivates the spec

A throwaway probe synthesized eight common CDK patterns and ran only the extractor on the templates. Nothing was added to the repository.

| Pattern | IAM resources | Extractor result |
| --- | --- | --- |
| Lambda with `bucket.grantRead` | Role, Policy | no model: managed policy, non-literal `Resource`, no statement left |
| `iam.Role` with a literal inline policy | Role, Policy | model, no finding |
| Role with `bucket.grantReadWrite` | Role, Policy | no model: non-literal `Resource` |
| Step Functions with `LambdaInvoke` | 2 Roles, Policy | no model: managed policy, trust `Condition`, non-literal `Resource` |
| ECS task role with `grantReadWrite` | Role, Policy | no model: non-literal `Resource` |
| CodeBuild project with `iam:PassRole` and `lambda:CreateFunction` | Role, Policy | no model: non-literal `Resource` (two findings) |
| Role with literal `iam:PassRole` and `lambda:CreateFunction` | Role, Policy | model, no finding (only one role, so no target) |
| EventBridge rule to Lambda | Role | no model: managed policy |

Six of the eight patterns are rejected as unsupported (`PG-IAM-003`). Only templates written with literal values pass the extractor. This is the documented design (fail closed), but it was never measured on realistic input, and it decides how useful the 1.0 release is. The probe also shows that a stack with a real escalation pattern can be reported only as `PG-IAM-003` when another statement in the same template is unsupported.

## Glossary

- **Pattern**: one realistic CDK stack, identified as `RS-01`, `RS-02`, and so on.
- **Ground truth**: whether a `PG-IAM-004` escalation path exists in a Pattern under the AWS rules recorded in `.kiro/specs/proofgate-verification-hardening/design.md` section 8, decided by review when the Pattern is written and recorded before ProofGate runs.
- **Result**: the outcome of `cdk synth` with ProofGate enabled: accepted (exit 0), `PG-IAM-003`, or `PG-IAM-004`.
- **Modeled scope**: what `docs/ASSUMPTIONS.md` and `docs/SUPPORTED_IAM.md` say ProofGate inspects. Cross-stack references, roles that are not in the template, SCPs, and conditions are outside it. So is a finding that the author of the stack silences with CDK's `acknowledge` (observed in the spike of Task 0.5), because that is a decision of the person that ProofGate checks, not a property of the template.
- **False negative**: ground truth unsafe, inside the modeled scope, Result accepted.
- **False positive**: ground truth safe, Result `PG-IAM-004`.
- **Rejected as unsupported**: Result `PG-IAM-003` caused by a construct the extractor does not model. It is a usability limit, not a defect.

## Requirements

### Requirement 1: A catalogue of realistic Patterns

**User story:** As a CDK user, I want to see what ProofGate does with the code I normally write, so that I can judge whether it fits my project.

#### Acceptance criteria

1. THE repository SHALL contain one private CDK app under `examples/` that can synthesize each Pattern on its own, selected by a name (for example a CDK context value).
2. THE catalogue SHALL contain the Patterns of the appendix, or a list that the user approves instead.
3. EACH Pattern SHALL use only constructs that synthesize without AWS credentials, without Docker, and without network access (for example inline Lambda code).
4. EACH Pattern SHALL have a short English description and a recorded ground truth, written before ProofGate is run on it.
5. THE app SHALL use no new dependency. `aws-cdk-lib` is already a dependency of the example apps.

### Requirement 2: Predictions before measurement

**User story:** As a reviewer, I want expectations to be written down before the results, so that the results can contradict them.

#### Acceptance criteria

1. BEFORE ProofGate is run, THE spec SHALL record, for each Pattern, the expected Result and the expected reason.
2. WHERE the observed Result differs from the prediction, THE report SHALL say so and give the cause.
3. THE expectations for Patterns that the probe already covered SHALL be marked as based on the probe, which ran the extractor only. THE final Result SHALL come from the real plugin with `cdk synth`.

### Requirement 3: A repeatable runner

**User story:** As a maintainer, I want one command that repeats the whole trial, so that the results can be checked again after any change.

#### Acceptance criteria

1. THE repository SHALL provide one command that synthesizes every Pattern twice, once without ProofGate and once with it, and compares the Result with a table of expected Results kept in the repository.
2. THE command SHALL fail when a Result differs from the table, and SHALL print which Pattern, what was expected, and what happened.
3. THE command SHALL finish within 60 seconds on a development machine.
4. THE command SHALL need no AWS credentials, no Docker, and no network, and SHALL work with Node.js 26.
5. THE command SHALL NOT be part of any published package and SHALL NOT change `pnpm test` unless the design justifies it.

### Requirement 4: Classification of every Result

**User story:** As a user, I want to know which outcomes are defects and which are known limits.

#### Acceptance criteria

1. EACH Result SHALL be classified as one of: correct detection, correct acceptance, rejected as unsupported, false negative, false positive, or outside the documented boundary.
2. THE report SHALL list, for each rejected Pattern, the unsupported reasons and the location that ProofGate reports, so that the usefulness of the messages can be judged.
3. THE number of false negatives and false positives SHALL be zero for the Patterns of the appendix. IF one is found, THEN it is a defect and Requirement 7 applies.
4. A Result where a path exists only through something outside the modeled scope (a role that is not in the template, a reference to another stack, a finding that the stack's author acknowledged in CDK) SHALL be classified as outside the documented boundary and SHALL be described in the report. It SHALL NOT be hidden.

### Requirement 5: Fail Closed under realistic input

**User story:** As a security reviewer, I want a real escalation path to be reported or rejected, never accepted, even when the template also contains constructs ProofGate does not understand.

#### Acceptance criteria

1. FOR every Pattern whose ground truth is unsafe and that stays inside the modeled scope, THE Result SHALL be `PG-IAM-004` or `PG-IAM-003`, and never accepted.
2. THE report SHALL state, for a Pattern that mixes a literal escalation path with an unsupported construct, which Result the user sees, and whether the path is visible in the Result.

### Requirement 6: Documented results

**User story:** As a judge or a user, I want an accurate summary of what was tried and found.

#### Acceptance criteria

1. THE results SHALL be written to a document in Japanese (`docs/`) and an English document next to it. Neither SHALL replace existing documents.
2. THE document SHALL contain the table of Patterns with ground truth, prediction, Result, classification, and the reasons for rejection.
3. THE document SHALL say that the Patterns are a sample and not a coverage claim, and SHALL NOT state or imply that ProofGate works on "typical" CDK projects beyond what the table shows.
4. WHERE the results show that many realistic stacks are rejected as unsupported, THE README SHALL say so in plain words and SHALL name the common causes (managed policies, non-literal `Resource`, trust conditions).
5. THE statement of what the Lean check proves SHALL stay as defined in Requirement 14 of the earlier spec: it checks four facts that TypeScript computes and does not verify the template or the IAM statements.

### Requirement 7: Handling of what the trial finds

**User story:** As the owner, I want the trial to improve the release without widening its scope silently.

#### Acceptance criteria

1. IF a false negative or false positive is found, THEN it SHALL be fixed in this spec as its own task, with a regression test, after the user has been told.
2. A fix SHALL only add findings or rejections. Turning an unsafe verdict into safe, or accepting what `PG-IAM-003` rejects, SHALL need the user's approval.
3. Support for new constructs (managed policies, intrinsic functions, `grant*` output) is out of scope. IF the trial shows that it is needed, THEN it SHALL be recorded as a follow-up spec candidate with the evidence.
4. Changes to the text of an unsupported finding (for example naming the construct, the logical ID, or a hint) MAY be made in this spec if they do not change which input is accepted or rejected.

### Requirement 8: Existing behavior and release

**User story:** As a maintainer, I want the trial not to disturb what is already released.

#### Acceptance criteria

1. `pnpm quality`, `pnpm typecheck`, `pnpm test`, and `pnpm pack:check` SHALL pass, and `verify:demo` SHALL exit 1 with `PG-IAM-004`.
2. NO dependency, lockfile entry for an external package, Lean toolchain, Node.js, or TypeScript pin SHALL change.
3. THE new example app SHALL NOT be published, and the tarballs SHALL stay as `pack:check` allows.
4. THE package version for the trial's changes SHALL be decided by the user. Nothing SHALL be published to npm by this spec. Publishing to npm SHALL wait for the results of this spec and for the decision gate of Requirement 10.

### Requirement 9: Auditable Kiro work record

#### Acceptance criteria

1. EACH Kiro session working on this spec SHALL add a dated row to the usage log in `.kiro/steering/kiroween.md` with the Kiro app, the feature, and the concrete result, including failures and wrong predictions.
2. THE record SHALL NOT include work that was not done in Kiro, and SHALL NOT contain credentials, tokens, or credit codes.
3. THE spec documents under `.kiro` SHALL be in English. Code comments SHALL follow the existing Japanese comment policy.

### Requirement 10: Decision gate when the results are poor

**User story:** As the owner, I want to decide what to do next when the trial shows that ProofGate fits real projects badly, instead of having the spec carry on by itself.

#### Acceptance criteria

1. WHEN all Patterns have been measured, THE work SHALL stop and report to the user before any change to the README positioning, the changelog, the version, the tag, or npm.
2. THE gate SHALL be marked as "poor results" if any of these holds:
   - a false negative or a false positive is found (Requirement 4.3);
   - a Pattern that uses only literal values (RS-01 to RS-04) is decided wrongly or is rejected as unsupported;
   - 4 or more of the 5 Patterns that use ordinary CDK helpers (RS-05 to RS-09) are rejected as unsupported.
3. THE report SHALL give, for a poor result, the evidence and at least these options with their costs: (a) publish the packages as they are with an honest statement of the supported subset and a version that matches that statement, (b) start a follow-up spec that widens support (for example managed policies or the output of `grant*`), (c) hold the publication until that follow-up is done, and (d) a different positioning of the project.
4. THE spec SHALL NOT widen the supported syntax, change the version, or publish as a reaction to a poor result without the user's decision.
5. The predictions of the appendix already expect 5 of 5 of RS-05 to RS-09 to be rejected. THE gate is therefore expected to trigger, and the report SHALL say so openly instead of treating it as a surprise.

## Appendix: proposed Patterns (approved)

Ground truth: S = safe (no path), U = unsafe (a path exists). Predictions marked (probe) come from the extractor-only probe; the others are to be measured.

| ID | Pattern | Ground truth | Predicted Result |
| --- | --- | --- | --- |
| RS-01 | Two `iam.Role`s with literal policies: the developer can pass the data role and create Lambda functions, but the data role has no access to the protected bucket | S | accepted |
| RS-02 | Developer role and data role with literal ARNs through `addToPolicy`: `iam:PassRole`, `lambda:CreateFunction`, and `s3:GetObject` on `bucket/*` | U | `PG-IAM-004` |
| RS-03 | As RS-02, but the data role has only a prefix grant (`bucket/reports/*`), the PassRole Resource uses a `?` in the role name, and Lambda control is `UpdateFunctionConfiguration` plus `UpdateFunctionCode` in two statements | U | `PG-IAM-004` |
| RS-04 | As RS-02, but the permissions are passed as the Role's `inlinePolicies` (the template has the `Policies` property on `AWS::IAM::Role` instead of separate `AWS::IAM::Policy` resources) | U | `PG-IAM-004` |
| RS-05 | Lambda function with `bucket.grantRead` | S | `PG-IAM-003`: managed policy, non-literal Resource (probe) |
| RS-06 | `iam.Role` with `bucket.grantReadWrite` | S | `PG-IAM-003`: non-literal Resource (probe) |
| RS-07 | Step Functions state machine with `LambdaInvoke` | S | `PG-IAM-003`: managed policy, trust Condition, non-literal Resource (probe) |
| RS-08 | ECS Fargate task with `grantReadWrite` on the task role | S | `PG-IAM-003`: non-literal Resource (probe) |
| RS-09 | EventBridge rule targeting a Lambda function | S | `PG-IAM-003`: managed policy (probe) |
| RS-10 | CodeBuild project whose role has `iam:PassRole *` and `lambda:CreateFunction *`, plus a literal data role (Lambda trust, `bucket/*` access) in the same stack | U | `PG-IAM-003`: non-literal Resource in the CodeBuild policy (probe for the CodeBuild part); must not be accepted |
| RS-11 | The literal pair of RS-02 plus an unrelated Lambda with `bucket.grantRead` in the same stack | U | `PG-IAM-003` only; the path is not visible in the Result |
| RS-12 | A role whose policy uses a policy variable (`bucket/${aws:username}/*`) | S | `PG-IAM-003` with the policy-variable message |
| RS-13 | The developer role in one stack, passing a role by literal ARN that is defined in another stack or imported with `Role.fromRoleArn` | U (outside the modeled scope) | accepted; classified as outside the documented boundary |
| RS-14 | As RS-02, and the stack's author acknowledges the finding with `Validations.of(...).acknowledge({ id: 'ProofGate::PG-IAM-004', reason })` | U (outside the modeled scope: the finding is silenced by the author) | accepted (spike); classified as outside the documented boundary |

## Out of scope

- Supporting managed policies, CloudFormation intrinsic functions, `grant*` output, or conditions.
- Deploying to AWS, or any step that needs credentials, Docker, or network access.
- Publishing to npm, tagging, or releasing.
- Changing the rule IDs, the validator API, or the Lean model.

## Decisions recorded

1. **Patterns:** the list of the appendix is approved as it is.
2. **Structure:** one app that selects a Pattern by name.
3. **Time:** one working session for the trial; the runner at most 60 seconds.
4. **npm:** publishing waits for the results (Requirement 8.4 and Requirement 10).
5. **Messages:** improving the text of unsupported findings is in scope as long as the accepted and rejected input does not change (Requirement 7.4). The user added that if the results are very poor this needs a new look, which is Requirement 10.

## Revision history

- Revision 1: first draft with the evidence from the probe, 9 requirements, and 13 Patterns.
- Revision 2: recorded the user's decisions and added Requirement 10 (decision gate).
- Revision 3: added Pattern RS-14 (an acknowledged finding) at the user's decision after the spike of Task 0.5, and the acknowledgement to the definition of the modeled scope. The catalogue now has 14 Patterns. The decision gate (Requirement 10.2) is unchanged, and RS-14 does not count as a false negative because it is classified as outside the documented boundary.
- Revision 3b (during Task 2): corrected the definition of RS-04. The original text assumed that a separate `iam.Policy` object gives another template shape; synthesizing showed that `addToPolicy` already creates an `AWS::IAM::Policy` with `Roles`, so the original RS-04 would have repeated RS-02. RS-04 now uses `inlinePolicies`. Ground truth and predicted Result are unchanged.
