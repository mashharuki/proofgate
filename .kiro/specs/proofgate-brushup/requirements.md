# Requirements: proofgate-brushup

Status: APPROVED by the user on 2026-11-21, with the answers to the open questions recorded at the end. `design.md` and `tasks.md` are not written yet. No production code has been changed for this spec.

## Introduction

ProofGate 1.1.2 is on npm. A trial in a CDK app outside the repository (`docs/REAL_STACKS.md`, section "Trial with 1.1.1 from npm") and a read-only probe of 16 common constructs (2026-11-21, exploratory, no predictions written first) showed two kinds of weakness:

- **Missed paths** (unsafe stacks that ProofGate accepts). These are the most serious, because ProofGate vouches for the stack.
- **Needless rejections** (safe stacks that ProofGate rejects with `PG-IAM-003`). These stop users from enabling ProofGate for a whole app.

The user chose the scope on 2026-11-21: items 1, 4, 5, 6 of the proposal, accepting templates without IAM roles (item 3), and escalation through services other than Lambda, in a generic way (item 2). Item 7 (rewording the reason texts) is not in scope.

### Evidence

| Item | What was observed | Kind |
| --- | --- | --- |
| S3 actions | The evaluator counts only `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject` (and patterns that match them, such as `s3:*` or `s3:Get*`). A role with only `s3:GetObjectVersion`, `s3:DeleteObjectVersion`, `s3:PutObjectAcl`, `s3:PutObjectVersionAcl`, `s3:ReplicateObject`, or `s3:PutBucketPolicy` on the protected bucket is reported as having no access (probe with the 1.1.2 evaluator). The independent oracle uses the same list, so the generated tests share the blind spot. | missed path |
| Other services | A Fargate task role reads the protected bucket and nothing is reported, because `PG-IAM-004` covers Lambda only. Other services that run code with a passed role (for example ECS, EC2, CodeBuild, Glue, CloudFormation) are not modeled. | missed path (documented as out of scope until now) |
| Templates without roles | `cognito.UserPool` and `cloudfront.Distribution` with an S3 origin produce no IAM role, and are rejected with "No IAM roles were found; refusing a vacuous proof". In an app with several stacks, enabling ProofGate for the whole app fails on such a stack. | needless rejection |
| `Fn::Sub` | `s3deploy.BucketDeployment` writes the bootstrap bucket as `Fn::Sub "cdk-hnb659fds-assets-${AWS::AccountId}-${AWS::Region}"`; `autoDeleteObjects: true` writes the managed policy ARN as `Fn::Sub "arn:${AWS::Partition}:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"`. Both are rejected. | needless rejection |
| Managed policies | A Lambda function in a VPC gets `AWSLambdaVPCAccessExecutionRole`; a REST API gets `AmazonAPIGatewayPushToCloudWatchLogs`. Both are rejected. | needless rejection |
| README | It does not say that every stack of the app is checked, that a protected bucket needs a fixed name, how to enable ProofGate only with an environment variable, or what to do about common `PG-IAM-003` causes. | documentation |

## Glossary

- **Launch service**: an AWS service that can run code, or act on AWS, with a role that a principal passes to it with `iam:PassRole`. Lambda is the launch service of 1.1.2.
- **Launch action**: an action of a launch service that starts such code or makes the service act with the passed role (for example `lambda:CreateFunction`, `ecs:RunTask`).
- **Escalation path**: as in `product.md`, generalized: a principal can pass a target role, can perform a launch action of a service, the target role trusts that service, and the target role can access a protected bucket.
- **Over-approximation**, **Pattern**, **Result**, **Ground truth**, **hold-out set**: as in the earlier specs.

## Requirements

### Requirement 1: Complete S3 access

**User story:** As a security reviewer, I want every IAM permission that lets a role read, change, delete, expose, or copy the data of a protected bucket to count as access, so that such a role cannot be passed unnoticed.

#### Acceptance criteria

1. THE set of S3 actions that count as access SHALL be written in the design from the AWS Service Authorization Reference for Amazon S3, with the source and the date. It SHALL cover at least: reading objects and object versions, writing, deleting objects and object versions, changing object ACLs, and replicating objects, on the object set of the protected bucket.
2. THE set SHALL also cover actions on the **bucket** ARN that can grant other principals access to the objects, at least `s3:PutBucketPolicy` and `s3:PutBucketAcl`. Today a bucket-level ARN alone never counts; for these actions it SHALL count.
3. WHERE the design cannot decide whether an S3 action gives access, THE action SHALL count (over-approximation).
4. THE independent oracle SHALL be changed first, in its own commit, from the AWS documentation and not from the evaluator code.
5. THE change SHALL only add findings.

### Requirement 2: Escalation through launch services other than Lambda

**User story:** As a platform engineer, I want ProofGate to report a path that runs code with a passed role through any common AWS service, not only Lambda.

