# Design: proofgate-lean-evaluator

Status: DRAFT (2026-11-27), waiting for the user's review. It follows the external expert's feedback of 2026-11-27: write the rule over request strings and compute it over patterns. Requirements: [requirements.md](./requirements.md). Sections 9 and 10 list the requirement changes that this design needs. `tasks.md` follows after approval.

## 1. The central idea

Specification and implementation quantify over different things, so the main theorem does not restate the code.

- **Specification (`EscalatesTo`):** written as AWS requests. *There exist* concrete strings (a role ARN, a launch resource, an object ARN) such that the right API calls are allowed. No pattern intersection appears in it.
- **Implementation (`findings`):** computed with pattern intersection (`intersect`) and matching (`globMatch`) over statements and tables.
- **Bridge:** `intersect_iff` (two patterns intersect if and only if a common string exists) connects the two. The proof of `findings_iff` applies this bridge to statement lists and tables. Without it the proof does not go through, so the main theorem is not trivial.

## 2. What the spikes established (all in `spike/`, Lean 4.31.0 core only)

| File | Result | Time |
| --- | --- | --- |
| `MatchSpike.lean` (145 lines) | `globMatch_iff` (matcher = declarative `Matches`); monotonicity of `allows`; demo stack verdicts by kernel `decide` | 4.1 s |
| `IntersectSpike.lean` (266 lines, sub-agent) | `intersect_iff` for `lit`, `one`, `star`, both directions; kernel-evaluable | 1.5 s |
| `IntersectNSpike.lean` (593 lines, sub-agent) | `intersect_iff` and `globMatch_iff` with a fourth token `nstar` (a run without `:`); `arn:aws:iam::*:role/other-*` does not meet the role ARN of `data-role`, while with plain stars it would | 3.2 s |
| `SpecSpike.lean` (203 lines) | `Allowed`, `RoleArn`, `ObjectOf`, `EscalatesTo` over strings; three witness theorems; the counterexample theorem for the pre-1.0 S3 check | 4.0 s |
| `PerfSpike.lean` + `gen-table*.mjs` | the full launch table (879 actions) as Lean data; see section 6 | see 6 |

`#print axioms` on `intersect_iff` and `globMatch_iff` gives only `propext` and `Quot.sound`. Per-instance `decide` checks also use `Classical.choice`. No file uses `sorry`, `axiom`, `admit`, or `native_decide` (except the deliberate `native_decide` comparison in `PerfSpike.lean`).

## 3. Finding F1: ProofGate 1.2.0 misses PassRole Resources without the literal `:role/`

Writing the rule over strings exposed a false negative in the published version. Probe (`spike/passrole-probe.mjs`, the 1.2.0 evaluator; a data role reads the protected bucket, a developer role holds `lambda:CreateFunction` and `iam:PassRole` on the given Resource):

| `iam:PassRole` Resource | 1.2.0 | The rule over strings | The real IAM engine |
| --- | --- | --- | --- |
| `*` | reported | escalates | allows |
| `arn:aws:iam::*:role/*` | reported | escalates | allows (P01) |
| `arn:aws:iam::*:role*` | **missed** | escalates (`SpecSpike.passRoleWithoutRoleSlashEscalates`) | allows (observation P10) |
| `arn:aws:iam:*role/x` (form) | **missed** | escalates | allows (observation P11) |
| `arn:aws:iam::*:*` | **missed** | escalates (`SpecSpike.passRoleOnAllIamEscalates`) | allows (by the same rule as P11) |
| `arn:aws:iam::123456789012:*`, `arn:*:iam::*:*`, `arn:aws:*`, `arn:*` | **missed** | escalates | allows (P14 for `arn:aws*`) |

Cause: `allowsPassRoleTarget` in `packages/core` looks for the substring `:role/` and returns false without it. The independent oracle (`passRoleResourceMatches`) splits the Resource at colons and requires `role/`, so it has the same blind spot. The generated tests could not catch it, because the oracle and the evaluator agree. The 58 IAM observations were compared only with the generic matchers, not with the PassRole functions (`tests/pbt/aws-observations.test.ts`), so P10, P11, and P14 never reached the PassRole code.

