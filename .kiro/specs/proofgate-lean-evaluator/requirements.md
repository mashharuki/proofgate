# Requirements: proofgate-lean-evaluator

Status: DRAFT (2026-11-27), waiting for the user's review. The user approved the direction on 2026-11-27 ("上記方針で進めましょう"): scope A is required and scope B follows if time allows, the code freeze moves to 2026-12-01, and the submission version becomes 1.3.0, which the user publishes. `design.md` and `tasks.md` are not written.

## Why

An external review on 2026-11-27 found that the Lean part, the main point that sets ProofGate apart, is thin. `ProofGate/Security.lean` (120 lines) defines `isEscalation` as the conjunction of four Booleans and `safe` as `List.all`. The generated theorem is closed by `native_decide`. TypeScript computes every Boolean (`packages/core/src/index.ts`, `candidatePaths`), so all of the IAM reasoning is in TypeScript. Kiro adds one more finding: the stated safeguard "TypeScript and Lean must agree" is close to empty today. Lean recomputes the conjunction of values that the TypeScript evaluator already produced, so the two can disagree only if `generateLean` serializes wrongly. The submission text (slide 6, `docs/submission/kiro-usage.md`) can be read as claiming two independent implementations.

## Goal

Lean computes the `PG-IAM-004` verdict itself, from the IAM model, with a decision procedure whose correctness is proved in Lean for every model. The TypeScript evaluator becomes a second, independent implementation. A disagreement between the two stops the synthesis, as before. ProofGate still does not claim that Lean proves AWS IAM or CloudFormation semantics. The meaning of a pattern is a model that we define and test against the real IAM engine.

## Evidence that it is feasible (spikes, 2026-11-27)

Both files are in `spike/` of this spec. They compile with Lean 4.31.0 and its core library only, with no `sorry`, `axiom`, `admit`, or `native_decide`.

- `MatchSpike.lean` (145 lines):
  - a glob matcher (`*` any run, `?` one character) proved equal to a declarative meaning `Matches` (`globMatch_iff`);
  - the monotonicity theorem "adding statements never removes a permission";
  - a PassRole path search on statement-level data, proving with the kernel (`decide`) that the demo stack is unsafe before the fix and safe after it.
- `IntersectSpike.lean` (266 lines, written by a Kiro sub-agent):
  - an intersection procedure for two patterns, proved in both directions: `intersect p q = true ↔ ∃ s, Matches p s ∧ Matches q s`;
  - kernel `decide` on real ARN patterns, including the RS-70 case.

  Measured: about 2.6 s for the whole file. `#print axioms intersect_iff` lists only `propext` and `Quot.sound`. A pair of 200-character ARNs needs `decide +kernel` (5.9 s).

## Scope

- **A (required):** `PG-IAM-004` through `iam:PassRole` and a launch action. This is the original rule, and the demo and the video show it.
- **B (if time allows):** the paths without `iam:PassRole` (`ImplicitPath`) and `PG-IAM-005` (`PolicyWritePath`). They need the ARN matching in which the partition, region, and account contain no colon (NSTAR). If B is not finished, these two shapes keep today's Boolean lists, and `docs/PROOFS.md` says so.

## Requirements

Each requirement lists its acceptance criteria and its owner. **Kiro** means that Kiro does the work in the repository. **User** means that the user decides or acts.

### L1. Lean computes the finding list from the model

1. THE Lean module that `generateLean` writes SHALL contain the model, not the result. It holds:
   - for each role: the logical ID, the role name or the opaque name, the trusted services, and the statements (effect, action patterns, resource patterns);
   - the protected bucket ARNs and `allowedPassRoleTargets`.

   It SHALL NOT contain Booleans computed by the TypeScript evaluator for scope A.
