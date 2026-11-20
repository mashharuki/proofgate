# Requirements: proofgate-cdk-construct-support

Status: APPROVED by the user (requirements and target results; open questions 2-5 not answered, assumptions are in design.md section 11). `design.md` is written and awaits approval. `tasks.md` is not written yet. No code has been changed for this spec.

## Introduction

The spec `proofgate-real-stack-validation` measured ProofGate 1.0.1 on 14 realistic CDK stacks. ProofGate read only stacks written with literal values. Eight of the 14 were rejected as unsupported (`PG-IAM-003`), including all five ordinary CDK helper stacks (a Lambda function with `grantRead`, `grantReadWrite`, Step Functions, ECS, EventBridge). Two of the three Patterns that contain an escalation path next to such constructs were not reported as `PG-IAM-004` either, so the path stayed invisible. The user chose to widen what ProofGate can read.

This spec widens the reading of the CloudFormation that everyday CDK code produces, **without giving up the fail-closed rule**: whatever ProofGate does not understand is still rejected.

### Evidence from the measurement and a read-only survey

All figures are from the real templates of Patterns RS-05 to RS-11, with aws-cdk-lib 2.277.0. They are a small sample.

| What blocks the stacks | Where it appears | Details of the sample |
| --- | --- | --- |
| A managed policy on a role | RS-05, RS-07, RS-09, RS-11 | **One** distinct value in the sample: `arn:<partition>:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`, written as an `Fn::Join` with `Ref: AWS::Partition` |
| A `Resource` built from CloudFormation functions | RS-05, RS-06, RS-07, RS-08, RS-10, RS-11 | `Fn::GetAtt <bucket>.Arn`; `Fn::Join` of that value and a suffix such as `/*`; `Fn::Join` with `Ref: AWS::Partition`, `AWS::Region`, `AWS::AccountId`, and a `Ref` to a resource |
| A `Condition` in a trust policy | RS-07 | `ArnLike` on `aws:SourceArn`, built with `Fn::Join` |
| The finding that refuses a vacuous proof | 6 Patterns | A consequence: when no other statement can be read, ProofGate adds this finding |

The Patterns that decided the matter, with the Result of 1.0.1:

| Pattern | Ground truth | Result of 1.0.1 |
| --- | --- | --- |
| RS-05 to RS-09 | safe | `PG-IAM-003` (5 of 5) |
| RS-10 (CodeBuild with `iam:PassRole *` and `lambda:CreateFunction`, plus a literal data role) | unsafe | `PG-IAM-003`, the path is not visible |
| RS-11 (the literal escalation path next to an unrelated `grantRead` Lambda) | unsafe | `PG-IAM-003`, the path is not visible |

A caution that shapes the whole spec: **these 14 Patterns will also be used to design the support**, so they cannot show that the result generalizes. Requirement 6 asks for a hold-out set.

## Glossary

- **Resolved value**: a CloudFormation value (`Ref`, `Fn::GetAtt`, `Fn::Join`, a pseudo-parameter) that the extractor turns into a string pattern.
- **Over-approximation**: reading an unknown part of an `Allow` as "anything" (a wildcard). This can only add findings.
- **Modeled scope**, **Pattern**, **Result**, **Ground truth**, **false negative**, **false positive**: as in the spec `proofgate-real-stack-validation`.
- **Acceptance set**: the 14 Patterns RS-01 to RS-14 and their target Results (Requirement 1).
- **Hold-out set**: Patterns that are written, with their ground truth and predicted Result committed, before the implementation starts, and that are not used to design the support.

## Requirements

### Requirement 1: Target Results for the acceptance set

**User story:** As a CDK user, I want the stacks that I write with ordinary helpers to be read, and the escalation paths in them to be reported.

#### Acceptance criteria

1. WHEN the work is complete, THE Results of the Patterns RS-01 to RS-14 SHALL be as in the table below, or the difference SHALL be listed with a reason and approved by the user.

   | Pattern | Target Result |
   | --- | --- |
   | RS-01 | accepted (unchanged) |
   | RS-02, RS-03, RS-04 | `PG-IAM-004` (unchanged) |
   | RS-05, RS-06, RS-07, RS-08, RS-09 | accepted (correct acceptance) |
   | RS-10, RS-11 | `PG-IAM-004` (the path becomes visible) |
   | RS-12 | `PG-IAM-003` with the policy-variable reason (unchanged: policy variables stay unsupported) |
   | RS-13, RS-14 | accepted, outside the documented boundary (unchanged) |

2. THE number of false negatives and false positives in the acceptance set SHALL be zero.
3. THE target of "5 of 5 accepted" is a goal, not a promise. IF a Pattern cannot be read without a loss of safety (Requirement 2), THEN it SHALL stay rejected, and the report SHALL say why.

