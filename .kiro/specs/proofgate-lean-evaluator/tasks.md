# Tasks: proofgate-lean-evaluator

Status: APPROVED by the user on 2026-11-27, together with the design (revision 3). Step 0 is done and waits for Checkpoint 0. Requirements: [requirements.md](./requirements.md) (revision 3). Design: [design.md](./design.md) (revision 3).
Deadline of the hackathon: Dec 5, 2026, 07:00 JST. Code freeze: 2026-12-01 (moved by the user from 11-29).
Branches: one per step, from `main`: `leaneval/step-0-f1`, `leaneval/step-1-core`, `leaneval/step-2-theorems`, `leaneval/step-3-product`, `leaneval/step-4-release`. Work happens in the worktree `~/git/proofgate-leaneval`, so the user's uncommitted work in `~/git/proofgate` is never touched. Committing is allowed. Push and merge need the user's approval; each step is merged on its own.
Rules for every task: Fail Closed stays; a disagreement is `PG-IAM-003`; verdicts change only as L0 allows; the oracle is changed first and committed alone; every rule is test-first and the failing run is recorded; no dependency or toolchain change (Lean `v4.31.0`, core library only); no `sorry` or project `axiom`; the axiom test of L2 passes; no publish, tag, or release by Kiro. After each task run the quality gate, and after each change under `tests/` the temporary typecheck of `tests/`. Each session adds a row to the usage log.

| Step | Target (JST) | Checkpoint |
| --- | --- | --- |
| 0 F1 fix | 11-28 morning | user approves S3 and the merge; decides on 1.2.1 |
| 1 Lean core | 11-28 afternoon | user approves the merge |
| 2 Theorems | 11-29, stop at 18:00 for `findings_iff` | user approves the merge, or the fallback |
| 3 Product | 11-30 | user approves the merge |
| 4 Release | 12-01 | user merges and publishes |