This is a real fail-open defect: `arn:aws:iam::123456789012:*` is a plausible Resource in a deployment policy. It is also the kind of defect that the main theorem catches: with the 1.2.0 PassRole check, `findings_iff` is false, and `SpecSpike.lean` already holds the witnesses.

Fix (section 8): the oracle first, alone; then the evaluator. Both read a PassRole Resource as "denotes some identifier of the target role" (section 4.2), with NSTAR for the partition and the account. The fix only adds findings.

## 4. The specification

### 4.1 Input normalization that stays in TypeScript (trusted, listed in PROOFS.md)

1. All action patterns, resource patterns, role names, logical IDs, and bucket ARNs are lowercased. This is the decided case-insensitive over-approximation; the evaluator already does it.
2. Trust services: the regional form is mapped to the global one, as today.
3. A protected bucket ARN with a wildcard: unnamed buckets' opaque names in Resources are replaced by `*`, as today.
4. The extractor rejects a policy string that contains the reserved character U+0000 (`PG-IAM-003`). Section 4.2 needs this; no real policy contains it.

### 4.2 Definitions (Lean, sketch)

```lean
/-- Some Allow statement allows the action on the resource. Deny is ignored (decided over-approximation). -/
def Allowed (st : List Stmt) (action resource : List Char) : Prop :=
  ∃ s ∈ st, s.effect = .allow ∧ (∃ ap ∈ s.actions, Matches ap action) ∧ (∃ rp ∈ s.resources, Matches rp resource)

/-- A string without a colon: the partition and the account of a role ARN. -/
def NoColon (x : List Char) : Prop := ':' ∉ x

/-- The names a role may have. A named role has its name. An unnamed role has the opaque name
`_generated_<LogicalId>`, or a name CloudFormation chooses at deploy time, which we read as an unknown string
that contains the reserved character ⊥ (U+0000); no policy literal can equal it, and any wildcard can. -/
def PossibleName (t : Role) (n : List Char) : Prop :=
  match t.name with
  | some name => n = name
  | none => n = opaque t ∨ '\u0000' ∈ n

/-- What an `iam:PassRole` Resource may denote: the role's ARN, or (decided over-approximation) its bare name or
logical ID. -/
def RoleIdent (t : Role) (x : List Char) : Prop :=
  (∃ part acct n, NoColon part ∧ NoColon acct ∧ PossibleName t n ∧
      x = "arn:".toList ++ part ++ ":iam::".toList ++ acct ++ ":role/".toList ++ n) ∨
  (∃ n, PossibleName t n ∧ x = n) ∨ x = t.logicalId

/-- An object of a protected bucket: a bucket name that the protected ARN pattern matches, then `/`, then a key. -/
def ObjectOf (bp : List Tok) (obj : List Char) : Prop := ∃ b key, Matches bp b ∧ obj = b ++ '/' :: key
def BucketOf (bp : List Tok) (b : List Char) : Prop := Matches bp b

/-- P can launch service `svc`: some table entry for `svc` (or an any-service entry) is allowed on some resource.
The launch resource is any string: a decided over-approximation (the evaluator ignores it today). -/
def CanLaunch (p : Role) (svc : String) : Prop :=
  ∃ e ∈ launchTable, (svc ∈ e.services ∨ "*" ∈ e.services) ∧ ∃ r, Allowed p.stmts e.action r

def Trusts (t : Role) (svc : String) : Prop := svc ∈ t.trusts ∨ "*" ∈ t.trusts

def Reaches (t : Role) (bp : List Tok) : Prop :=
  (∃ a ∈ objectActions, ∃ obj, ObjectOf bp obj ∧ Allowed t.stmts a obj) ∨
  (∃ a ∈ bucketGrantActions, ∃ b, BucketOf bp b ∧ Allowed t.stmts a b)

def EscalatesTo (m : Model) (p t : Role) (bp : List Tok) : Prop :=
  t ∈ m.roles ∧ t.logicalId ≠ p.logicalId ∧ t.logicalId ∉ m.allowedPassRoleTargets ∧
  (∃ x, RoleIdent t x ∧ Allowed p.stmts "iam:passrole" x) ∧
  (∃ svc, CanLaunch p svc ∧ Trusts t svc) ∧ Reaches t bp
```