2. THE AWS tables that the rule uses SHALL be Lean data in the bundled Lean project. These are the launch actions with their services (879 entries plus the supplements), the 44 S3 object actions, and the 7 bucket-grant actions. The data SHALL be generated from the same source as `packages/core/src/aws-tables.generated.ts`, by the same script, and a test SHALL check that the two are equal.
3. A Lean function SHALL compute the list of `PG-IAM-004` findings (principal, target, bucket) from the model and the tables.
4. Any step that stays in TypeScript before the model reaches Lean SHALL be listed in `docs/PROOFS.md` as trusted, with the reason. Expected candidates: lowercasing, the regional service-principal normalization, and the opaque-name replacement.

Owner: Kiro.

### L2. Theorems that hold for every model

THE Lean core SHALL prove, for all inputs (not by `decide` on one instance):

1. **Matching:** the executable matcher decides `Matches` (`globMatch_iff`).
2. **Intersection:** the executable intersection decides "there is a common string" (`intersect_iff`).
3. **The rule:** define the rule itself as a `Prop` (`EscalatesTo`). A principal P, a different target role T, a service S, and a protected bucket B make a path when all four hold, and each part is defined with `Matches`:
   - P has an Allow statement whose action pattern matches `iam:PassRole` and whose resource denotes T;
   - P has an Allow statement whose action pattern matches a launch action of S;
   - T trusts S, or trusts `*`;
   - T has an Allow statement that reaches B through an object action or a bucket-grant action, under the decided rules.

   Then prove that a triple is in the computed finding list if and only if `EscalatesTo` holds for some service, and T is not in `allowedPassRoleTargets`.
4. **Monotonicity:** adding a statement to a role, or adding a role, never removes a finding. This is the formal basis of the decided over-approximations that read more as allowed (for example, ignoring Deny).
5. **Exemption:** `allowedPassRoleTargets` only removes findings whose target is listed.

Each theorem SHALL use only Lean's standard axioms. A test SHALL run `#print axioms` on each and fail on any other axiom.

Owner: Kiro.

### L3. The per-stack check is decided by the kernel

1. FOR each template, THE generated theorem SHALL state that Lean's finding list equals the finding list of the TypeScript evaluator, as a concrete list. It SHALL be closed by kernel evaluation (`decide`, or `decide +kernel` where the elaborator's recursion limit is too small), without `native_decide`. The compiler then leaves the trusted base for scope A.
2. IF a measured template exceeds the time budget of L7 with kernel evaluation, THEN `native_decide` MAY be used for that template only. The report SHALL say so, and `docs/PROOFS.md` SHALL explain it.
3. THE result markers stay the same: only the explicit `PROOFGATE_SAFE` and `PROOFGATE_UNSAFE` count as decisions. A Lean or Lake failure is `PG-IAM-003`.

Owner: Kiro.

### L4. Nothing that users see changes, except the stronger check

1. THE verdicts SHALL NOT change for any existing test, Pattern, benchmark path, trial variant, or demo:
   - the generated suite;
   - `examples/real-stacks`, all sets;
   - the pathfinding.cloud benchmark, 60 of 91;
   - `examples/trial-app`, 24 of 24;
   - `pnpm verify:demo`;
   - `pnpm demo:fix`.

   A differential against 1.2.0 SHALL show no lost and no added finding.
2. IF the Lean finding list and the TypeScript finding list differ for a template, THEN the plugin SHALL reject it with `PG-IAM-003` and name both lists in the diagnostic.
3. THE public TypeScript API SHALL NOT change incompatibly. The violation text and the CDK report fields stay the same.

Owner: Kiro.

### L5. Three implementations agree in the generated tests

1. THE model-level generated tests SHALL compare, for each case, the finding lists of the independent oracle, the TypeScript evaluator, and the Lean evaluator, in one Lean launch per batch, as today.
2. Mutants SHALL be run against the Lean evaluator, and each SHALL be caught: drop the trust check, drop the exemption, treat `?` as `*`, treat a bucket-level ARN as object access, and treat P = T as a path.