## Step 0: F1 on its own (L0)
- [x] 1. Create branch `leaneval/step-0-f1` from `main`.
  - [x] 1.1 Tests first for the oracle: regression rows from P10, P11, P14 (and `arn:aws:iam::123456789012:*`, `arn:*`), and a test that checks the PassRole rows P01 to P14 against the oracle's PassRole function. Show them red.
  - [x] 1.2 Fix `passRoleResourceMatches` in the oracle (its own code: intersect with the role identifiers, NSTAR for partition and account). Typecheck of `tests/`. Commit the oracle alone. Show which generated cases now disagree with the evaluator (expected: harness disagreement until 1.4).
  - [x] 1.3 Tests first for the evaluator: fixed rows for the F1 Resources, the S3 Resources (`arn:aws:iam::1:2:role/x`), bare names and logical IDs, unnamed roles with literals and wildcards. Show them red.
  - [x] 1.4 Fix `allowsPassRoleTarget` with `denotesArn` and `ROLE_SHAPE`, keeping the bare-name and logical-ID rule. Mutants: drop NSTAR (the `role/other-*` row must fail), require `:role/` again (the F1 rows must fail).
  - [x] 1.5 Differential against 1.2.0: list every added finding (F1) and every removed one (S3). Run all Pattern sets, the pathfinding.cloud benchmark, and the trial app; update every expected table row by row with a reason. CHANGELOG ("Fixed", with the note for 1.2.0 users). Gate, usage-log row, PR.
  - Done 2026-11-28 (waits for Checkpoint 0). Branch cut from `leaneval/requirements` (the spec PR #46) and merged with `main` at `31ec6c2`, so it holds the spec too.
    - 1.1: `tests/pbt/passrole-observations.test.ts` checks P01 to P14 against the oracle's PassRole judgment (P02 not applicable: role path; P09 a listed deviation: the account is unknown at synthesis); five regression files `f1-1` to `f1-5`. Red: P10, P11, P14 and all five regressions.
    - 1.2: the oracle now intersects the Resource with `arn:<nstar>:iam:<nstar>:<nstar>:role/<name>`. My first version read an unnamed role's unknown name with plain stars, so `arn:aws:iam::*:role/data-role` met it through the account `*`; the fixed rows of 1.3 caught it, and a second oracle commit made the unknown name a run without a colon.
    - 1.3: `tests/pbt/passrole-resource.test.ts`, 23 rows (oracle, evaluator, one Lean launch). Red: 12 rows against the 1.2.0 evaluator.
    - 1.4: `allowsPassRoleTarget` uses `intersectsStructured` with `ROLE_SHAPE`, keeping the bare-name and logical-ID rule. Mutants: plain stars instead of NSTAR (3 rows fail), requiring `:role/` again (9 rows fail).
    - 1.5: differential against `ec4b8ef` (the published 1.2.0): 4 added findings (the regressions `f1-1` to `f1-4`), 1 removed (`f1-5`, S3), no generated case changed. All eight Pattern sets (84 Patterns, including the hold-out set, run once in this spec) gave the same results as 1.2.0; the pathfinding.cloud benchmark (60 of 91) and the trial app (24 of 24) are unchanged, so no expected table needed an update. CHANGELOG "Unreleased"; `security.md` and `SUPPORTED_IAM.md` updated.
    - Also fixed on the way: the first gate run failed in the CDK integration test because `demo:fix` and that test synthesized `examples/vulnerable-app` into the same `cdk.out` at the same time; `demo:fix` now writes steps 1 and 2 to a temporary directory and prints the plugin version from that report (the CI step that read the app's `cdk.out` was removed).
- [ ] 2. **Checkpoint 0.** Report the differential. The user approves S3 and the merge, and decides whether 1.2.1 is published now.

## Step 1: Lean core (L2.1, L2.2, L1.2)
- [ ] 3. Create branch `leaneval/step-1-core`.
  - [ ] 3.1 `ProofGate/Glob.lean`: `Tok` with `nstar`, `Matches`, `globMatch`, `intersect`, `globMatch_iff`, `intersect_iff`, `nonempty`, the concatenation lemma for `Matches` (from `spike/IntersectNSpike.lean`).
  - [ ] 3.2 `scripts/sync-service-reference.mjs` also writes `ProofGate/Tables.lean` (`launchGroups`, `objectActions` with `s3:*`, `bucketGrantActions`, the list of all services). Test: it equals `aws-tables.generated.ts` and the supplements.
  - [ ] 3.3 `ProofGate/Spec.lean` (design 4.2), with `WellFormed` (unique logical IDs, design 4.3) defined here from the start. The test for the `Path` premise (design 4.1.5).
  - [ ] 3.4 The axiom test: `#print axioms` on every theorem of `Glob.lean`, failing on anything beyond `propext`, `Quot.sound`, `Classical.choice`. The CI grep for `sorry` and `axiom` covers the new files.
  - [ ] 3.5 `lake build` of the bundled project, `pnpm pack:check` (the new files are in the tarball), gate.
- [ ] 4. **Checkpoint 1.**

## Step 2: Theorems (L2.3 to L2.5, L12)
- [ ] 5. Create branch `leaneval/step-2-theorems`.
  - [ ] 5.1 `ProofGate/Eval.lean`: `findings` with the indexed launch lookup; `launch_index_iff`.
  - [ ] 5.2 Bridge lemmas: `allowed_any_iff`, `reaches_iff`, `roleIdent_iff`.
  - [ ] 5.3 `findings_iff`, under `WellFormed m`. **Stop at 11-29 18:00 if not proved:** report, and take the fallback of design section 10.
  - [ ] 5.4 `findings_mono` (adding a statement; adding a role with a new logical ID), `findings_exempt` and `safe_iff` (under `WellFormed m`).
  - [ ] 5.5 `ProofGate/Legacy.lean`: `legacy_s3_unsound`, `legacy_passrole_unsound`.
  - [ ] 5.6 Speed: the demo stack, the largest real-stack template, and the trial app's stacks under kernel evaluation. Record the times.
- [ ] 6. **Checkpoint 2.**

## Step 3: Product (L1, L3 to L8, L11)
- [ ] 7. Create branch `leaneval/step-3-product`.
  - [ ] 7.1 Tests first: the generated module holds the model (not Booleans) for scope A and proves `WellFormed model` by `decide`; the certificate theorem for a safe and an unsafe template; a disagreement gives `PG-IAM-003` with both lists; the method of the certificate is in the output.
  - [ ] 7.2 `generateLean` and the plugin (design 5.5, 6). The fallback to `native_decide` for a wildcard in a service prefix, shown in the output.
  - [ ] 7.3 Generated tests: three-way agreement (oracle, TypeScript, Lean `#eval`); mutants of L5.2 against the Lean evaluator, each caught.
  - [ ] 7.4 L11: the witnesses, the safe cases, the 58 observations as Lean theorems (generated, with the agreement test), P01 to P14 against `RoleIdent`.
  - [ ] 7.5 Optional: the witness certificate for an unsafe template (design 5.5).
  - [ ] 7.6 Docs: `docs/PROOFS.md` (ja and en: the theorems, the certificate, the trust table before and after, the two shapes that keep Booleans, the `native_decide` fallback); `security.md` (S3 to S5, the `Path` premise); `GETTING_STARTED.en.md` section 7; `kiro-usage.md` and `description.md` (the F1 story); README; steering and `AGENTS.md`.
  - [ ] 7.7 Numbers measured again after F1 and this step (benchmark, Pattern sets, trial app, demo timing). A list for the user of the slide and video lines to change.
  - [ ] 7.8 Gate, Lean audit, `pnpm verify:demo`, `pnpm demo:fix`, differential against the `main` of Step 0 (no change).
- [ ] 8. **Checkpoint 3.**

## Step 4: Release (L9)
- [ ] 9. Create branch `leaneval/step-4-release`: version 1.3.0, CHANGELOG, tarball check, the demo against the packed tarballs, the certificate method in the output.
- [ ] 10. **Checkpoint 4.** The user merges and publishes. Kiro checks the registry and runs the demo against npm. The submission spec R4 is revised to the published version.