`objectActions` holds the 44 object actions and `s3:*`, which the evaluator keeps as an entry. `bucketGrantActions` holds the 7 bucket-grant actions. `launchTable` holds the 879 entries plus the supplements. All of them are generated data (section 5.2).

### 4.3 Decisions in the specification (they are hard to change later)

| ID | Decision | Effect on verdicts vs 1.2.0 |
| --- | --- | --- |
| S1 | Lowercase everything (4.1.1) | none |
| S2 | `*` and `?` may stand for a colon (`Matches` as in the spikes; commit `527a92a`) | none |
| S3 | Partition and account of a role ARN contain no colon (NSTAR) | removes findings only for PassRole Resources whose account part holds an extra colon, such as `arn:aws:iam::1:2:role/x`; no real role ARN matches them. **Needs the user's approval (permissive).** |
| S4 | Unknown generated names: the reserved character ⊥ (4.2) | none; equivalent to the R0 rule (a wildcard in the name part counts, a literal counts only if it is the opaque name) |
| S5 | A PassRole Resource counts if it denotes any identifier of the role (4.2) | **adds** the F1 findings (section 3) |
| S6 | Launch resource: any string | none; the evaluator ignores it today |
| S7 | Deny ignored, conditions rejected by the extractor | none |

## 5. The implementation and the theorems

### 5.1 Lean modules (bundled in `packages/cdk-plugin/lean`)

| Module | Content |
| --- | --- |
| `ProofGate/Glob.lean` | `Tok` (with `nstar`), `Matches`, `globMatch`, `intersect`, `globMatch_iff`, `intersect_iff`, `nonempty` (every pattern matches some string) |
| `ProofGate/Tables.lean` | generated: `launchGroups` (the launch table grouped by service prefix, 176 groups), `objectActions`, `bucketGrantActions` |
| `ProofGate/Spec.lean` | the definitions of 4.2 |
| `ProofGate/Eval.lean` | `findings : Model → List (String × String × String)` (principal, target, bucket) |
| `ProofGate/Theorems.lean` | the theorems of 5.3 |
| `ProofGate/Legacy.lean` | the old checks and the counterexample theorems (5.4) |
| `ProofGate/Model.lean`, `Security.lean` | kept for `ImplicitPath` and `PolicyWritePath` (scope B is dropped, section 9) |

### 5.2 Tables as Lean data

`scripts/sync-service-reference.mjs` writes `ProofGate/Tables.lean` next to `aws-tables.generated.ts` from the same snapshot. A test parses both and checks that they hold the same entries. The launch supplements come in through the same script.

### 5.3 Theorems (for all inputs)

1. `globMatch_iff`, `intersect_iff`: done in the spikes; they move into `Glob.lean`.
2. Bridge lemmas:
   - `allowed_any_iff`: `(∃ r, Allowed st a r) ↔ ∃ s ∈ st, allow ∧ ∃ ap ∈ s.actions, globMatch ap a ∧ s.resources ≠ []`, using `nonempty`.
   - `reaches_iff`: `Reaches t bp ↔ reachesB t bp = true`, where `reachesB` intersects each resource pattern with `bp ++ [lit '/', star]` or with `bp`. This needs a lemma on `Matches` of a concatenation.
   - `roleIdent_iff`: `(∃ x, RoleIdent t x ∧ Matches rp x) ↔ roleIdentB t rp = true`. `roleIdentB` intersects `rp` with the role-ARN shape `arn:<nstar>:iam::<nstar>:role/<name pattern>`, where the name pattern is the literal name, the opaque name, or `*⊥*`. It also intersects `rp` with the bare name and the logical ID.
   - `launch_index_iff`: the lookup by service prefix computes the same services as the flat table, for every action pattern.
