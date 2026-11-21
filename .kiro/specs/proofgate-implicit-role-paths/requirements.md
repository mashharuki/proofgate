# Requirements: proofgate-implicit-role-paths

Status: APPROVED by the user on 2026-11-21 with the proposals of the open questions below (answers recorded at the end). `design.md` and `tasks.md` are not written. No code has been changed for this spec.

## Introduction

`PG-IAM-004` today needs `iam:PassRole`: a principal passes a role that it does not own to a service and runs code with it. AWS has a second class of escalation that needs **no `iam:PassRole`**: the principal changes what an **existing** resource does, and the resource already runs with a powerful role. The data verification of 2026-11-21 found this class in the AWS documentation (`.kiro/specs/proofgate-brushup/data-verification.md`, section 3.8) and the user asked for a spec for it (follow-up c).

This spec adds a second path to `PG-IAM-004`: **a principal can change the behavior of an existing resource that runs with a role, and that role can access a protected S3 bucket.** The rule IDs, the validator API, and the fail-closed rule do not change.

### Evidence (read on 2026-11-21 from the AWS documentation pages; the AWS MCP Server was not connected for these reads)

| Resource that runs with a role | Action that changes its behavior without PassRole | Source and what it says | Status |
| --- | --- | --- | --- |
| CloudFormation stack with a service role | `cloudformation:UpdateStack`, `CreateChangeSet` with `ExecuteChangeSet`, `DeleteStack` | API reference of `roleArn` (`ContinueUpdateRollback`): "CloudFormation uses this role even if the users don't have permission to pass it", provided the user can operate on the stack | verified (read earlier through the MCP Server) |
| CodeBuild project | `codebuild:StartBuild` with `buildspecOverride` | API reference of `StartBuild`: `buildspecOverride` overrides the build commands for this build; "an IAM principal with the ability to call this API and set this parameter can override the default settings" | verified |
| Step Functions state machine | `states:UpdateStateMachine` with `definition` only | API reference: "You must include at least one of `definition` or `roleArn`", so a `definition`-only update is allowed; executions use the updated definition and `roleArn` | verified |
| Lambda function | `lambda:UpdateFunctionCode` | The code of an existing function runs with the role of the function | obvious from the API, not read on a page in this session |
| ECS task definition | `ecs:RunTask` with `overrides` (`containerOverrides`) | API reference of `TaskOverride` has `containerOverrides`; the command field of `ContainerOverride` was not read | partly verified |
| EC2 instance with an instance profile | `ssm:SendCommand`, `ssm:StartSession` | not read | to verify |
| Glue job, SageMaker, others | `glue:UpdateJob` and similar | not read | to verify |

The first three are verified from the documentation and are the first candidates.

## Glossary

- **Implicit use of a role**: an action that makes an existing resource act with the role that is already attached to it, with behavior chosen by the caller, and without `iam:PassRole` for that role.
- **Role-bearing resource**: a resource in the template that has a role attached (`AWS::Lambda::Function` with `Role`, `AWS::CodeBuild::Project` with `ServiceRole`, `AWS::StepFunctions::StateMachine` with `RoleArn`, `AWS::ECS::TaskDefinition` with `TaskRoleArn`, and others).
- **Target role**, **protected bucket**, **path**: as in `product.md`.

## Requirements

### Requirement 1: The rule

**User story:** As a platform engineer, I want ProofGate to report a principal that can change an existing function, project, or state machine that already runs with a role that reaches a protected bucket.

#### Acceptance criteria

1. A **path through implicit use** exists when: (a) a principal holds an action of the table of Requirement 2 on a Resource that matches the ARN of a role-bearing resource R of the same template; (b) R runs with a target role T; (c) T can access a protected bucket (the S3 rule of Step 2). The principal and T may be the same role only if the principal could not already act as T (a role that holds the action on a resource that runs as itself is not a new escalation); the design SHALL decide and test this case.
2. The violation SHALL keep the rule ID `PG-IAM-004` and SHALL name the resource, the action, and the role.
3. THE rule SHALL only add findings compared with the version without it.

