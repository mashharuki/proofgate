# Design: proofgate-implicit-role-paths
Status: DRAFT, written 2026-11-22 after the approval of the requirements (open questions 1 to 5 answered). The points that need the user's decision are in section 10. No code has been changed for this spec.
Requirements: [requirements.md](./requirements.md).

## 1. What changes, in one paragraph
Today `PG-IAM-004` has one shape: principal P can pass role T to a service S and launch it. This spec adds a second shape: P can **change an existing resource R** (a Lambda function, a CodeBuild project, a Step Functions state machine) that **already runs as T**, and T reaches a protected bucket. There is no `iam:PassRole`. The rule ID, the validator API, and the fail-closed rule do not change. Every change only adds findings or rejections.

## 2. The model
`packages/model` gets an **optional** list of role-bearing resources. A model without it means "none", so every existing test, fixture, and regression JSON stays valid and `version` stays `"1"`.

```ts
export type ResourceKind = "lambda-function" | "codebuild-project" | "stepfunctions-state-machine";
export interface ResourceModel {
  readonly logicalId: string;
  readonly kind: ResourceKind;
  /** Literal physical name, if the template sets one. Without it the opaque name `_generated_<LogicalId>` is used, as for roles and buckets. */
  readonly name?: string;
  /** Logical ID of the role of the same template that the resource runs as. */
  readonly roleLogicalId?: string;
  /** True if the role cannot be identified (parameter, import, a role outside the template). Then `roleLogicalId` is absent. */
  readonly roleUnknown?: boolean;
  readonly sourcePath: string;
}
export interface StackModel { readonly version: "1"; readonly roles: readonly RoleModel[]; readonly resources?: readonly ResourceModel[] }
```

## 3. Extractor
Reads three resource types (a table, so more types are added by one entry plus tests; the user wants more services after the brushup):

| Kind | CloudFormation type | Role property | Name property |
| --- | --- | --- | --- |
| `lambda-function` | `AWS::Lambda::Function` | `Role` | `FunctionName` |
| `codebuild-project` | `AWS::CodeBuild::Project` | `ServiceRole` | `Name` |
| `stepfunctions-state-machine` | `AWS::StepFunctions::StateMachine` | `RoleArn` | `StateMachineName` |

The role value is read with the existing resolver. It is identified when it is `Fn::GetAtt [<RoleId>, Arn]` of a role of the template, or a literal ARN whose role name equals the `RoleName` of a role of the template. Anything else (parameter, `Fn::ImportValue`, a role not in the template, a missing property) sets `roleUnknown`. A resource whose `Type` is one of the three but whose `Properties` cannot be read at all is `roleUnknown` too. Nothing here rejects a template by itself; the rejection is decided in section 6.

**Resolver change (narrowing).** Today `Ref` and `Fn::GetAtt` of a resource other than a bucket or a role are read as `*`. For the three kinds, `GetAtt [Id, Arn]` and `Ref` are read as the ARN pattern of the resource (`arn:<partition>:lambda:*:*:function:<name>`, `arn:<partition>:codebuild:*:*:project/<name>`, `arn:<partition>:states:*:*:stateMachine:<name>`, with the name or the opaque name), over the three partitions as for buckets. Without this, a statement on `fn.functionArn` would be read as `*` and match every function, which is a false alarm for the new rule. The old rules read no Resource of these actions (launch actions are not matched by Resource), so no old finding disappears; the differential check of task 3.3 verifies it.

## 4. The table of implicit-use actions (`packages/core/src/implicit-actions.ts`, hand-written)
One entry per action: `{ action, kind, behavior, source, checked }`. An entry is added only after the documentation page was read (Step 1, task 1.1). The first set:

| Action | Kind | What the caller chooses | Evidence status |
| --- | --- | --- | --- |
| `lambda:UpdateFunctionCode` | lambda-function | the code that runs as the function role | to read (task 1.1) |
| `lambda:UpdateFunctionConfiguration` | lambda-function | layers and `ImageConfig`, so the code that runs | read 2026-11-20 and 2026-11-21 (see `docs/ASSUMPTIONS.md`) |
| `codebuild:StartBuild` | codebuild-project | `buildspecOverride` | read 2026-11-22 |
| `codebuild:StartBuildBatch` | codebuild-project | buildspec of the batch | to read (task 1.1); pathfinding.cloud codebuild-003 |
| `states:UpdateStateMachine` | stepfunctions-state-machine | `definition` without `roleArn` | read 2026-11-22 |

Over-approximations, written in `docs/ASSUMPTIONS.md`: the new code or definition still has to be run by something (an invoke, a trigger, `StartExecution`); the table does not require that second action. Conditions on the statement (for example a condition that blocks `buildspecOverride`) are rejected as today (`PG-IAM-003`), so they are never silently ignored.
Out of the table on purpose: CloudFormation stack roles (not visible in a template; requirements 4 and decision 3), and every action whose behavior was not confirmed.

## 5. The path
For a principal P, a resource R of kind K with `roleLogicalId = T`, a protected bucket B:

- `canChange`: P has an Allow statement with an action that matches an entry of kind K (`*`, `?`, case-insensitive, as everywhere) and a Resource that may denote R.
- `runsAs`: R's role is T (true by construction; a candidate exists only for resources with an identified role).
- `targetCanAccess`: T reaches B (the S3 rule of the brushup, unchanged).
- Excluded: P = T (decision 4), and T listed in `allowedPassRoleTargets` (point 10.1).