3. Main theorem: `findings_iff : (p, t, b) ∈ findings m ↔ ∃ P T bp, ids match ∧ EscalatesTo m P T bp`.
4. `findings_mono`: adding a statement to a role or adding a role never removes a finding.
5. `findings_exempt`: adding a logical ID to `allowedPassRoleTargets` removes exactly the findings whose target is that role.
6. `safe_iff`: `findings m = [] ↔ ∀ P ∈ m.roles, ∀ T, ∀ bp ∈ m.buckets, ¬ EscalatesTo m P T bp`.

### 5.4 Counterexample theorems (the proof has teeth)

- `legacy_s3_unsound` (pre-1.0, D1): the old S3 check matched the Resource pattern against the literal string `<bucket>/*`. There is a model in which it reports no access while `Reaches` holds (`SpecSpike.oldCheckMissesPrefixGrant` is the core of it).
- `legacy_passrole_unsound` (1.2.0, F1): the 1.2.0 PassRole check, written in Lean as it is in TypeScript (substring `:role/`). There is a model in which it says no while `∃ x, RoleIdent t x ∧ Allowed …` holds.

Both are stated against `EscalatesTo`. The claim for the submission is "this theorem does not hold for our earlier implementations"; for F1 that includes the published 1.2.0.

### 5.5 The per-stack certificate

The generated module holds the model and one theorem, depending on the TypeScript verdict:

- TypeScript says safe: `theorem generatedStackIsSafe : ∀ P ∈ model.roles, ∀ T, ∀ bp ∈ model.buckets, ¬ EscalatesTo model P T bp := (safe_iff model).mp (by decide +kernel)`.
- TypeScript says unsafe with list L: `theorem generatedFindings : findings model = L := by decide +kernel`, plus `theorem generatedStackIsUnsafe : EscalatesTo model P₁ T₁ bp₁` derived through `findings_iff` for the first entry.

The theorem is a readable statement about the rule, not `safe generatedPaths = true`. If TypeScript and Lean disagree, the theorem fails to check, Lean exits with an error, and the plugin reports `PG-IAM-003` with both lists (L4.2). The markers `PROOFGATE_SAFE` and `PROOFGATE_UNSAFE` stay. The plugin requires both the marker and a successful check.

## 6. Speed

Measured on the author's machine (Apple silicon), with the 879-entry table as Lean data:

| Form | Check | Time |
| --- | --- | --- |
| flat table, kernel `decide +kernel`, 3 checks (4 or 8 patterns) | which services a principal can launch | **754 s** (unusable) |
| table grouped by service prefix, kernel, 2 checks (demo patterns) | same | about 5 s for the whole file |

Design:
- The lookup goes through `launchGroups`. An action pattern whose service prefix (the part before `:`) is a literal looks only at its group.
- The pattern `*` (all actions) uses the precomputed list of all services, with a lemma that this list equals the flat result.
- A pattern with a wildcard inside the service prefix (for example `lambda*:create*`) needs the flat scan. For a template with such a pattern, the generated theorem uses `native_decide` (L3.2), and the report says so.
- The model-level generated tests (thousands of cases) evaluate `findings` with `#eval` in one batch, which is compiled and fast. They are a test of agreement, not part of the trust base. The per-stack certificate in the product uses the kernel.
- To measure during implementation: the largest template of `examples/real-stacks`, and every stack of the trial app.

## 7. Validating the specification itself

Proofs show that `findings` decides `EscalatesTo`. They do not show that `EscalatesTo` is the right rule. A separate layer tests the specification without the algorithm:

| Check | How | What it shows |
| --- | --- | --- |
| Known unsafe | witness theorems with concrete strings: RS-03 (prefix grant), F1 (three Resources), the demo stack, RS-70's account-`*` pattern under S3 | the rule calls known unsafe layouts unsafe |
| Known safe | `¬ EscalatesTo` through `safe_iff` and kernel evaluation: the fixed demo stack, RS-59 (scoped to another resource), a role that reads another bucket | the rule does not call safe layouts unsafe |
| The real IAM engine | the 58 observations (`tests/pbt/aws-observations*.json`) as Lean theorems on `Matches` and `Allowed`, generated from the JSON by a script; a test checks that the two agree | the meaning of patterns matches what AWS decided; the four case-sensitivity rows (`P07`, `R05`, `R06`, `R17`) are stated as the known deviations of S1 |
| PassRole observations | P01 to P14 checked against `RoleIdent` and `Allowed`, not against the generic matcher | closes the gap that hid F1 |

## 8. Changes outside Lean

1. **Oracle first, alone (F1):** `passRoleResourceMatches` reads a Resource as "intersects some identifier of the role", with NSTAR, in its own code. Red first: regression rows from P10, P11, and P14; the generated tests show the new disagreement with the evaluator.
2. **Evaluator (F1):** `allowsPassRoleTarget` uses the existing `denotesArn` with `ROLE_SHAPE` (already used by `PG-IAM-005`), plus the bare-name and logical-ID rule. Differential against 1.2.0: list every added finding (F1) and every removed one (S3).
3. **Generator:** `generateLean` writes the model (section 5.5) for scope A, and the Boolean lists for the other two shapes as today.
4. **Plugin:** compares the TypeScript list with Lean's result; a failed check is `PG-IAM-003` with both lists.
5. **Generated tests:** three-way agreement (oracle, TypeScript, Lean `#eval`); mutants of L5.2 against the Lean evaluator.
6. **Docs:** `docs/PROOFS.md` rewritten with the trust table and the theorems; F1 in `CHANGELOG.md` as a fix; `security.md` gets S3 to S5.

## 9. Changes to the requirements (proposed revision 2)

- L4.1 "no verdict changes" becomes: verdicts change only by F1 (added findings) and, if approved, S3 (removed findings for Resources that no real role ARN matches). Every changed case is listed from the differential.
- L2.3: the rule is stated over request strings (section 4.2), and `findings_iff` connects it to the computation.
- L3.1: the per-stack theorem is the readable statement of 5.5.
- New L11: the specification layer of section 7.
- New L12: the counterexample theorems of 5.4.
- L10 (scope B) is dropped. The time goes to L11 and L12. `ImplicitPath` and `PolicyWritePath` keep the Boolean lists, and `PROOFS.md` says so.

## 10. Schedule and stop conditions

| Date (JST) | Work | Stop condition |
| --- | --- | --- |
| 11-27 (done) | spec over strings, 3 witnesses, the pre-1.0 counterexample, NSTAR intersection, F1 found, speed measured | — |
| 11-28 | `Glob.lean`, `Spec.lean`, `Tables.lean` and their equality test; bridge lemmas; `findings_iff` | `findings_iff` not proved by 11-29 18:00 → ship the matching, intersection, witness, and counterexample theorems, and keep the per-stack check as a Boolean comparison; say so in PROOFS.md |
| 11-29 | F1: oracle, then evaluator (red first); generator and plugin; per-stack certificate; differential | the demo certificate over 10 s with the kernel → `native_decide` for the certificate, documented |
| 11-30 | three-way generated tests, mutants, the observation layer, speed on real stacks, docs | the generated suite over the CI limit → reduce the Lean-checked case count, documented |
| 12-01 | release 1.3.0 (the user publishes) | scope A not passing → 1.2.0 plus the F1 fix as 1.2.1, without the Lean change |

## 11. Points for the user's decision

1. **S3** (permissive): drop findings for PassRole Resources whose account part holds a colon (no real role ARN can match them). The alternative keeps them with an extra rule in Lean that only exists to match 1.2.0.
2. **F1** goes into 1.3.0 as a fix that adds findings. It also affects `PG-IAM-004` users of 1.2.0, so it belongs in the CHANGELOG as a fix with a note.
3. **Scope B** is dropped in favor of L11 and L12.
4. The `native_decide` fallback for templates with a wildcard in an action's service prefix.