### Requirement 2: Soundness rule for accepting more

**User story:** As a security reviewer, I want every newly readable construct to have an argument that reading it cannot hide an escalation path.

#### Acceptance criteria

1. EACH construct that ProofGate starts to read SHALL have, in the design, a written rule and a **soundness argument**: why the resulting model cannot make an unsafe stack look safe under AWS semantics. The argument SHALL name the direction of the approximation.
2. WHERE a value is unknown or can vary at deployment, THE extractor SHALL read it so that the `Allow` permission is **at least as large** as the real one (over-approximation, for example a wildcard in a resource) and SHALL NOT read it as smaller. WHERE over-approximation is not sound (for example a `Deny`, or a value that narrows a permission only if it is exact), THE extractor SHALL reject the construct.
3. A `Condition` SHALL be ignored only where ignoring it can only enlarge an `Allow` or a trust relation. A construct for which this is not shown SHALL stay unsupported.
4. THE design SHALL list, for each rule, the cases in which it produces **more findings** than today (a false alarm risk) and an estimate of how often, from the Patterns.
5. IF a rule needs a fact about AWS (for example the content of a managed policy), THEN THE design SHALL read the official AWS documentation, record the source and the conclusion, and list the fact as a trust assumption in `docs/ASSUMPTIONS.md`.

### Requirement 3: The fail-closed floor stays

**User story:** As a user, I want anything that ProofGate does not understand to be rejected, as before.

#### Acceptance criteria

1. EVERY construct that is not covered by a rule of the design SHALL still produce `PG-IAM-003`, with the location, as before.
2. THE following SHALL stay unsupported unless the design gives a rule and a soundness argument for them: `Fn::ImportValue`, `Fn::Sub` with a name that is not resolved, `Fn::If`, `Fn::FindInMap`, template `Parameters`, `Fn::Select`, `Fn::Split`, a `Ref` or `GetAtt` to a resource that is not in the template, and any managed policy other than those listed in the design.
3. A managed policy SHALL be read only if its full name is in a table in the repository, together with its permissions, and only after the design has verified the permissions against AWS documentation. Any other managed policy ARN SHALL produce `PG-IAM-003`.
4. THE empty-domain rules SHALL stay: no role, or no supported statement, is still rejected.
5. THE rule IDs, the validator API, and the configuration SHALL NOT change.

### Requirement 4: Agreement of TypeScript and Lean is kept

**User story:** As a maintainer, I want the statement about the Lean check to stay true.

#### Acceptance criteria

1. THE Lean project, the generated Lean, and the `StackModel` type SHALL stay unchanged unless the design shows that a change is needed and the user approves it.
2. THE resolution of intrinsic values SHALL happen in the extractor, before the model is built. The model that reaches `evaluate` and `generateLean` SHALL contain only strings and patterns, as today.
3. THE statement that Lean checks four facts that TypeScript computes, and does not verify the template, SHALL stay as it is in the documents. A resolved value is part of what TypeScript computes and is NOT verified by Lean.

### Requirement 5: Tests for the new reading

**User story:** As a maintainer, I want the new rules to be tested at the depth that the existing rules have.

#### Acceptance criteria

1. EACH new rule SHALL have example tests, and the tests SHALL be written and shown to fail before the rule is implemented (red first), as in the earlier specs.
2. THE Extractor-level generated tests (`tests/pbt/`) SHALL be extended so that the generator produces fragments with the new forms, with an expected model computed independently of the extractor, and fragments with one unsupported variation that must still be rejected at the right location.
3. THE Model-level tests and the independent oracle SHALL stay valid. IF the oracle needs a change to express a resolved pattern, THEN the change SHALL be explained in the design.
4. THE harness self-check SHALL gain mutants for the new reading (for example an extractor that resolves a `GetAtt` to the empty string, or that drops a resolved resource). Each SHALL be detected.
5. A differential check SHALL compare ProofGate 1.0.1 and the new version on a corpus: the 14 Patterns, the regression cases, and the generated fragments. **No finding that 1.0.1 reports SHALL disappear.** Every input that moves from `PG-IAM-003` to accepted SHALL be listed with the rule that made it readable.

### Requirement 6: A hold-out set against overfitting

**User story:** As a reviewer, I want evidence that the support works on stacks that it was not designed for.

#### Acceptance criteria

