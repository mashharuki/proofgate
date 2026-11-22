# Requirements: proofgate-self-escalation
Status: DRAFT, written 2026-11-22, awaiting the user's approval. `design.md` and `tasks.md` are not written. No code has been changed for this spec.

## Introduction
`PG-IAM-004` finds paths in which a principal reaches a protected S3 bucket by **running code** as another role (with `iam:PassRole` and a launch action, or by changing a resource that already runs as a role). AWS has a third class that needs no code at all: the principal **changes IAM itself**. It writes a policy to its own role, attaches a managed policy to it, or rewrites the trust policy of a more powerful role so that it can assume that role. After that it can reach everything the new permissions allow, including the protected bucket.

This is class C of `.kiro/steering/direction-research.md`. It is the next item of the order that the user approved on 2026-11-22 (B, then C). The user decided that it gets **a new rule ID, `PG-IAM-005`**.

The rule: **a role of the stack can grant itself permissions it does not have today, or can take over another role that reaches a protected bucket, by changing IAM.** `PG-IAM-004` and its behavior do not change. The fail-closed rule does not change.

### Evidence
Read for this draft from `.kiro/specs/proofgate-direction-research/sources/` and from the pathfinding.cloud data in `tests/data/pathfinding-cloud/` (commit `b3f449e`, Apache-2.0). The AWS pages of the actions are not read yet; reading them is the first task of the design (as in `data-verification.md` of `proofgate-implicit-role-paths`), and an action whose page does not confirm the behavior stays out of the table.

| Technique | Actions | Source | Template-visible? | In this spec |
| --- | --- | --- | --- | --- |
| Inline policy on its own role | `iam:PutRolePolicy` | pathfinding.cloud `iam-005` (self-escalation); Rhino Security Labs part 1 | yes (the grant) | first set |
| Managed policy on its own role | `iam:AttachRolePolicy` | `iam-009`; Rhino part 1 | yes | first set |
| Trust rewrite of a role that reaches the bucket, then assume | `iam:UpdateAssumeRolePolicy` | `iam-012`, and `iam-019` to `iam-021` with a policy action; Rhino part 1 | yes | first set |
| Create a new role and give it admin | `iam:CreateRole` with `iam:AttachRolePolicy` or `iam:PutRolePolicy` | Unit 42 report on the `.env` extortion campaign (2024), https://unit42.paloaltonetworks.com/large-scale-cloud-extortion-operation/ | the grants are visible, the new role is not | first set (open question 3) |
| New default version of a customer managed policy | `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion` | `iam-001`; Rhino part 1 | no: `AWS::IAM::ManagedPolicy` is rejected as unsupported today | out of scope |
| Policy or access key of a user or group | `iam:PutUserPolicy`, `iam:AttachUserPolicy`, `iam:AddUserToGroup`, `iam:CreateAccessKey`, `iam:CreateLoginProfile`, ... | `iam-002`, `iam-004` to `iam-008`, `iam-010`, `iam-011`, `iam-013`, `iam-015`, `iam-018` | no: `AWS::IAM::User` and `AWS::IAM::Group` are rejected as unsupported today | out of scope |
| A role chain (policy change on role T, then `sts:AssumeRole`) | `iam-014`, `iam-016`, `iam-017`, `sts-001` | pathfinding.cloud | needs role chains | out of scope (direction 4 of the steering file) |