### Requirement 2: The table of implicit-use actions

1. THE actions SHALL come from a reviewed table (service, action, resource type, how the behavior is chosen, source and date). The Service Reference has no field for this, so the table is written by hand from the AWS documentation; an entry whose behavior is not confirmed SHALL NOT be added.
2. THE first set SHALL contain the entries marked verified in the evidence table and the Lambda entry, unless the design shows a reason to drop one.
3. EACH entry SHALL say which resource type it applies to and how the Resource of the statement is matched to the resource in the template (by ARN pattern, by logical ID, or opaque name).

### Requirement 3: Reading the association

1. THE extractor SHALL read, for each role-bearing resource type of the first set, which role is attached (a `Ref` or `Fn::GetAtt` to a role of the same template, or a literal ARN).
2. A role that cannot be identified (a parameter, an import, a role outside the template) SHALL NOT be guessed: the association is unknown and the resource SHALL be reported under the fail-closed rule of the design (open question 2).
3. THE model type MAY get a field for the association. A change of the model type SHALL be tested on the TypeScript and Lean sides.

### Requirement 4: Resources that CloudFormation roles hide

1. A CloudFormation stack role is set when a stack is created or updated, not inside the template of that stack. ProofGate sees only templates. THE requirements therefore cover `cloudformation:UpdateStack` only where the template defines the role as a stack role in a way that can be read (for example an `AWS::CloudFormation::Stack` resource with a role property), or are limited to documentation (open question 3).

### Requirement 5: Tests and evidence

1. Each rule is written test-first. The independent oracle changes first, in its own commit, from the AWS documentation, and not from the evaluator.
2. New real-stack Patterns with ground truth and predictions committed before the implementation: one unsafe and one safe layout for each service of the first set.
3. A differential check against the version without the rule: no finding lost.

### Requirement 6: Time and release

1. THE spec starts after `proofgate-brushup`. The code freeze of that spec is 2026-11-29 and the Kiroween deadline is 2026-12-04 14:00 PT; this spec SHALL be time-boxed, and the result of what is finished SHALL be reported as it is.
2. Nothing is published, tagged, or released without the user's instruction.

### Requirement 7: Existing behavior

1. Existing tests are not deleted, skipped, or weakened. Dependencies and toolchain do not change. The Lean theorem keeps its shape; the Boolean facts MAY be generalized as in `proofgate-brushup` Step 5.

## Out of scope

- Paths that need a permission to **create** a resource with a new role (that is the PassRole path, already covered).
- Resource policies, SCPs, permission boundaries, conditions on permission statements (for example the condition key that restricts `buildspecOverride`).
- Roles that the template does not define.

## Open questions for approval

1. Which services are in the first set? Proposal: Lambda (`UpdateFunctionCode`), CodeBuild (`StartBuild`), Step Functions (`UpdateStateMachine`), because they are verified or obvious and the association is readable from the template.
2. When the role of a resource cannot be identified, should a principal that holds the action on that resource be rejected with `PG-IAM-003` (fail closed), or ignored? Proposal: `PG-IAM-003` only if the principal's statement matches the resource and the resource's role is unknown, so that ordinary stacks are not rejected.
3. CloudFormation stack roles (Requirement 4): include, or document only? Proposal: document only in this spec, because ProofGate cannot see the stack role.
4. Is a role that can update its own function (principal equals target) a finding? Proposal: no.
5. Should this spec wait until `proofgate-brushup` is finished (after 2026-11-29), or run in parallel with Step 5? Proposal: finish Step 5 first.

## Decisions (2026-11-21, user)
1. First set: Lambda (`UpdateFunctionCode`), CodeBuild (`StartBuild`), Step Functions (`UpdateStateMachine`). The user wants **more services added after `proofgate-brushup` is finished**; the table and the design SHALL make adding a service a table entry plus tests, not a new code path.
2. Unknown role of a resource: `PG-IAM-003` only if the principal's statement matches the resource and the role is unknown.
3. CloudFormation stack roles: documentation only.
4. A role that updates its own function is not a finding.
5. This spec starts after Step 5 of `proofgate-brushup`.
