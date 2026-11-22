# Design: proofgate-self-escalation
Status: DRAFT, written 2026-11-22 after the approval of the requirements. The points that need the user's decision are in section 10. No code has been changed for this spec.
Requirements: [requirements.md](./requirements.md). Evidence: [data-verification.md](./data-verification.md).

## 1. What changes, in one paragraph
A role of the stack that can write IAM can reach every protected bucket. This spec adds three shapes, all reported as `PG-IAM-005`: a **self-grant** (a role writes a policy to itself), a **take-over** (a role rewrites the trust policy of a role that reaches a protected bucket), and a **creation grant** (a role creates a role and writes a policy to it). `PG-IAM-004` and its two shapes do not change. Every change only adds findings or rejections.

## 2. The model
No new field in the model of a stack: roles, their statements, and `roleName` are enough. Two public types change (minor version, together with the brushup release):
- `Violation.ruleId` becomes `"PG-IAM-004" | "PG-IAM-005"` (the constant `RULE_ID` stays; a new constant `RULE_ID_POLICY_WRITE = "PG-IAM-005"` is added).
- `ProofGateConfig` gets `allowedPolicyWriters?: readonly string[]` (Logical IDs of roles, decision 2 of the requirements).

## 3. The table (`packages/core/src/policy-write-actions.ts`, hand-written)
One entry per action: `{ action, shape, source, checked }`, with the evidence in `data-verification.md`. The first set:

| Action | Shape | Meaning in the finding |
| --- | --- | --- |
| `iam:putrolepolicy` | self-grant, creation grant (the writing part) | writes an inline policy to the role |
| `iam:attachrolepolicy` | self-grant, creation grant (the writing part) | attaches a managed policy (for example `AdministratorAccess`) |
| `iam:updateassumerolepolicy` | take-over | rewrites who may assume the role |
| `iam:createrole` | creation grant (the creating part) | creates a role with a trust policy of the caller's choice |

An action pattern of a statement (`*`, `iam:*`, `iam:Put*`, `iam:?ttachRolePolicy`, case-insensitive) matches an entry as for the other rules. A role with `Action: "*"` on `Resource: "*"` therefore has a self-grant (point 10.1).

## 4. The shapes
Let a **role ARN set** of a role R be the ARNs `arn:<p>:iam::<account>:role/<name>`, where the partition and the account contain no colon (the same structured intersection as for the paths without `iam:PassRole`, with the prefix `arn:<NSTAR>:iam::<NSTAR>:role/`), and `<name>` is the literal `RoleName`, or, for an unnamed role, the opaque name `_generated_<LogicalId>` (a wildcard in the name part of a pattern may match the real generated name and counts). A bare logical ID or name is not counted (IAM rejects a Resource that is not an ARN).

- **Self-grant.** Role P has an Allow statement with an action of shape self-grant and a Resource that may denote the role ARN set of P. Finding per protected bucket B (the grant reaches every bucket): principal = target = P.
- **Take-over.** Role P has an Allow statement with `iam:updateassumerolepolicy` and a Resource that may denote the role ARN set of a role T of the template, T is not P, and T reaches B (the S3 rule, unchanged). Finding per (P, T, B).
- **Creation grant.** Role P has an Allow statement S1 with `iam:createrole` and an Allow statement S2 with a self-grant action such that a Resource of S1 and a Resource of S2 both intersect the role ARN shape and intersect each other. (Both patterns are checked against the shape `arn:<NSTAR>:iam::<NSTAR>:role/*` first, so that an S3 ARN in one of them does not count.) Finding per bucket B: principal = P, target = P (the created role is not in the template).
- **Exceptions.** P in `allowedPolicyWriters` is excluded from all three shapes; T in `allowedPassRoleTargets` is excluded from the take-over (requirement 3.3).
- A self-grant makes the creation grant redundant for the same principal; both are reported only once per (P, B), with the self-grant text.

**Violation.** Rule `PG-IAM-005`. `principalLogicalId` = P, `targetRoleLogicalId` = T or P, `protectedBucketArn` = B, `sourcePaths` = the statements of P (and of T that reach B for a take-over). Text, for example: "`P` can write a policy to its own role (`iam:PutRolePolicy`), so it can give itself access to `B` and every other bucket." The `fix` text names `allowedPolicyWriters`.

## 5. Matching
The role ARN matcher is the matcher of the paths without `iam:PassRole` (`resourceDenoted`), generalized to take the ARN shape (prefix tokens, marker, name) of the resource: today it has the three shapes of the role-bearing resources; roles are a fourth shape. This is a refactor of internal code, covered by the existing tests of the implicit paths. The independent oracle keeps its own copy (the structured intersection with NSTAR) and gets the same generalization.

## 6. Lean
A third structure, so that no field is misnamed (as for `ImplicitPath`):