**Does a Resource denote R?** As for `iam:PassRole` targets (`allowsPassRoleTarget`): a pattern `*` matches; otherwise the pattern is split at the type marker (`:function:`, `:project/`, `:stateMachine:`); the name part is matched against the literal `name`, or, for an unnamed resource, a wildcard in the name part may match the real generated name (counts), and a literal counts only if it is the opaque name. The scope part (partition, region, account) is kept from the pattern, as for roles. A bare logical ID or physical name in `Resource` also counts (over-approximation, same as `iam:PassRole`).

**Violation.** Rule `PG-IAM-004`. `principalLogicalId` = P, `targetRoleLogicalId` = T, text: "`P` can change `R` (`<action>`), which runs as `T`; `T` can access protected bucket `B`." `sourcePaths` = the statement of P, the resource, the statements of T that reach B. The `fix` text of the validator names the resource.

## 6. Unknown role (decision 2)
`unknownRoleFindings(model, config)`: for each resource with `roleUnknown` such that some principal has an Allow statement with a matching action and a Resource that may denote the resource, report `PG-IAM-003` at `Resources.<id>.Properties.<RoleProperty>`: "`<id>` runs as a role that ProofGate cannot identify, and a principal can change it". It does not fire for resources nobody can change, so ordinary stacks are not rejected (a function with a role from a parameter and no statement that touches it is fine). A principal here is any role of the template.

## 7. Lean
Today's `EscalationPath` (four Booleans plus `service`) is unchanged. A second structure is added:

```lean
structure ImplicitPath where
  principal : String
  resource : String
  target : String
  protectedResource : String
  canChange : Bool
  runsAsTarget : Bool
  targetCanAccess : Bool
def isImplicitEscalation (p : ImplicitPath) : Bool := p.canChange && p.runsAsTarget && p.targetCanAccess
def safeImplicit (ps : List ImplicitPath) : Bool := ps.all fun p => !(isImplicitEscalation p)
```

`generateLean` always emits `generatedImplicit` (empty when the model has no resources) and the check becomes `ProofGate.safe generatedPaths && ProofGate.safeImplicit generatedImplicit`. The generated theorem is `... = true := by native_decide`, same form. The strict shape regex of the batch runner (`tests/pbt/support/lean-batch.ts`) and `docs/PROOFS.md` change accordingly; a test with both lists tells a flipped fact in either list. Statement kept: Lean checks Booleans that TypeScript computes. `emptyModelIsSafeAtBooleanLevel` and `completeEscalationIsUnsafe` get an implicit twin. No `sorry`, no project `axiom`.

## 8. Evidence and tests
- **Oracle first**, in its own commit, written from the table and the documentation, not from the evaluator: an independent matcher for resource ARNs, the same `allowedPassRoleTargets` rule.
- **Model-level generator**: a new stream (seed xor constant) adds resources to generated models, with a label from the plan; a new tag if the evaluator over-approximates (bare logical ID in `Resource`).
- **Extractor-level generator**: templates with the three resource types and role bindings by `GetAtt`, literal ARN, parameter (poison), import (poison); mutants that ignore the role binding or read an unknown role as known.
- **Patterns** (predictions committed first): per service one unsafe and one safe layout, plus an unknown-role layout; RS-48 (Sysdig 2025 shape) must change from `accepted` to `PG-IAM-004`. The pathfinding.cloud benchmark predicts the gain: lambda-003/004/005, codebuild-002/003, and stepfunctions-002 become findings (46 to 52 of 91).
- **Differential** against the previous `main`: no finding lost; new findings listed by kind.

## 9. Soundness and false alarms
Only adds findings and `PG-IAM-003` rejections. False alarms are expected where the second step cannot happen (a function nobody invokes, a state machine nobody starts) and where a statement is scoped by a Condition (rejected, so not a false alarm). A CI role that deploys a function and so may update its code is a real finding under this rule (code update runs as the function role); the user handles it with `allowedPassRoleTargets` (point 10.1) or by removing the permission.

## 10. Points for the user's decision
1. **`allowedPassRoleTargets` also silences implicit paths to that role.** The option is documented as "explicitly allowed PassRole targets". Proposal: yes, a listed role is a role the team accepts as powerful; the alternative is a new option name (`allowedImplicitTargets`), which is more explicit but adds configuration.
2. **Resolver narrowing for the three kinds (section 3).** It makes `GetAtt Arn` precise instead of `*`. It cannot remove a finding of an old rule, but it changes what the extractor returns for those statements. Proposal: yes.
3. **Two entries beyond the requirements' first set**: `lambda:UpdateFunctionConfiguration` (already accepted as Lambda control) and `codebuild:StartBuildBatch`. Proposal: yes, if task 1.1 confirms the second in the documentation.
4. **Lean structure (section 7)**: a second structure and list, not a change of `EscalationPath`. Proposal: yes, because the facts differ and a reader should not see `canPassRole := true` for a path with no PassRole.
5. **Model type change.** The optional `resources` field is a public-type addition of `@proofgate-cdk/model`; it needs a minor version (1.2.0 with the brushup). Proposal: yes.

## 11. Time
The brushup has its code freeze on 2026-11-29 and the Kiroween deadline is 2026-12-04 14:00 PT. Order of work: Step 1 (documentation and Patterns, no code), then Steps 2 to 4. If the Lean change (Step 3) is not finished by 2026-12-01, the extractor, the table, the oracle, and the Patterns are still merged as the documented state, and the rule is not released. The result is reported as it is.