Owner: Kiro.

### L6. The Lean semantics follow the decided matching rules

THE Lean definitions SHALL follow every rule decided in `.kiro/steering/security.md` for scope A:
- `?` and `*` in actions and resources, where `*` and `?` may stand for a colon;
- case-insensitive matching, a decided over-approximation;
- S3 object-set intersection, and bucket-grant actions on the bucket ARN;
- the opaque name for an unnamed role, with the wildcard rule;
- a logical ID or a bare role name in an `iam:PassRole` Resource;
- trust `*` for every service;
- the 23 any-service table entries;
- the launch supplements;
- Deny ignored.

A rule that cannot be expressed in Lean in time stays in TypeScript, under L1.4, and is listed.

Owner: Kiro.

### L7. Time budget

1. THE gated synth of `examples/vulnerable-app` SHALL take at most 5 s more than with 1.2.0 on the same machine (measured; 1.2.0 takes about 2 s).
2. `pnpm test` SHALL stay within the CI timeout (20 minutes for the job; today the suite takes about 50 s locally).
3. THE largest template in `examples/real-stacks` SHALL be measured, and the result recorded.

Owner: Kiro.

### L8. Documentation says exactly what is proved

1. `docs/PROOFS.md` SHALL be rewritten (Japanese first, then English). It SHALL list the theorems of L2 with their statements, the per-stack theorem of L3, and the trust base, as a table of what is trusted and what is proved, before and after.
2. `docs/GETTING_STARTED.en.md` section 7, `docs/submission/kiro-usage.md`, `docs/submission/description.md`, `README.md`, and the steering files (`product.md`, `structure.md`, `security.md`, `AGENTS.md`) SHALL be updated to match. They SHALL keep the statement that Lean does not prove AWS IAM or CloudFormation semantics.
3. Kiro SHALL list the wording on the slides and in the narration that needs a change, for the user, because the slides are the user's uncommitted work.

Owner: Kiro. The user changes the slides.

### L9. Release 1.3.0

1. Kiro prepares 1.3.0 on a branch: the version, the CHANGELOG, the tarball check, and a run of the demo against the packed tarballs.
2. The user merges and publishes with `pnpm publish -r --access public` by 2026-12-01.
3. IF scope A is not complete and passing on 2026-12-01, THEN 1.2.0 stays the submission version, and the work stays off `main`.

Owner: Kiro prepares the release. The user publishes.

### L10 (scope B). The other two path shapes in Lean

1. THE intersection with NSTAR (a run without a colon) SHALL be proved like L2.2.
2. Lean SHALL compute the `ImplicitPath` and `PolicyWritePath` findings from the model, with the theorems of L2.3 to L2.5 for these shapes.
3. IF B is not done by 2026-11-30, THEN it stops there, and the Boolean lists remain for these shapes, documented under L8.

Owner: Kiro.

## Schedule

| Date (JST) | Work |
| --- | --- |
| 11-27 | requirements (this document), spikes done |
| 11-28 | design and tasks; Lean core: L2.1, L2.2, the tables as Lean data |
| 11-29 | L1, L2.3 to L2.5, the generator, L3, L4 |
| 11-30 | L5, L7, L8; scope B if A is done |
| 12-01 | L9: the release (the user publishes) |
| 12-02 to 12-04 | recording and submission (`proofgate-kiroween-submission` Step 8) |

## Out of scope

- Proving anything about AWS's IAM implementation, CloudFormation, or the extractor.
- New rules, or changes of a verdict.
- New dependencies, Mathlib, or a change of the Lean toolchain (`v4.31.0` stays).
- The user's uncommitted slides and comparison folders.

## Open questions

1. Scope B: try it after A (the current plan), or skip it and spend the time on the trials and the video?
2. The submission spec `proofgate-kiroween-submission` (R4) names 1.2.0 as the submission version. Kiro proposes revising R4 to 1.3.0 after this spec is approved.