Of the 22 `self-escalation` and `principal-access` paths of the benchmark (8 and 14), the first set covers 8: `iam-005`, `iam-009`, `iam-012`, `iam-014`, `iam-017`, `iam-019`, `iam-020`, `iam-021` (the ones that contain a role-level action on a resource that can be the principal's own role, or `iam:UpdateAssumeRolePolicy`). This is a prediction to be written down before the Patterns run (Requirement 7).

## Glossary
- **Self-grant**: a role holds an action that writes a permission to a role, on a Resource that may denote the role itself.
- **Take-over**: a role holds `iam:UpdateAssumeRolePolicy` on a role T that reaches a protected bucket, so it can add itself to the trust policy of T and assume it.
- **Creation grant**: a role holds `iam:CreateRole` and a policy-writing action (`iam:AttachRolePolicy`, `iam:PutRolePolicy`) with Resources that may denote the same, not yet existing, role.
- **Target role**, **protected bucket**: as in `product.md`.

## Requirements

### Requirement 1: The rule and its ID
**User story:** As a platform engineer, I want ProofGate to report a role that can give itself, or take over, permissions, because then no bucket protection holds.
#### Acceptance criteria
1. A finding of this spec SHALL have the rule ID `PG-IAM-005`. `PG-IAM-004` SHALL keep its meaning and its findings.
2. The type of `Violation.ruleId` SHALL allow `PG-IAM-005` (a public type change of `@proofgate-cdk/model`, minor version, announced in the CHANGELOG), and the validator SHALL map it like the other rules.
3. A self-grant and a creation grant SHALL be reported even if the role cannot reach a protected bucket today: after the grant it can. A take-over SHALL be reported only if the role that is taken over reaches a protected bucket.
4. THE rule SHALL only add findings or rejections compared with the version without it.

### Requirement 2: The self-grant
1. A **self-grant** exists when a role R has an Allow statement with `iam:PutRolePolicy` or `iam:AttachRolePolicy` and a Resource that may denote the ARN of R (`*`, the ARN of R, a pattern that matches its name, `arn:aws:iam::*:role/*`; an unnamed role is read as its opaque name, as for `iam:PassRole` targets).
2. THE evidence for each action SHALL be read from the AWS documentation before it enters the table (design task 1), with the URL and the date.
3. Every other action that writes a permission to a role (`iam:PutRolePermissionsBoundary` removes limits only when it deletes one, which is a different action) SHALL be listed with a decision: in the table, or out with a reason.

### Requirement 3: The take-over
1. A **take-over** exists when a role P has an Allow statement with `iam:UpdateAssumeRolePolicy` and a Resource that may denote a role T of the template, T is not P, and T reaches a protected bucket (the S3 rule of the brushup).
2. THE finding SHALL name P, T, and the bucket, like `PG-IAM-004`.
3. T listed in `allowedPassRoleTargets` SHALL be excluded, as for the other rules (decision of 2026-11-22).

### Requirement 4: The creation grant
1. A **creation grant** exists when one role holds `iam:CreateRole` and `iam:AttachRolePolicy` or `iam:PutRolePolicy`, and a Resource of the first may denote the same role name as a Resource of the second (the Resources intersect, with the same matching as `iam:PassRole` targets). With `*` on both, this holds.
2. The shape is the Unit 42 sequence; the new role is not in the template, so it is not a target role.

### Requirement 5: Matching and what is not read
1. Action patterns, Resource patterns, and the opaque name of an unnamed role SHALL be matched as for `iam:PassRole` targets (`allowsPassRoleTarget`), including the rule that a `*` or `?` may stand for a colon.
2. A `Condition` on a statement stays rejected with `PG-IAM-003`, as today. This matters: CI roles often limit `iam:AttachRolePolicy` with a permissions-boundary condition, and such a template is rejected, not analyzed. The documentation SHALL say so.
3. Deny statements stay ignored (conservative), permissions boundaries and SCPs are not modeled (documented).
4. Users, groups, managed policies, access keys, and role chains are out of scope (the table above). A template that contains them keeps today's behavior (rejected as unsupported where it is today).

### Requirement 6: Exceptions
1. A role that must write IAM on purpose (an identity pipeline) SHALL be allowed by name, by a new optional field of `ProofGateConfig` (open question 2). The field only lists Logical IDs; an entry that matches no role SHALL be ignored (no error).
2. The finding text SHALL say how to allow it.

### Requirement 7: Evidence and tests
1. Each rule is written test-first. The independent oracle changes first, in its own commit, written from the table and the documentation, not from the evaluator.
2. New real-stack Patterns, ground truth and predictions committed first: one unsafe and one safe layout for each shape (self-grant by `PutRolePolicy`, by `AttachRolePolicy`; take-over; creation grant), a layout with a scoped Resource (the role may write only to another role), and RS-49 (Unit 42 shape, `iam:AttachRolePolicy` on `*`) must change from `accepted` to `PG-IAM-005`.
3. The pathfinding.cloud benchmark is run again; the prediction (8 more, 60 of 91) is written before the run.
4. A differential check against the version without the rule: no finding lost.
5. THE Lean side SHALL check the new facts with its own structure (the three Booleans of a self-grant: the role can write a policy to itself, the Resource may denote it, and the finding is not allowed by the exception list), as `ImplicitPath` did for the paths without `iam:PassRole`; the existing structures keep their fields.

### Requirement 8: Time and release
1. THE spec is time-boxed: the brushup freeze is 2026-11-29 and the Kiroween deadline is 2026-12-04 14:00 PT. The result of what is finished SHALL be reported as it is. If the Lean change is not finished by 2026-12-01, the oracle, the table, and the Patterns are still merged as the documented state, and the rule is not released.
2. Nothing is published, tagged, or released without the user's instruction.

### Requirement 9: Existing behavior
1. Existing tests are not deleted, skipped, or weakened. Dependencies and toolchain do not change. A forced change of an existing file is listed at a checkpoint for the user's approval.

## Out of scope
- Users, groups, access keys, login profiles, customer managed policies (the extractor rejects them today).
- Role chains and any path that needs `sts:AssumeRole` between template roles (direction 4).
- A policy that is changed after deployment by an actor outside the template, SCPs, permissions boundaries, and conditions on statements.

## Open questions for approval
1. **Report a self-grant even if the role reaches no protected bucket today?** Proposal: yes. After the grant it reaches every bucket, so the protection of the bucket is void. The alternative (report only if the role already reaches a bucket) would miss exactly the dangerous roles.
2. **The exception list.** Proposal: a new optional field `allowedPolicyWriters?: string[]` (Logical IDs of roles) in `ProofGateConfig`, separate from `allowedPassRoleTargets`, because the meaning differs (a role that may write IAM, not a role that may be passed). The alternative is to reuse `allowedPassRoleTargets`, which saves a field but mixes two meanings.
3. **Include the creation grant (Requirement 4)?** Proposal: yes, it is the Unit 42 shape and cheap (two actions and an intersection). It over-reports a pipeline that creates roles with a fixed name prefix and attaches only to roles of that prefix; the intersection of the two Resources handles a prefix, `*` does not.
4. **Which of `PutRolePolicy` and `AttachRolePolicy` on a Resource of `*` is a finding?** Proposal: both, since `*` denotes the role itself.
5. **Order.** Proposal: write the design after the user approves these requirements; start the code only after Step 7 of the brushup is closed or the user says otherwise.