```lean
structure PolicyWritePath where
  principal : String
  target : String
  protectedResource : String
  shape : String        -- "self-grant" | "take-over" | "creation-grant", for explanation only
  canWrite : Bool       -- P holds an action of the shape on a Resource that may denote the role
  reachesAfterWrite : Bool  -- self-grant and creation grant: true (the write gives access); take-over: T reaches B now
  notExempt : Bool      -- P is not in allowedPolicyWriters (and, for a take-over, T is not in allowedPassRoleTargets)
def isPolicyWriteEscalation (p : PolicyWritePath) : Bool := p.canWrite && p.reachesAfterWrite && p.notExempt
def safePolicyWrite (ps : List PolicyWritePath) : Bool := ps.all fun p => !(isPolicyWriteEscalation p)
```

Rows are emitted for every candidate, exempt ones included (with `notExempt := false`), so that Lean checks the exemption too (this follows requirement 7.5 and differs from `ImplicitPath`, where exempt pairs are omitted). `generateLean` gets a third list `generatedPolicyWrite` (empty if the model has no candidate) and the `#eval` marker checks the conjunction of the three `safe` functions. Theorems: the existing two, and `generatedPolicyWriteIsSafe`. The strict shape of the batch runner, `docs/PROOFS.md`, and the claim "Lean checks Booleans that TypeScript computes" are updated.

## 7. Evidence and tests
- **Oracle first**, in its own commit, written from the table and the documentation. It reads the table through a data-only re-export (`aws-policy-write.ts`).
- **Fixed rows** (oracle, evaluator, one Lean launch): each action on `*`, on the own ARN, on another role, on a prefix that matches or not; `iam:*` and `*`; an unnamed role; take-over with T reaching and not reaching B; P = T for the take-over; `allowedPolicyWriters`; `allowedPassRoleTargets` for the take-over; creation grant with `*` and `*`, with disjoint prefixes, with an S3 Resource.
- **Model-level generator stream** (seed xor constant) on a separate random stream; **the existing generator must be adapted**: its principal statements use `iam:*` and `*` as PassRole actions with Resources that may denote a role of the model, which would now be self-grants and break the plan labels (as `iam:*` did for the launch services in Step 5 of the brushup). The adaptation is a change of the generator, not of an assertion, and is listed at the checkpoint.
- **Patterns**, predictions first: RS-49 changes from `accepted` to `PG-IAM-005`; one unsafe and one safe layout per shape; a scoped layout (the role may write only to another role that cannot reach B and cannot be assumed: safe); a pipeline role with `allowedPolicyWriters` (safe).
- **Benchmark**: pathfinding.cloud 52 to 60 of 91 (`iam-005`, `iam-009`, `iam-012`, `iam-014`, `iam-017`, `iam-019`, `iam-020`, `iam-021`), predicted before the run.
- **Differential** against the previous `main`: no finding lost; list every new `PG-IAM-005` finding of the existing Pattern sets (an existing Pattern with a deploy role that holds `iam:*` would show up here).

## 8. Soundness and false alarms
Only adds findings. False alarms are expected for roles that write IAM on purpose (identity pipelines), for administrator roles (`Action: "*"`), and where a `Condition` would have limited the action (rejected today, so not a false alarm but a rejection). The guide says to list such a role in `allowedPolicyWriters` and to prefer a narrow Resource.

## 9. Not modeled (documented)
Users, groups, access keys, customer managed policies, permissions boundaries, SCPs, role chains (a policy write on another role T that P can only use after `sts:AssumeRole`), and any change after deployment by an actor outside the template.

## 10. Points for the user's decision
1. **A role with `Action: "*"` on `Resource: "*"` is reported** (it matches the self-grant actions). It is an administrator already, so the finding adds no new access, but today no rule reports it either, and the exception list handles the intended ones. Proposal: yes (fail closed; the alternative is to skip roles whose statements already allow everything, which hides the administrator role from the report).
2. **Lean structure `PolicyWritePath` with three Booleans, rows for exempt candidates too** (section 6). Proposal: yes.
3. **Public type changes:** `Violation.ruleId` union and `ProofGateConfig.allowedPolicyWriters`; minor version with the brushup release. Proposal: yes.
4. **One finding per (P, bucket) for a self-grant and a creation grant**, with the real bucket ARN, so that the violation shape stays unchanged. Proposal: yes.
5. **Refactor of `resourceDenoted` into a function that takes the ARN shape** (internal; covered by existing tests). Proposal: yes.

## 11. Time
The brushup freeze is 2026-11-29 and the Kiroween deadline is 2026-12-04 14:00 PT. As decided, code starts after Step 7 of the brushup is closed or when the user says so. If the Lean change is not finished by 2026-12-01 the evidence, the table, the oracle, and the Patterns are merged as the documented state and the rule is not released. The result is reported as it is.