#### Acceptance criteria

1. THE launch services SHALL be described by **one table** (service principal, launch actions, and anything else the service needs, such as an instance profile), so that adding a service is a reviewed change to the table and its tests. Lambda SHALL become one entry of the table, with the same result as 1.1.2 plus the change of PR #10.
2. EACH entry SHALL be checked against the AWS documentation (for example the Service Authorization Reference, which marks the actions that require `iam:PassRole`), with the source and the date in the design. An entry whose behavior cannot be confirmed SHALL NOT be added.
3. THE design SHALL propose the first set of services and why. It SHALL include at least Lambda, ECS (tasks), EC2 (instances with an instance profile), CodeBuild, and CloudFormation (stacks with a service role), unless the documentation shows that one of them does not fit the path.
4. A path SHALL require that the launch action and the trust belong to the **same** service. A trust principal `*` SHALL count for every service (as today for Lambda).
5. IF a target role that can access a protected bucket, and that the principal can pass, trusts a service that is **not** in the table, THEN ProofGate SHALL NOT silently accept it. ProofGate SHALL report `PG-IAM-003` for that role, naming the service and the reason ("cannot tell whether this service runs code with the role") (the user's answer to open question 2).
6. WHERE a service needs a resource that the extractor rejects today (for example `AWS::IAM::InstanceProfile`), THE extractor SHALL read it, with the same fail-closed rules as for roles.
7. THE Lean model MAY be generalized (for example renaming `canControlLambda` and `targetIsLambdaAssumable`), but it SHALL keep four facts per candidate path and the theorem shape `safe generatedPaths = true`. A change of the Lean sources SHALL keep the audit (no `sorry`, no project-defined `axiom`) and SHALL be tested on both the TypeScript and the Lean side. THE documents SHALL keep saying that Lean checks facts that TypeScript computes.
8. THE violation for such a path SHALL keep the rule ID `PG-IAM-004` and SHALL name the service in its explanation.
9. THE change SHALL only add findings, except as allowed in Requirement 3.

### Requirement 3: Templates without IAM roles are accepted

**User story:** As a CDK user, I want to enable ProofGate for my whole app, including stacks that create no IAM role.

#### Acceptance criteria

1. WHEN a template contains no IAM resource at all, THE validator SHALL accept it with no finding. This is a permissive change approved by the user on 2026-11-21.
2. THE following SHALL stay rejected with `PG-IAM-003`: an empty `protectedBucketArns`; an unreadable template; an IAM resource that the extractor does not support; an `AWS::IAM::Policy` that refers to a role outside the template.
3. A template that has roles but no readable statement (for example a role with only a trust policy) SHALL stay rejected (the user's answer to open question 1).
4. THE documents SHALL say plainly that "accepted" for such a template means "no IAM principal in this template", not "proved safe".
5. THE existing tests that assert the rejection of a template without roles SHALL be changed only as approved by the user, and the change SHALL be listed at the checkpoint (known today: the extractor-level generator's empty kind `no-iam`).

### Requirement 4: `Fn::Sub` with known variables

**User story:** As a CDK user, I want the CloudFormation that common CDK constructs write with `Fn::Sub` to be read.

#### Acceptance criteria

1. THE extractor SHALL read `Fn::Sub` in a `Resource` and in `ManagedPolicyArns` when every variable is one that the resolver of 1.1.2 already reads (the pseudo-parameters and references to resources of the same template), with the same reading for each variable.
2. A `Fn::Sub` with a variable map, an unknown variable, a parameter, or a variable that the resolver rejects SHALL stay `PG-IAM-003`.
3. THE literal `${!...}` escape of `Fn::Sub` SHALL be handled as CloudFormation documents it, or rejected.
4. An IAM policy variable inside the `Fn::Sub` text (for example `${aws:username}`) SHALL stay rejected with the policy-variable reason.

### Requirement 5: Two more managed policies

**User story:** As a CDK user, I want a Lambda function in a VPC and a REST API with its default logging role to be read.

#### Acceptance criteria

1. THE table of managed policies SHALL get `AWSLambdaVPCAccessExecutionRole` and `AmazonAPIGatewayPushToCloudWatchLogs`, each with the statements of the AWS managed policy reference, the policy version, and the date.
2. Any other managed policy SHALL stay `PG-IAM-003`.

### Requirement 6: An adoption guide

**User story:** As a new user, I want to know how to enable ProofGate safely and what to do when it rejects my stack.

#### Acceptance criteria

1. THE README (Japanese, added to the existing text) and the package README SHALL say: every stack of the app is checked; a protected bucket needs a fixed name and a literal ARN; how to enable ProofGate only when an environment variable is set; that `elan` is needed; the common `PG-IAM-003` causes and what to do (with the API Gateway `cloudWatchRole: false` example); and what is outside the model (cross-stack paths, acknowledgements).
2. THE guide SHALL be checked against the trial app before it is merged.

### Requirement 7: Tests and evidence

**User story:** As a maintainer, I want evidence that each change does what it says and nothing else.

#### Acceptance criteria

1. EACH rule SHALL be written test-first, and the failing run SHALL be recorded.
2. WHERE a rule changes what the independent oracle computes (Requirements 1 and 2), THE oracle SHALL be changed and committed first.
3. THE generated tests SHALL get the new forms. Existing seeds SHALL keep their content where possible (separate random streams, as in the earlier spec).
4. A differential check against 1.1.2 over the same corpus as before SHALL show that no finding is lost, and SHALL list the inputs that became accepted (only those allowed by Requirements 3, 4, 5).
5. NEW real-stack Patterns SHALL be written for the new services and constructs, with ground truth and predicted Result committed before the implementation of the rule they test. The existing Patterns and hold-out results SHALL keep their Results or a listed, approved difference.
6. THE trial app (outside the repository) SHALL be run again at the end, and the result recorded in `docs/REAL_STACKS.md`.

### Requirement 8: Time and order

**User story:** As the owner, I want the work to fit before the Kiroween deadline (2026-12-04 14:00 PT).

#### Acceptance criteria

1. THE work SHALL be split into steps that can be merged on their own, in this order unless the design shows a reason to change it: Requirement 1 (missed path, small), Requirement 3, Requirement 4, Requirement 5, Requirement 2 (largest), Requirement 6.
2. THE last day for code changes is 2026-11-29 (agreed). Code that is not finished by then SHALL NOT be merged, and the result SHALL be reported as it is.
3. THE user wants to keep trying and improving until that day. AFTER the planned steps, remaining time SHALL be used for more trials (new constructs, the trial app), each with predictions written first, and for fixes that they show; each such fix follows Requirements 7 and 9.

### Requirement 9: Existing behavior and release

#### Acceptance criteria

1. EXISTING tests and assertions SHALL NOT be deleted, skipped, or weakened. An assertion that checks exactly the behavior that a requirement changes SHALL be changed only with the user's approval, listed at a checkpoint.
2. THE rule IDs, the validator API, and the configuration SHALL stay compatible. A new configuration option SHALL NOT be added unless the design shows it is needed and the user approves it.
3. NO dependency or toolchain version SHALL change.
4. THE version, the changelog wording, publishing, tags, and releases SHALL be decided by the user (proposal: 1.2.0, because new paths are detected and role-less templates are accepted).

### Requirement 10: Auditable Kiro work record

1. EACH session SHALL add a dated row to `.kiro/steering/kiroween.md`, including wrong predictions and failed attempts.
2. THE record SHALL NOT claim work that was not done in Kiro, and SHALL NOT contain credentials, tokens, or one-time passwords.
3. THE spec documents SHALL be in English. Code comments SHALL follow the Japanese comment policy.

## Out of scope

- Paths that need no `iam:PassRole` (for example `codebuild:StartBuild` with a buildspec override on an existing project, `ssm:SendCommand` to an instance, or editing the code of an existing function without changing its role). They are a different rule and are listed in `docs/ASSUMPTIONS.md` as not modeled.
- Resource policies, SCPs, permissions boundaries, `Deny`, and conditions on permission statements.
- Cross-stack paths and acknowledgements (documented boundaries).
- Rewording the existing reason texts (item 7).
- Publishing, tagging, or releasing.

## Open questions for approval

1. Requirement 3.3: should a template that **has roles but no readable statement** also be accepted? Recommendation: no, keep it rejected for now. A role whose statements could not be read is already reported for that reason; a role with only a trust policy is rare in CDK.
2. Requirement 2.5: a target role that can access a protected bucket, that the principal can pass, and that trusts a service **not in the table**. Recommendation: report `PG-IAM-003` ("cannot tell whether this service runs code with the role"), so that the table can stay small without hiding paths.
3. Requirement 8.2: is 2026-11-29 the last day for code changes? Requirement 2 is the largest step; if it does not fit, the other steps are merged without it.
4. Should the 16-construct probe of 2026-11-21 become committed Patterns (with predictions written now, before the implementation), or should the new Patterns be chosen fresh in the design?

## Answers (2026-11-21)

1. Roles without a readable statement: keep rejected.
2. A passable, bucket-reaching role that trusts a service not in the table: `PG-IAM-003`.
3. Last day for code changes: 2026-11-29; use the remaining time for more trials and fixes up to that day.
4. The 16-construct probe becomes committed Patterns now. Because the probe was already run on 1.1.2, the 1.1.2 Results are recorded as **observations**, not predictions; the predictions are for the Results **after** this spec, written and committed before any rule of this spec is implemented.
