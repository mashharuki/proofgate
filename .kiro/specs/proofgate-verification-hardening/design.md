# Design: proofgate-verification-hardening

Status: APPROVED (revision 2). `tasks.md` is written and awaiting approval. No application or test code has been changed.

Requirements: [requirements.md](./requirements.md) (revision 2, approved).

## 1. Summary

Add two generated-test layers under `tests/pbt/`, outside every published package:

- **Model-level PBT.** Generate `StackModel` + `ProofGateConfig` Cases whose AWS-semantics verdict is known by construction. Compare an independent oracle, the TypeScript `evaluate`, and Lean. Lean runs in one batched process.
- **Extractor-level PBT.** Generate CloudFormation fragments with a known expected model or a known unsupported path. Compare with `extractStack`. No Lean.

The design needs no new dependency (section 7). Three production corrections are part of this spec because the oracle and the probes showed them (section 13): `?` wildcard matching, intersection-based S3 access, and rejection of IAM policy variables.

### Revision 2 in one paragraph

Cases now have four categories: `unsafe`, `safe`, `boundary`, and `conservative`. The O1 label is always the verdict under AWS semantics. Unsafe Cases use only AWS-valid forms. Features that ProofGate deliberately over-approximates (`PASSROLE_ALIAS`, `TRUST_STAR`, `ARN_CASE`, `ARN_STAR_SPAN`) appear only in separate `conservative` Cases, whose O1 and O2 are both `safe`. O1 equals O2 for every Case. A tagged Case may show `TS=unsafe` only when the unsafe finding is explained by the tagged statement.

## 2. Evidence gathered for this design

All probes were run read-only. Probe scripts were written under `/tmp` and deleted.

### 2.1 Lean batch timing (measured on this machine)

One `lake env lean` process on a generated module with N Cases of 16 candidate paths each. Each Case has a `def`, a `#eval` verdict line, and a `theorem ... := by native_decide`.

| Cases | Theorems          | Wall time | Result                      |
| ----- | ----------------- | --------- | --------------------------- |
| 200   | yes               | 2.3 s     | all compiled                |
| 1,000 | yes               | 10.6 s    | all compiled                |
| 2,000 | yes               | 21.3 s    | all compiled, 6.3 MB source |
| 2,000 | no (`#eval` only) | 21.2 s    | all verdict lines present   |

- Cost is about 10 ms per Case and linear. The `theorem` adds almost nothing.
- When theorems are wrong, Lean reports errors with line numbers, so each error maps to one Case. In a deliberately wrong run, Lean stopped reporting after about 100 errors. A truncated error list is therefore treated as a failure (section 4.5).
- These numbers are from one local machine. CI is unmeasured (section 9.2).

### 2.2 AWS documentation read for the oracle (Requirement 13)

Tool used: AWS Documentation MCP (`aws-mcp`: `search_documentation`, `read_documentation`). Pages read are listed in section 8.1.

### 2.3 Behavior of the current evaluator (probe results)

| Probe                                               | Result        | Meaning                                                                                            |
| --------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------- |
| Action `iam:PassRol?`                               | judged safe   | **Under-match.** AWS treats `?` as a wildcard; `matches` treats it as a literal. Not conservative. |
| Resource `role/data-rol?`                           | judged safe   | Same cause.                                                                                        |
| S3 resource `bucket/?`                              | judged safe   | Same cause.                                                                                        |
| Resource ARN with different case (`role/DATA-ROLE`) | judged unsafe | Over-match. Conservative (D2).                                                                     |
| Action with different case (`IAM:passrole`)         | judged unsafe | Correct.                                                                                           |
| Bucket-level ARN only with `s3:GetObject`           | judged safe   | Correct.                                                                                           |
| S3 resource `bucket/reports/*`                      | judged safe   | **Defect.** Access to part of the protected bucket is missed (D1).                                 |
| S3 resource `bucket/reports/file.csv`               | judged safe   | Same cause (D1).                                                                                   |
| S3 resource `bucket/${aws:username}/*`              | judged safe   | **Defect.** Policy variable treated as a literal (D5).                                             |
| Trust principal `*`                                 | judged unsafe | Over-match. Conservative (D4).                                                                     |

## 3. Architecture

```
tests/
  proofgate.test.ts                 (existing, unchanged)
  pbt/
    support/
      prng.ts                       seeded PRNG
      config.ts                     seed, counts, profile from env
      glob.ts                       independent token matcher and intersection (oracle only)
      oracle.ts                     O2: independent semantic oracle
      model-gen.ts                  Case generator with categories, recipes (O1), tags
      compare.ts                    comparison rules and Counterexample type
      lean-batch.ts                 batch module builder, result classifier
      shrink.ts                     valid, verdict-preserving reducer
      template-gen.ts               extractor-layer generator and expectations
      coverage.ts                   category, form, and tag counters
      report.ts                     failure report formatting
    model-agreement.test.ts         Model-level PBT (oracle, TS, Lean)
    model-properties.test.ts        metamorphic and generator self-consistency
    extractor.test.ts               Extractor-level PBT
    failclosed.test.ts              empty config, malformed template
    selfcheck.test.ts               mutants prove the harness detects faults
    regressions.test.ts             replays tests/pbt/regressions/*.json
    regressions/                    fixed and reduced Cases (JSON)
```

- Files under `tests/pbt/support/` have no `*.test.ts` suffix, so Vitest does not run them as tests. Knip reaches them through imports.
- Production imports are limited to `evaluate` and `generateLean` from `@proofgate/core`, `extractStack` from `@proofgate/extractor`, `ProofGateValidator` from `@proofgate/cdk-plugin`, and types from `@proofgate/model`. `glob.ts` and `oracle.ts` import only types.
- `packages/*/src` changes only through section 13.
- `pnpm test` already runs `pnpm build && vitest run`. The new files run in the existing CI step. Lean is built earlier in the CI job.

### 3.1 Data flow (Model-level)

```
seed -> PRNG -> model-gen -> Case { model, config, category, label(O1), tags, witness }
                                  |
          +-----------------------+-------------------------+
          v                       v                         v
   oracle O2 (independent)   evaluate (TS)        generateLean -> batch module
          |                       |                         |  one `lake env lean`
          +----------- compare.ts <---- per-Case Lean verdict
                              |
              mismatch? -> shrink.ts -> confirm -> report.ts -> test failure
```

## 4. Components

### 4.1 PRNG and configuration

- PRNG: `mulberry32` seeded from the configured seed. Case `i` uses a sub-seed derived from `(seed, i)`, so one Case can be regenerated alone.
- `config.ts` reads:

| Variable                        | Default                          | Meaning                                                     |
| ------------------------------- | -------------------------------- | ----------------------------------------------------------- |
| `PROOFGATE_PBT_SEED`            | fixed constant in the repository | Base seed                                                   |
| `PROOFGATE_PBT_CASES`           | 2000                             | Model-level Cases (oracle + TS)                             |
| `PROOFGATE_PBT_LEAN_CASES`      | 2000 (see 9.2)                   | Cases also sent to Lean; boundary Cases are always included |
| `PROOFGATE_PBT_EXTRACTOR_CASES` | 1000                             | Extractor-level Cases                                       |
| `PROOFGATE_PBT_ONLY`            | unset                            | Run a single case index (replay)                            |

- Invalid values fail the run with a clear message. They are not replaced by defaults.
- Every run prints seed, counts per category and tag, and the Lean batch size (Requirement 8.5).

### 4.2 Case model and generator (Requirement 1)

```ts
type Category = "unsafe" | "safe" | "boundary" | "conservative";
type Tag = "PASSROLE_ALIAS" | "TRUST_STAR" | "ARN_CASE" | "ARN_STAR_SPAN";

interface Case {
  id: number;
  model: StackModel;
  config: ProofGateConfig;
  category: Category;
  label: "unsafe" | "safe"; // O1: the verdict under AWS semantics
  tags: readonly Tag[]; // over-approximation features used
  witness: readonly string[]; // sourcePaths of the statements that carry the tagged forms
}
```

Representation decision (review item 8): a conservative Case is expressed by **both** `category: "conservative"` and `label: "safe"` with non-empty `tags`. The category exists so that sampling, coverage counters, and comparison rules key off one field. Invariants checked on every Case by `model-properties.test.ts`:

| Invariant | Statement                                                                                                           |
| --------- | ------------------------------------------------------------------------------------------------------------------- |
| I1        | `label` is the verdict under AWS semantics (section 8). It never means "what ProofGate is expected to say".         |
| I2        | `tags` is non-empty if and only if `category` is `conservative`.                                                    |
| I3        | `category` `conservative` implies `label` `safe`.                                                                   |
| I4        | Cases of category `unsafe`, `safe`, and `boundary` use only AWS-valid forms (section 4.2.1). They never carry tags. |
| I5        | O1 equals O2 for **every** Case, including `conservative` Cases (both `safe`).                                      |

#### 4.2.1 AWS-valid forms (used by `unsafe`, `safe`, `boundary`)

Build the four conditions from forms that the oracle treats as valid under AWS semantics:

- **PassRole.** Action `iam:PassRole`, `iam:Pass*`, `iam:PassRol?`, `iam:*`, or `*`, in any letter case. Resource `*`, or an ARN `arn:<partition>:iam::<account>:role/<name pattern>` where partition and account are literals or globs and the name pattern is the role name, `prefix*`, or a `?`-containing glob. Letter case of the role name matches exactly.
- **Lambda control.** `lambda:CreateFunction`, or `lambda:UpdateFunctionConfiguration` plus `lambda:UpdateFunctionCode` in the same or in two different Statements, or `lambda:*`, `lambda:*Function*`.
- **Trust.** The role trusts `lambda.amazonaws.com` (possibly together with other services).
- **Access (D1).** Allow of an S3 object action (`s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, `s3:*`, `s3:Get*`) on a Resource whose set of ARNs intersects the protected-bucket object set (section 4.3.2). Forms: `bucket/*`, `bucket/reports/*`, `bucket/file.csv`, `bucket*`, bucket wildcards such as `arn:aws:s3:::protected-*/*`, `arn:aws:s3:::*`, and a `?` object key.

Logical-ID and bare role-name PassRole resources, trust `*`, role names or bucket segments in the wrong letter case, and star expansion across a colon boundary are **never** used here.

#### 4.2.2 Construction

1. **Unsafe Case.** Choose principal `P` and target `T`. Establish all four conditions through randomly chosen AWS-valid forms. `label` is `unsafe`.
2. **Noise.** Add 0 to 3 extra roles and Statements from an inert vocabulary (`logs:PutLogEvents`, `dynamodb:GetItem`, other buckets) and from _partial_ roles that satisfy at most three of the four conditions with respect to every other role.
3. **Safe Case.** Copy an unsafe Case and break exactly one condition using an AWS-valid way: retarget PassRole to a different role name; remove Lambda control or leave only one of the two update actions; give the target a non-Lambda trust; retarget access to another bucket or to a bucket wildcard that does not intersect (`arn:aws:s3:::other-*/*`); use only the bucket-level ARN; or list the target in `allowedPassRoleTargets`. `label` is `safe`.
4. **Conservative Case** (separate stream, section 4.2.3).
5. **Boundary Cases** (fixed list, always generated, always Lean-checked): single role; principal equal to target; target with no access; conditions split across Statements; zero candidate paths; several protected buckets; bucket ARN with a trailing slash; maximum role count; a Case for each D1 regression (section 6.2). Boundary Cases carry an explicit AWS-valid `label` and no tags.

Bounds: roles at most 4, Statements per role at most 6, protected buckets at most 2. Candidate paths per Case at most 32.

Stratified allocation (so that coverage does not depend on luck): out of the default 2,000 Cases, about 35% are `unsafe`, 35% are `safe`, 15% are `conservative` (distributed evenly over the four tags, with some combining two tags), and the remainder come from the fixed boundary list plus extra boundary variants.

#### 4.2.3 Conservative Cases

A conservative Case starts from an AWS-valid unsafe Case. It then **replaces the evidence for exactly one condition** (or two conditions, for two-tag Cases) with the tagged over-approximation form and removes the AWS-valid evidence for that condition. Under AWS semantics the condition no longer holds, so `label` is `safe`. ProofGate may still see the condition through its deliberate over-approximation.

| Tag              | Replaced evidence                                                                                                                 | AWS verdict for that condition                  |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `PASSROLE_ALIAS` | PassRole Resource is the target's Logical ID or bare role name                                                                    | does not match (not an ARN)                     |
| `TRUST_STAR`     | the target's only trust is the principal `*`                                                                                      | not Lambda trust                                |
| `ARN_CASE`       | PassRole role-name part, or the bucket segment of the S3 Resource, differs only in letter case                                    | does not match (Resource is case-sensitive, D2) |
| `ARN_STAR_SPAN`  | S3 Resource where a `*` that is not last in its segment would have to cross a colon, for example `arn:aws:s3:*protected-bucket/*` | does not match (D3)                             |

`witness` has two lists. `paths` holds the `sourcePath` of every Statement that carries a tagged form. `roles` holds the Logical ID of a role whose trust is the principal `*` (`TRUST_STAR`), because the trust policy path does not appear in a violation's `sourcePaths`.

### 4.3 Oracle (Requirements 2, 13, 14)

Two parts, both independent of production code:

- **O1, construction label.** The generator knows which condition it established, broke, or replaced. `label` is the verdict under AWS semantics from that construction. It needs no matching logic.
- **O2, independent semantic oracle.** `oracle.ts` takes any Valid StackModel and returns `"unsafe"` or `"safe"` by applying the AWS rules of section 8 with its own matcher (`glob.ts`). It works on shrunk models, so shrinking always has a verdict (Requirement 5.8).

Cross-checks:

- **O1 equals O2 for every generated Case** (invariant I5), `conservative` Cases included. A difference means the generator or O2 is wrong. It is reported as a **harness error**, separate from a product Counterexample, and fails before any TS or Lean comparison for that Case.
- A test checks that `oracle.ts` and `glob.ts` import nothing from `@proofgate/core`.

Interpretation (D8, approved): Requirement 2.1 says the verdict derives from the construction. O1 is that verdict. Shrinking removes the construction's premises, so O2 is used after reduction. O1 and O2 agree before reduction by I5.

Documented limits, also at the top of `oracle.ts` (Requirement 2.5): no Explicit Deny, SCP, permissions boundary, session policy, resource policy, Condition, policy variables (the extractor rejects them, D5), cross-account semantics, or S3 actions beyond the supported set (section 18). `evaluate` ignores Deny statements, which only increases findings.

#### 4.3.1 Matching language of O2

`glob.ts` compiles a pattern to tokens:

- literal character `c`
- `?` becomes `OneNoColon` when used in an ARN, otherwise `OneAny` (Action patterns contain at most one colon, so `?` is `OneAny`)
- `*` becomes `StarAny` if it is the last character of its colon-separated segment (next pattern character is `:` or end of pattern), otherwise `StarNoColon`

Documented basis: a trailing `*` of an ARN segment can expand beyond colon boundaries, any other `*` stays inside its segment (section 8.2). Matching is case-sensitive for Resources and case-insensitive for Action names.

`matches(pattern, value)` is a memoized recursive match over the tokens.

#### 4.3.2 Intersection for D1

The S3 access condition is: **the set of ARNs the policy Resource denotes intersects the set of object ARNs in the protected bucket.**

- Policy set `L(p)`: the strings matched by pattern `p`.
- Protected set `S(b)`: all strings `bucket/` followed by any key, where `bucket` is the protected bucket ARN with a trailing `/` removed. As a pattern, `S(b)` is the literal `bucket/` followed by `*`.
- Access holds if and only if `L(p) ∩ S(b) ≠ ∅`.

`glob.ts` decides non-emptiness of the intersection of two token sequences by a memoized search over positions `(i, j)`:

1. If both sequences are exhausted, the intersection is non-empty.
2. A star token in either sequence may be skipped (consume zero characters).
3. Otherwise one character is consumed jointly. Two tokens are compatible if their character classes share at least one character: literal with equal literal; literal with `OneAny` or `StarAny`; literal (not `:`) with `OneNoColon` or `StarNoColon`; any two wildcard classes (they share a non-colon character). A star token stays at its position after consuming a character; a non-star token advances.

This is the intersection of the two languages, not a one-directional match of `p` against a representative string. It is implemented independently of the production code (section 13.2). The oracle's tokens use AWS colon rules and case-sensitive literals. The production version uses wider star and case-insensitive literals, so the two disagree exactly on the tagged features.

`oracle.ts` also applies this rule to the object action: an access Statement needs an Allow action matching one of `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, or an `s3:*` form (section 18 records the known action gap).

#### 4.3.3 PassRole in O2

Resources are matched against the target's `role/<roleName>` part. The oracle does not constrain partition and account, because the account of a synthesized template is not known (consistent with `docs/ASSUMPTIONS.md`: cross-account is not modeled). Resource `*`, or an ARN whose first five colon segments have the shape `arn:<glob>:iam::<glob>` and whose remainder starts with `role/`, is accepted; the name pattern is matched case-sensitively against the target's role name. Other resource shapes are never generated.

### 4.4 Comparison rules (Requirements 2.3, 13.4)

Rules per category. "Allowed TS verdicts" is what the harness accepts. Lean is compared with TS in every row.

| Category       | O1     | O2           | Allowed TS verdict                                     | Lean      |
| -------------- | ------ | ------------ | ------------------------------------------------------ | --------- |
| `unsafe`       | unsafe | unsafe       | unsafe only. TS safe is a **soundness failure**        | equals TS |
| `safe`         | safe   | safe         | safe only. TS unsafe is an **unexplained false alarm** | equals TS |
| `boundary`     | label  | equals label | equals label                                           | equals TS |
| `conservative` | safe   | safe         | safe, or unsafe **if explained**                       | equals TS |

**Explained** means: `tags` is non-empty, and the TS violation's `sourcePaths` contain at least one path from `witness.paths`, or the violation's target role is one of `witness.roles`. A violation that does not touch a witness path means ProofGate found a path that no tagged feature accounts for, which is a failure. TS safe on a conservative Case is accepted (AWS-correct).

Conservative Cases with `TS=unsafe` and `Lean=unsafe` are the only place in which unsafe is accepted for an AWS-safe label. Lean unsafe with TS safe, or the reverse, is always a failure.

**Tag vitality.** Because TS safe is accepted on conservative Cases, a tag could silently stop mattering. A separate check requires that for **each tag**, the default run observes at least one Case where TS is unsafe and explained. If a documented over-approximation (D2 to D4) is removed on purpose, this check fails and the decision must be recorded.

### 4.5 Lean batch runner (Requirements 3, 4)

`lean-batch.ts` builds one module from many Cases.

**Building.**

1. For each Case, call the real `generateLean(model, config)`.
2. Extract the paths list from the output with a strict structural check. The output must match exactly one `import ProofGate.Security` line, exactly one `def generatedPaths : List ProofGate.EscalationPath := [...]`, exactly one `#eval` marker line, and exactly one `theorem generatedStackIsSafe ... := by native_decide`. **If any of these differs, the harness stops with a harness error that names the Case and the unexpected shape.** It never falls back to guessing or to a looser pattern. `selfcheck.test.ts` includes a mutant `generateLean` with a changed shape that must produce this harness error.
3. Emit per Case `i`:

```lean
def case_i : List ProofGate.EscalationPath := [ ...the list from generateLean... ]
#eval s!"PGCASE i {if ProofGate.safe case_i then "SAFE" else "UNSAFE"}"
theorem thm_i : ProofGate.safe case_i = <TS verdict> := by native_decide
```

4. Run `lake env lean <file>` in `packages/cdk-plugin/lean` with the same spawn style and cwd as `ProofGateValidator`. The file lives in a temp directory removed in `finally`.

**Classifying the result.** All Lean diagnostics are parsed (`<file>:<line>:<col>: error:` lines). Every error is mapped to a Case by line number using the recorded line ranges.

| Observation                                                                                                                                      | Result                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| Exit code 0, no error diagnostics, one marker per Case                                                                                           | Success. Per-Case Lean verdicts are the marker values.                                                                    |
| An error whose line falls inside Case `i`                                                                                                        | Lean disagrees with TS (or Lean rejected the theorem) for Case `i`. Reported as a Counterexample candidate for that Case. |
| **Any** error that cannot be mapped to a Case (import error, header, unknown line, output without a position), even when all markers are present | **Infrastructure failure.** The run fails. It is never treated as success, even if every marker is present.               |
| Missing marker for any Case, spawn failure, timeout, non-zero exit with no parsable error                                                        | Infrastructure failure.                                                                                                   |
| Error list truncated (Lean stops after about 100 errors)                                                                                         | The run fails. Only the mapped Cases are reported. The rest are _not_ assumed to pass.                                    |
| Lake project not built (`.lake` missing)                                                                                                         | Infrastructure failure. The runner never runs `lake build` itself.                                                        |

Nothing in this table is counted as safe, unsafe, or skipped (Requirement 3.3). Success requires zero errors of any kind, not only complete markers. Warnings are printed but do not by themselves fail the run.

**Launch budget (Requirement 4).**

| Run                                                 | Launches                                                                                           |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Default profile                                     | 1 (a second only if the Lean-checked set exceeds 4,000 Cases, then two equal halves)               |
| Self-check (excluded from the cap, Requirement 4.2) | 2: one batch of 200 Cases with the Lean-fact mutant, one tiny module for the unmapped-error check  |
| Failure path: shrinking                             | up to 8 rounds (one launch per round) plus 1 final confirmation, only when a Counterexample exists |
| Deep profile (manual)                               | `ceil(Cases / 4000)`, stated in the run output                                                     |

Launch count does not change with the number of Cases in the default profile. Counts are printed in each run.

### 4.6 Shrinker (Requirement 5)

`shrink.ts` reduces a failing Case by candidate operations, applied greedily in rounds:

1. drop a role
2. drop a Statement
3. drop an element from `actions` or `resources`
4. replace a wildcard with a literal prefix
5. drop a protected bucket, or clear `allowedPassRoleTargets`

Rules:

- A candidate is considered only if it is a **Valid StackModel** (at least one role, one Statement, one non-empty bucket ARN). Invalid candidates are discarded, not repaired.
- A candidate is accepted only if the **same verdict pair** still differs (for example `{ O2: "unsafe", TS: "safe" }`), computed with O2, not with the recipe label.
- Shrunk Cases drop their `category`, `label`, and `witness`. After reduction, O2 supplies the AWS verdict. For tagged Cases, the explanation check uses the TS violation `sourcePaths` against the original `witness` paths that survive in the reduced model. If the witness statements are gone, the reduction step is rejected (it would change the failure).
- Pure mismatches (O2 vs TS) are evaluated per candidate in memory. Lean-involved mismatches evaluate all candidates of a round in one batch launch, at most 8 rounds.
- After the loop, **one final confirmation** reruns O2, `evaluate`, and one Lean launch on the reduced Case. Only a confirmed Case is reported. If confirmation fails, the last confirmed Case is reported with a note.
- The reduced Case is printed as JSON, with seed, case index, and original and reduced sizes.

The extractor layer shrinks fragments by removing resources, statements, and array elements. A fragment is valid if it is a JSON object with a `Resources` object whose entries have a string `Type`. It compares `extractStack` against the recipe and never calls Lean.

### 4.7 Extractor layer (Requirement 12)

`template-gen.ts` builds a template from a recipe:

```ts
interface TemplateRecipe {
  roles: { logicalId; roleName?; trust: string[]; inline: StatementRecipe[] }[];
  attachedPolicies: { logicalId; roles: string[]; statements: StatementRecipe[] }[];
}
```

- **Supported fragments.** Render with random shapes: `Action` and `Resource` as string or array, `Policies` inline or `AWS::IAM::Policy` with `Roles: [{ Ref }]`, several roles and Statements, Allow and Deny. The expected `StackModel` comes from an independent function (`expectedModel`). Canonical ordering is applied before comparing: the extractor lower-cases, de-duplicates, and sorts trust services, and the expectation does the same, taken from `docs/SUPPORTED_IAM.md` and the existing extractor tests, not from the extractor code.
- **Unsupported fragments.** Apply exactly one _poison_ at a known JSON path. Poisons:
  - Statement: `Condition`, `NotAction`, `NotResource`
  - Trust policy: `NotPrincipal`, `Condition`, non-literal value
  - non-literal `Action`, `Resource`, `RoleName`
  - non-default `Path`
  - `AWS::IAM::ManagedPolicy`, `ManagedPolicyArns`, another `AWS::IAM::*` type
  - malformed `PolicyDocument`, missing `Resources`
  - **`POLICY_VARIABLE` (D5):** a Resource string, or an element of a Resource array, containing an IAM policy variable such as `${aws:username}`, `${aws:PrincipalTag/x}`, or `${*}`
  - **`INTRINSIC_WITH_VARIABLE` (D5):** a Resource that is a CloudFormation intrinsic (for example `Fn::Join`) whose text contains a policy variable
- **Assertions.** The result has no `model`. It has at least one finding whose `sourcePath` equals or begins with the poisoned path. For mixed fragments (valid parts plus one poison), the model is still absent: partial models are never returned.
- **D5 assertions.**
  - `POLICY_VARIABLE`: exactly one finding for that Resource, with `sourcePath` ending in `.Resource` (string) or `.Resource[k]` (array element), and no model.
  - `INTRINSIC_WITH_VARIABLE`: only the existing non-literal finding (at the Statement path) is reported, with no additional variable finding. This keeps the existing behavior.
- **Empty cases.** No roles, or roles with no supported Statements: rejected.

Where the extractor's actual `sourcePath` for a poison differs in granularity from the recipe's path (for example the Statement path instead of the key path), the expectation is "begins with the Statement path". This is decided per poison during implementation and written next to the poison definition.

## 5. Properties checked at the model level

### 5.1 Metamorphic (Requirement 2.4)

`model-properties.test.ts` runs, using TS and O2:

- adding an inert Statement or inert role does not change the verdict
- permuting roles and Statements does not change the verdict
- adding an `Allow` Statement never turns an unsafe Case into a safe one

### 5.2 Coverage counters (review item 7)

`coverage.ts` counts, in every default run, and the run **fails** if any counter below is zero:

| Counter                                                                                                                                                                                           | Minimum in the default run                           |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Cases per category (`unsafe`, `safe`, `boundary`, `conservative`)                                                                                                                                 | at least 1 each; by the allocation, hundreds         |
| Cases per tag (`PASSROLE_ALIAS`, `TRUST_STAR`, `ARN_CASE`, `ARN_STAR_SPAN`)                                                                                                                       | at least 1 each; by the allocation, at least 50 each |
| Cases per tag where TS is unsafe and explained (tag vitality, 4.4)                                                                                                                                | at least 1 each                                      |
| Cases per AWS-valid form (each form of 4.2.1, including `?` in Action, `?` in Resource, split Statements, trailing-slash bucket, prefix-scoped access, bucket wildcard, `allowedPassRoleTargets`) | at least 1 each                                      |
| Cases per category that are also in the Lean-checked set                                                                                                                                          | at least 1 each; every tag at least 1                |

The thresholds are checked after generation and before any comparison. The tag counters apply to the default run only; a replay with `PROOFGATE_PBT_ONLY` skips them.

## 6. Reproducibility and regressions (Requirement 5)

### 6.1 Reporting

- The default seed is a constant in `config.ts`. CI is deterministic.
- `PROOFGATE_PBT_SEED=<n> PROOFGATE_PBT_CASES=<m> pnpm vitest run tests/pbt` explores other seeds. `PROOFGATE_PBT_ONLY=<i>` replays one Case.
- A failure prints: layer; seed; case index; category, tags; mismatch kind and verdicts (for example `O2=unsafe TS=safe`); the reduced Case as paste-ready JSON; the replay command. Harness errors (O1 vs O2, `generateLean` shape, unmapped Lean error) use a separate heading so a harness bug is not read as a product bug.
- Case indexes are stable only while the generator is unchanged. The JSON is the durable form.
- **Regression corpus.** `tests/pbt/regressions/*.json` holds Cases with the AWS-semantics label, the expected TS verdict, and a short English note. `regressions.test.ts` replays each through O2, TS, and (all together, one launch) Lean. Adding a regression means saving the printed JSON as a file.

### 6.2 Fixed D1 and D5 regression cases

Protected bucket in every case: `arn:aws:s3:::protected-bucket`. Target role trusts Lambda, the principal holds PassRole and `lambda:CreateFunction`, and the target's access statement uses `s3:GetObject` with the Resource shown, unless stated.

| ID    | Target Resource                                                         | AWS label (O1/O2) | Expected TS and Lean                                                                       | Layer                   |
| ----- | ----------------------------------------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------ | ----------------------- |
| D1-1  | `arn:aws:s3:::protected-bucket/reports/*`                               | unsafe            | unsafe                                                                                     | model                   |
| D1-2  | `arn:aws:s3:::protected-bucket/reports/file.csv`                        | unsafe            | unsafe                                                                                     | model                   |
| D1-3  | `arn:aws:s3:::another-bucket/reports/*`                                 | safe              | safe                                                                                       | model                   |
| D1-4  | `arn:aws:s3:::protected-bucket` (bucket-level only) with object actions | safe              | safe                                                                                       | model                   |
| D1-5  | `arn:aws:s3:::protected-*/*` (bucket wildcard that intersects)          | unsafe            | unsafe                                                                                     | model                   |
| D1-6  | `arn:aws:s3:::other-*/*` (bucket wildcard that does not intersect)      | safe              | safe                                                                                       | model                   |
| D1-7  | `arn:aws:s3:::protected-bucket*` (trailing star reaches `/key`)         | unsafe            | unsafe                                                                                     | model                   |
| D1-8  | `arn:aws:s3:::*`                                                        | unsafe            | unsafe                                                                                     | model                   |
| D1-9  | `arn:aws:s3:::protected-bucket/${aws:username}/*`                       | not modeled       | `extractStack` returns unsupported and no model; `ProofGateValidator` reports `PG-IAM-003` | extractor and validator |
| D1-10 | `arn:aws:s3:::protected-bucket/?`                                       | unsafe            | unsafe                                                                                     | model                   |

D1-9 and the unsupported cases are in the extractor layer because the model layer cannot represent a policy variable. D1-10 pins the `?` fix.

## 7. Library choice: `fast-check` or in-repo generator (Requirement 9.4)

| Criterion                                      | `fast-check` (4.10.2, MIT, one dependency `pure-rand`)                                           | In-repo seeded generator and shrinker  |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------- |
| New dependency                                 | devDependency plus `pure-rand` in the lockfile (about 1.5 MB unpacked)                           | none                                   |
| Lockfile and review                            | lockfile changes, one more package to pin                                                        | none                                   |
| Knip, jscpd, Biome                             | fine for Knip; no known conflicts                                                                | fine; the new code is scanned by jscpd |
| Generation                                     | rich combinators                                                                                 | about 150 lines for the forms in 4.2   |
| Shrinking                                      | built in, one value at a time, tied to the property function                                     | custom, about 80 lines                 |
| Fit with Lean batching                         | **poor.** The property runs per Case, so each shrink step would launch Lean (Requirement 4)      | **good.** Rounds are batched by design |
| Fit with categories, witnesses, validity rules | shrinking mapped arbitraries can produce invalid models unless every arbitrary encodes the rules | validity is checked on every candidate |
| Seed and replay                                | `seed` and `path`                                                                                | seed and case index, JSON              |
| Maintenance                                    | external                                                                                         | ours                                   |

**Decision: in-repo, no new dependency.** The deciding point is Lean batching: Requirements 5.5 to 5.9 and the launch limit in Requirement 4 do not fit a per-value property runner. `fast-check` remains an option for the pure layers later, as a separate decision with a lockfile change.

## 8. AWS rule decisions for the oracle (Requirement 13)

### 8.1 Sources read (AWS Documentation MCP, `aws-mcp`)

| Page                                                                         | URL                                                                                           |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| IAM JSON policy elements: Action                                             | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_action.html      |
| IAM JSON policy elements: Resource                                           | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_resource.html    |
| Grant a user permissions to pass a role to an AWS service                    | https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_use_passrole.html                   |
| How to use the PassRole permission with IAM roles (AWS Security Blog)        | https://aws.amazon.com/blogs/security/how-to-use-the-passrole-permission-with-iam-roles/      |
| How Amazon S3 works with IAM                                                 | https://docs.aws.amazon.com/AmazonS3/latest/userguide/security_iam_service-with-iam.html      |
| AWS JSON policy elements: Principal                                          | https://docs.aws.amazon.com/IAM/latest/UserGuide/reference_policies_elements_principal.html   |
| IAM policy validation check reference (role trust policy wildcard principal) | https://docs.aws.amazon.com/IAM/latest/UserGuide/access-analyzer-reference-policy-checks.html |

Policy variables were not read in detail. D5 rejects them, so the oracle does not need their semantics.

### 8.2 Decision table (user decisions D1 to D8 applied)

| Item                     | What AWS documentation says (paraphrased)                                                                                                                                   | Current `evaluate`                                             | Oracle decision                                                                                                                                                                  | Production decision                          |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| Action name case         | Prefix and action name are case-insensitive.                                                                                                                                | Case-insensitive.                                              | Case-insensitive.                                                                                                                                                                | keep                                         |
| Resource ARN case        | Parts of a Resource are case-sensitive (the page notes the IAM user name is case-sensitive; S3 object keys are case-sensitive). No single rule is stated for every segment. | Case-insensitive.                                              | Case-sensitive. Differences are `conservative` Cases with tag `ARN_CASE`.                                                                                                        | **D2: keep case-insensitive**                |
| Wildcards                | `*` matches any combination of characters and `?` one character, in Action and Resource.                                                                                    | `*` only. `?` is a literal.                                    | Both supported.                                                                                                                                                                  | **fix: support `?`** (section 13.1)          |
| `*` and colon boundaries | A `*` inside an ARN segment stays within the segment, except that a trailing `*` of a segment can run across colons.                                                        | `*` always crosses colons.                                     | Documented rule (4.3.1). Differences are tag `ARN_STAR_SPAN`.                                                                                                                    | **D3: keep the wider match**                 |
| `iam:PassRole` Resource  | Resource names the roles that can be passed; wildcards and `*` allowed; same account only.                                                                                  | Also matches by Logical ID or bare role name.                  | ARN patterns and `*` only (4.3.3). Alias matching is tag `PASSROLE_ALIAS`.                                                                                                       | keep (convenience, conservative)             |
| S3 bucket vs object ARN  | Object actions need the object ARN form with a slash after the bucket name.                                                                                                 | Object ARN compared with the policy Resource in one direction. | Access means: the Resource's ARN set intersects the protected bucket's object set (4.3.2). Bucket-level ARN alone does not intersect.                                            | **D1: intersection** (section 13.2)          |
| Lambda trust principal   | A Lambda execution role must trust `lambda.amazonaws.com`.                                                                                                                  | Trusts `lambda.amazonaws.com` and `*`.                         | `lambda.amazonaws.com` only. `*` is tag `TRUST_STAR`. The docs say `Principal: "*"` is not supported in role trust policies, so counting it as Lambda-assumable is conservative. | **D4: keep**                                 |
| Policy variables         | Not read in detail.                                                                                                                                                         | Treated as literal text.                                       | Not modeled.                                                                                                                                                                     | **D5: reject as unsupported** (section 13.3) |
| `allowedPassRoleTargets` | Not an AWS feature. Defined by ProofGate.                                                                                                                                   | Targets listed by Logical ID are skipped.                      | A listed Logical ID is never a PassRole target (intent from code and README).                                                                                                    | keep                                         |

`allowedPassRoleTargets` is documented as ProofGate-defined behavior (Requirement 13.2).

### 8.3 Declared over-approximation tags

`ARN_CASE`, `ARN_STAR_SPAN`, `PASSROLE_ALIAS`, `TRUST_STAR`. They appear only in `conservative` Cases (invariants I2 and I4). Oracle comments cite the decision as `// Decision 8.2: <item>` (Requirement 13.5).

## 9. CI time and sizes (Requirement 8)

### 9.1 Budget

| Part                                       | Estimate                   | Basis                                                    |
| ------------------------------------------ | -------------------------- | -------------------------------------------------------- |
| Generation, O2, `evaluate` for 2,000 Cases | under 3 s                  | Not measured. Pure TypeScript. To be measured in task 1. |
| Lean batch, 2,000 Cases of about 16 paths  | about 21 s locally         | Measured (2.1)                                           |
| Extractor layer, 1,000 fragments           | under 3 s                  | Not measured                                             |
| Self-check, 2 launches, small              | about 5 s                  | From 2.1 scaling                                         |
| Total local                                | about 30 s                 | Within the 60 s limit                                    |
| CI                                         | about 2x local, about 60 s | Assumption, within the 3 min limit                       |

### 9.2 CI measurement and recording

The first implementation task repeats the Lean timing locally and in CI before the defaults are fixed.

- If the Lean batch for 2,000 Cases exceeds 90 s in CI, the Lean-checked count is lowered (boundary and conservative Cases always included, the rest a seeded sample). The number is written in `config.ts`.
- TS and O2 comparison stays at 2,000 Cases or more (Requirement 8.4).
- **Recording.** Any change to the Lean-checked count made because of CI measurement is recorded in `.kiro/steering/kiroween.md`: the measured local time, the measured CI time, the Case counts tried, and the final count. The same row notes that the figures are from the stated machine and CI runner.

### 9.3 Deep profile

`PROOFGATE_PBT_CASES=20000 PROOFGATE_PBT_LEAN_CASES=20000` runs a larger profile manually. It uses `ceil(N / 4000)` Lean launches and prints that number. It is not part of default CI.

### 9.4 Concurrency

Vitest runs test files in parallel. The new tests use `lake env lean`, which does not rebuild. Task 1 checks that running them next to the existing integration tests (which call `lake build`) does not conflict on `.lake`. If it does, the PBT Lean test is serialized. Each test sets an explicit timeout above the default 5 s (Lean test 120 s, others 60 s).

## 10. Error handling and Fail Closed (Requirements 3.3, 6)

- Lean unavailable, spawn error, timeout, unparsable output, missing marker, unmapped Lean error: the test fails with an infrastructure message (section 4.5). It is never reported as safe, unsafe, skipped, or passed.
- Harness errors (O1 vs O2, `generateLean` shape change, coverage counter zero) fail with a distinct heading.
- `failclosed.test.ts`: `ProofGateValidator` with empty `protectedBucketArns` returns `PG-IAM-003` (it returns before reading the template, no Lean launch). Malformed template files are rejected.
- The production changes of section 13 only add findings or rejections. None accepts more input (Requirement 6.4).

## 11. Harness self-check (Requirement 6.3)

`selfcheck.test.ts` injects deliberately wrong components through function parameters the harness already takes (`evaluate`, `generateLean`, the O2 matcher):

| Mutant                                                                     | Expected                                                   |
| -------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Evaluator that ignores PassRole by role-name wildcard                      | Soundness Counterexample                                   |
| Evaluator that returns safe when there are 3 or more roles                 | Soundness Counterexample, shrunk to a smaller model        |
| Evaluator that reports unsafe on `safe` Cases using a path with no witness | Unexplained false alarm                                    |
| Evaluator that never over-approximates `TRUST_STAR`                        | Tag vitality failure                                       |
| `generateLean` wrapper that flips `targetCanAccess`                        | TS/Lean Counterexample (one Lean launch, 200 Cases)        |
| `generateLean` wrapper that changes the output shape                       | Harness error naming the Case                              |
| Lean module with an error outside any Case's lines, all markers present    | Infrastructure failure, not success (one tiny Lean launch) |
| O2 matcher mutant (case-sensitive Action)                                  | O1 vs O2 harness error                                     |

The test fails if a mutant is _not_ detected, and asserts that a shrunk output is no larger than the original.

## 12. Package and quality boundaries (Requirements 9, 10)

- Nothing under `tests/pbt/` is in any `files` array. `scripts/check-packages.mjs` gains one assertion that every tarball entry is under `package/dist/`, `package/lean/`, or is `package.json`, `README.md`, `LICENSE`. This is a script change, not a package change.
- No `dependencies`, `peerDependencies`, or `devDependencies` change.
- `pnpm quality` must pass. Generators share small helpers (`pick`, `chance`, `repeat`) so jscpd stays quiet.
- Code comments in `tests/pbt/` are Japanese, following the existing convention. Two items are English because the requirements say so: the oracle's coverage limits (Requirement 2.5) and the `Decision 8.2` comments (Requirement 13.5). Documents under `.kiro` are English.
- Kiro is not referenced by any package or test import.

## 13. Production changes inside this spec (Requirement 7, D1, D5, D7)

D7 puts D1 and D5 in this spec. All three changes below are corrections of defects found by the oracle and probes. Each is its own task with a regression test. None accepts more input. D1 and `?` add findings (`PG-IAM-004`). D5 adds rejections (`PG-IAM-003`).

Requirement 7.7 (unsafe to safe) is not triggered. The existing demos are not affected: `safe-app` and `vulnerable-app` use no `?`, no prefix-scoped S3 grant, and no policy variable (the synthesized templates contain no `${`). `pnpm synth` and `pnpm verify:demo` are run after each change.

### 13.1 `?` wildcard in `matches` (`@proofgate/core`)

`matches` treats `?` as one arbitrary character, in Action and Resource patterns, keeping existing case rules and the wide `*`. Increases findings only.

### 13.2 S3 access by intersection (`@proofgate/core`), D1

Replace the one-directional test "policy Resource matches the string `bucket/*`" with intersection:

- The protected object set is `bucketArn` without a trailing `/`, then `/`, then any key.
- A Statement gives access when its action matches an S3 data action **and** at least one of its Resource patterns intersects that set.
- Intersection is decided by the same kind of pair search described in 4.3.2, with the production semantics: literals compared case-insensitively, `*` crossing any character, `?` one character. It is a **new function** in `core`, written independently of `tests/pbt/support/glob.ts`.
- Consequences (see 6.2): `bucket/reports/*`, `bucket/reports/file.csv`, `bucket*`, `protected-*/*`, `arn:aws:s3:::*` give access. `another-bucket/...`, `other-*/*`, and the bucket-level ARN alone do not.
- The PassRole path keeps using `matches` with the `?` fix.
- The Lean side is unchanged: it still receives `targetCanAccess`. The change is in how that fact is computed.

### 13.3 Policy variables are unsupported (`@proofgate/extractor`), D5

- A Statement `Resource` that is a literal string, or an array of literal strings, with an element containing IAM policy variable syntax (`${` followed by a closing `}`) produces an unsupported finding:
  - `sourcePath` points at that Resource: `<statement>.Resource` for a string, `<statement>.Resource[k]` for an array element
  - reason: "IAM policy variables in Resource are not supported"
  - the Statement yields no model entry, and the extractor returns no model (partial models are never returned)
- If the Resource is already unsupported because it is a CloudFormation intrinsic (the existing "must be literal strings" finding), the existing finding is kept exactly as today. No variable finding is added on top.
- Policy variables are **not** evaluated or expanded.
- This applies to Allow and Deny Statements alike. A Deny Statement with a variable is also rejected, because Deny is not evaluated and Fail Closed is the safer choice.
- **This change is Fail Closed and rejects more input.** A template that has `${aws:username}` or similar in a `Resource` and was accepted before now reports `PG-IAM-003`. Users with legitimate policy variables in unrelated resources are affected. This must be written in the Japanese docs (`docs/SUPPORTED_IAM.md`, `docs/ASSUMPTIONS.md`) as an added bullet, without removing existing text, and in the package README.

### 13.4 Other Counterexamples

Any other Counterexample becomes its own task through the same pattern: reduced JSON, minimal fix, regression. Fixes that turn an unsafe verdict into safe, and anything touching `PG-IAM-003` acceptance, follow Requirements 7.6 and 7.7: justified by the oracle and reported to you before being marked done.

### 13.5 Order of work

Because the oracle encodes AWS semantics, the generated tests fail against the unfixed code (the `?`, prefix, and variable cases). The harness and the three fixes land in the same change set, with each fix covered by a regression JSON before it is marked done. `tasks.md` will order the work so that the suite shows the failures first and then the fixes.

## 14. Correctness properties (Kiro format)

Each property is a universal statement linked to requirements.

| ID  | Property                                                                                                                                | Requirements      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| P1  | For any seed and index, generating the Case twice gives identical JSON.                                                                 | 1.1, 5.1, 5.2     |
| P2  | For every generated Case, O1 equals O2, including `conservative` Cases.                                                                 | 1.2, 1.3, 2.1     |
| P3  | Invariants I1 to I5 hold for every Case; no `unsafe`, `safe`, or `boundary` Case carries a tag.                                         | 1.2 to 1.5, 2.2   |
| P4  | For any Case, the Case rendered as a template is accepted by `extractStack` (the generator never emits unsupported constructs).         | 1.6               |
| P5  | For any `unsafe` Case, `evaluate` reports at least one violation.                                                                       | 2.3               |
| P6  | For any `safe` or `boundary` Case, `evaluate` verdict equals O2.                                                                        | 2.3, 13.4         |
| P7  | For any `conservative` Case, TS safe, or TS unsafe with a violation `sourcePaths` containing a witness path.                            | 2.3, 13.4         |
| P8  | For each tag, at least one Case has TS unsafe and explained (tag vitality).                                                             | 13.4              |
| P9  | For any Case in the Lean-checked set, the Lean verdict equals the TS verdict.                                                           | 3.1, 3.2          |
| P10 | For any `unsafe`, `safe`, or `boundary` Case in the Lean-checked set, O2, TS, and Lean agree.                                           | 3.4               |
| P11 | A Lean run is a success only if it has zero errors of any kind and one marker per Case; an unmapped error is an infrastructure failure. | 3.3               |
| P12 | The number of Lean launches in the default profile is at most 2 whatever the Case count.                                                | 4.1, 4.3          |
| P13 | A `generateLean` output of a different shape produces a harness error that names the Case.                                              | 3.3, 4.4          |
| P14 | Adding an inert Statement or role, or permuting roles and Statements, preserves the TS and O2 verdicts.                                 | 2.4               |
| P15 | Adding an Allow Statement never turns an unsafe Case safe.                                                                              | 2.4               |
| P16 | For any policy Resource set `L` and protected bucket `b`, access holds iff `L` intersects the objects of `b`.                           | 13.2 (D1)         |
| P17 | Every accepted shrink step is a Valid StackModel with the same verdict-pair mismatch.                                                   | 5.5, 5.6, 5.8     |
| P18 | A reported Counterexample reproduces when O2, `evaluate`, and Lean are rerun on it.                                                     | 5.7               |
| P19 | For any supported fragment, `extractStack` returns exactly the expected model.                                                          | 12.2, 12.3        |
| P20 | For any fragment with one poison, including `POLICY_VARIABLE`, no model is returned and a finding points at the poisoned path.          | 6.1, 12.4 to 12.6 |
| P21 | A Resource with a policy variable inside an intrinsic keeps exactly the existing finding.                                               | 7.3, 12.4         |
| P22 | For any template with no roles or no supported Statements, `extractStack` returns no model.                                             | 12.7              |
| P23 | `ProofGateValidator` with empty `protectedBucketArns` reports `PG-IAM-003`.                                                             | 6.2               |
| P24 | Every mutant in section 11 is detected.                                                                                                 | 6.3               |
| P25 | No packed tarball contains files outside the allowed set.                                                                               | 9.1, 9.2          |
| P26 | The default run has every coverage counter of 5.2 above zero.                                                                           | 8.5, 1.4          |

Correctness limits. These tests give evidence, not proof. PBT does not show the absence of bugs. Section 8 depends on the AWS documentation read. Lean receives four Booleans per candidate path and checks agreement with them (Requirement 14).

## 15. Decisions recorded (design review)

| ID  | Decision                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------------------- |
| D1  | **Yes.** Access to any part of the protected bucket is unsafe. Designed as set intersection (4.3.2, 13.2). |
| D2  | Keep case-insensitive Resource matching. Tag `ARN_CASE`.                                                   |
| D3  | Keep the wider `*` across colons. Tag `ARN_STAR_SPAN`.                                                     |
| D4  | Keep trust principal `*` as Lambda-assumable. Tag `TRUST_STAR`.                                            |
| D5  | Policy variables in Resource are unsupported and rejected with `PG-IAM-003` (13.3).                        |
| D6  | The S3 action set is not extended in this spec. Recorded as a follow-up (section 18).                      |
| D7  | D1 and D5 are fixed inside this spec.                                                                      |
| D8  | Approved on condition of the O1/O2 corrections (4.2, 4.3, 4.4).                                            |

## 16. Requirements scope note

`requirements.md` (revision 3) records that D1, D5, and the `?` wildcard fix are in scope as defect corrections under Requirements 7.5 to 7.7, as an exception to the out-of-scope item "new IAM rules or new supported syntax".

## 17. Traceability

| Requirement                   | Design section   |
| ----------------------------- | ---------------- |
| 1 Generate models             | 4.2, 5.2         |
| 2 Independent oracle          | 4.3, 4.4, 5.1, 8 |
| 3 TS and Lean agreement       | 4.4, 4.5         |
| 4 Bounded Lean launches       | 4.5, 9           |
| 5 Reproducibility, shrinking  | 4.1, 4.6, 6      |
| 6 Fail Closed covered         | 4.7, 10, 11      |
| 7 Existing behavior preserved | 3, 13            |
| 8 CI practicality             | 5.2, 9           |
| 9 Package and dependencies    | 3, 7, 12         |
| 10 Quality and conventions    | 12               |
| 11 Kiro work record           | 19               |
| 12 Extractor-level PBT        | 4.7, 13.3        |
| 13 Official AWS verification  | 8, 13            |
| 14 Honest statement           | 4.3, 14          |

## 18. Follow-up spec candidates (not in this spec)

- **S3 action coverage (D6).** The supported data actions are `s3:GetObject`, `s3:PutObject`, `s3:DeleteObject`, and `s3:*` with patterns that match them. Known gap: other data-affecting actions such as `s3:GetObjectVersion`, `s3:PutObjectAcl`, `s3:PutObjectTagging`, `s3:AbortMultipartUpload`, and `s3:RestoreObject` are not counted as access. A follow-up spec should decide the action list from the AWS Service Authorization Reference and extend both the oracle and the evaluator. Until then the oracle documents this limit (4.3).
- Full policy variable modeling (this spec only rejects them).
- `fast-check` for the pure layers, if the in-repo generator becomes a maintenance burden.

## 19. Kiro work record plan (Requirement 11)

Each Kiro session adds a row to `.kiro/steering/kiroween.md` with the Kiro app, feature, and result.

- Design sessions: Kiro IDE spec workflow. AWS Documentation MCP used for section 8. Probes found the `?`, prefix, and policy variable defects. `fast-check` was rejected with a reason. Design review found a contradiction between O1/O2 and the over-approximation tags, fixed in revision 2.
- Correctness properties (section 14) are in Kiro's property format and link to requirement IDs. Implementation tasks will state which property each covers. The log will state whether Kiro's PBT feature generated or ran any of them or whether the in-repo harness did, with the reason (Requirement 11.4).
- CI measurement results and the final Lean-checked count are recorded as described in 9.2.
- Counterexamples found, and failed or rejected approaches, are logged as they happen.