1. BEFORE the design is final, AT LEAST SIX new Patterns (RS-15 and following) SHALL be written from common CDK constructs that are not in RS-05 to RS-14, for example API Gateway with Lambda, SQS or SNS with `grant*`, DynamoDB with `grantReadWriteData`, a Lambda function with an S3 event source, a KMS key with `grant`, and a role created with `fromRoleArn` and used in a `PassRole` statement. The user approves the list.
2. FOR the hold-out Patterns, the ground truth and the predicted Result SHALL be committed **before** any implementation starts, and SHALL NOT be changed afterwards, as for the first 14 Patterns.
3. THE hold-out Patterns SHALL NOT be used to decide which rules are written. They SHALL be run once the implementation is finished, and the Results SHALL be reported in full, including every Pattern that is still rejected.
4. THE report SHALL give the share of the hold-out Patterns that are accepted, detected, or still rejected, and SHALL say that six or so Patterns are a sample and not an estimate for typical projects.

### Requirement 7: Time and scope

**User story:** As the owner, I want a hard limit, because the submission deadline is fixed.

#### Acceptance criteria

1. THE design SHALL give an estimate of the work for each rule and SHALL propose which rules to implement first, ordered by the number of Patterns that each rule makes readable.
2. AT the end of the design, THE work SHALL stop for the user's decision to go on or not, with the estimate.
3. THE user SHALL confirm a **last day for code changes** before the Kiroween deadline (2026-12-04, 14:00 Pacific). After that day, only documents are changed. The proposal is 2026-11-29.
4. IF the last day is reached without a result that the user accepts, THEN the code of this spec SHALL NOT be merged, and the user SHALL choose between the options (a) and (d) of the earlier spec. The measurement and the documents remain.
5. THE rules SHALL be implemented one at a time, each with its tests and its differential result, and each can be dropped without the others.

### Requirement 8: Documents and positioning

**User story:** As a user, I want the documents to say exactly what is read.

#### Acceptance criteria

1. `docs/SUPPORTED_IAM.md` and `docs/ASSUMPTIONS.md` (Japanese) SHALL get additions for each new rule: what is read, how an unknown part is read, and the trust assumptions (for example the table of managed policies and the date it was checked). Existing text SHALL NOT be deleted.
2. THE README SHALL not claim more than the tables of the earlier and this spec show. The finding that the author of a stack can silence ProofGate with CDK's acknowledge (Pattern RS-14) SHALL be stated in the same documents.
3. THE result document of the earlier spec (Task 13) SHALL report the 1.0.1 baseline and the state after this spec side by side.

### Requirement 9: Existing behavior, package, and release

**User story:** As a maintainer, I want the change to be controlled.

#### Acceptance criteria

1. `pnpm quality`, `pnpm typecheck`, `pnpm test`, and `pnpm pack:check` SHALL pass; `verify:demo` SHALL exit 1 with `PG-IAM-004`.
2. NO dependency, Lean toolchain, Node.js, or TypeScript pin SHALL change.
3. EXISTING tests and assertions SHALL NOT be deleted, skipped, or weakened. The `reason` strings that existing tests assert SHALL stay.
4. THE change accepts input that 1.0.1 rejects, so it changes behavior in the permissive direction. THE version SHALL be chosen by the user, and nothing SHALL be published, tagged, or released by this spec.
5. THE changelog SHALL describe the permissive change plainly, with the upgrade notes.

### Requirement 10: Auditable Kiro work record

#### Acceptance criteria

1. EACH Kiro session working on this spec SHALL add a dated row to the usage log in `.kiro/steering/kiroween.md`, including wrong predictions, failed attempts, and what the hold-out set showed.
2. THE record SHALL NOT claim work that was not done in Kiro, and SHALL NOT contain credentials, tokens, or credit codes.
3. THE spec documents under `.kiro` SHALL be in English. Code comments SHALL follow the Japanese comment policy.

## Out of scope

- Fixing the acknowledge behavior of CDK (Pattern RS-14). It is documented, not changed.
- Reading policy variables, `Deny` statements, SCPs, permissions boundaries, resource policies, or cross-stack references.
- A full IAM evaluator.
- Deploying to AWS, publishing, tagging, or releasing.
- Changes to the Lean model, the rule IDs, or the validator API.

## Open questions for approval

1. Is the list of target Results (Requirement 1.1) the right goal? In particular, is "RS-05 to RS-09 accepted" what you want, given that accepting a stack means that ProofGate vouches for it?
2. The over-approximation principle (Requirement 2.2): is it acceptable that a stack may get new `PG-IAM-004` findings that 1.0.1 did not report, because an unknown part is read as a wildcard?
3. The last day for code changes: is 2026-11-29 acceptable?
4. The hold-out list (Requirement 6.1): do you want to name the constructs, or should I propose them in the design?
5. Should the `realstacks/*` branches be pushed and merged first, as a pull request that contains no production change (the example package, the runner, the tests, the documents), so that this spec builds on `main` and the measurement is public?
