# Tasks: proofgate-verification-hardening

Status: APPROVED (revision 2). Implementation is in progress. All 18 tasks are done. Phase 8 is complete and waits for the user's review at Checkpoint 5. Checkpoints 1 to 3 are passed. The box of each task shows its state.

## Progress by phase

Each phase has its own branch, stacked on the previous one. Nothing is pushed or merged without the user's approval.

| Phase | Branch | Tasks | State |
| --- | --- | --- | --- |
| 0 | `hardening/phase-0-baseline` | 0 | done, Checkpoint 1 passed |
| 1 | `hardening/phase-1-support` | 1, 2, 3 | done |
| 2 | `hardening/phase-2-lean-batch` | 4, 5 | done |
| 3 | `hardening/phase-3-red-first` | 6 | done, Checkpoint 2 passed |
| 4 | `hardening/phase-4-corrections` | 7, 8, 9, 10 | done, Checkpoint 3 reported |
| 5 | `hardening/phase-5-extractor` | 11, 12 | done |
| 6 | `hardening/phase-6-selfcheck` | 13 | done |
| 7 | `hardening/phase-7-packaging` | 14, 15 | done, Checkpoint 4 passed; draft PR #1 |
| 8 | `hardening/phase-8-final` | 16, 17 | done; Checkpoint 5 reported |

Structure: **18 top-level tasks (Task 0 to Task 17) in 9 phases (Phase 0 to Phase 8).**

Requirements: [requirements.md](./requirements.md) (revision 3). Design: [design.md](./design.md) (revision 3). Properties `P1` to `P26` are defined in design section 14.

## Command success criteria

These are the only definitions of success for the demo commands. Use them in Tasks 0, 10, and 16.

| Command                                                          | Success condition                                    |
| ---------------------------------------------------------------- | ---------------------------------------------------- |
| `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check` | exit code 0                                          |
| `pnpm synth`                                                     | exit code 0                                          |
| `pnpm --filter @proofgate/safe-app synth:proofgate`              | exit code 0                                          |
| `pnpm --filter @proofgate/vulnerable-app synth:proofgate`        | exit code 1 **and** the output contains `PG-IAM-004` |
| `pnpm verify:demo`                                               | exit code 1 **and** the output contains `PG-IAM-004` |

`pnpm verify:demo` runs the safe app and then the vulnerable app. It exits with code 1 because the vulnerable app is rejected on purpose. That non-zero exit is the expected result and is **not** a baseline failure. A `verify:demo` that exits 0, or that exits 1 without `PG-IAM-004` in the output, is a failure.

## Ground rules for every task

- Do not commit or push. Do not update dependencies. Do not add any `dependencies`, `peerDependencies`, or `devDependencies` entry.
- Do not edit generated output (`dist/`, `cdk.out/`, `.lake/`).
- Do not delete, skip, or weaken any existing test or assertion without explicit user approval (Requirement 7.4). Adding tests is allowed.
- Code comments in `tests/pbt/` and in production source are Japanese. Spec documents and the two English items (oracle limits, `Decision 8.2` comments) are English.
- Kiro is never imported or referenced by package or test code.
- After a task that changes production code, run `pnpm test`, `pnpm synth`, and `pnpm verify:demo`, and judge them by the Command success criteria above.
- **Usage log rule.** Add at least one row to the usage log in `.kiro/steering/kiroween.md` for each **actual Kiro session**. If one session carries out several tasks, one row may list the task numbers and their results together. Never record a session that did not happen. Failures, rejected options, and Counterexamples are always recorded, never omitted. A row states only what was actually done in Kiro.
- **Checkpoints.** The work stops and waits for the user's answer at every checkpoint listed in the Checkpoints section. Nothing past a checkpoint starts without the user's go-ahead.
- A task is done only when its listed checks pass. Report problems instead of working around them.

## Phase 0: Baseline and measurement

- [x] 0. Baseline and feasibility spike
  - [x] 0.1 Record the baseline.
    - Run `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check`, `pnpm synth`, `pnpm verify:demo` on the unchanged tree. Judge each by the Command success criteria. Record pass or fail and the wall time of `pnpm test` in the usage log.
    - `pnpm verify:demo` exiting with code 1 and printing `PG-IAM-004` is the **expected** result. Do not report it as a failure. Also run the two `synth:proofgate` commands separately and record that `safe-app` exits 0 and `vulnerable-app` exits 1 with `PG-IAM-004`.
    - If any command misses its success condition, stop and report. Do not proceed.
    - _Requirements: 7.1, 7.2, 7.3, 8.2_
  - [x] 0.2 Measure Lean batch time with a throwaway script outside the repository.
    - Reproduce the measurement of design 2.1 for 1,000 and 2,000 Cases of 16 and 32 paths, locally. Record the wall times.
    - _Requirements: 8.2, 8.4_ · _Design: 2.1, 9.2_
  - [x] 0.3 Check concurrency.
    - Run the existing integration tests and a batch `lake env lean` at the same time. Confirm no `.lake` lock or stale-build conflict.
    - If there is a conflict, record it. The PBT Lean test will then be serialized (task 4.4).
    - _Design: 9.4_
  - [x] 0.4 Check the CI measurement plan.
    - CI timing is only available after the harness exists (task 15.3). Write down in the usage log that the final Lean-checked count is open until then.
    - _Design: 9.2_
  - [x] 0.5 **CHECKPOINT 1.** Report the baseline results (using the Command success criteria), the measured Lean times, and the concurrency finding. Stop and wait for the user.

## Phase 1: Support code (no production changes yet)

- [x] 1. Configuration, PRNG, and coverage helpers
  - [x] 1.1 Create `tests/pbt/support/prng.ts`: `mulberry32` and a sub-seed function for `(seed, index)`.
    - _Requirements: 1.1, 5.1_ · _Property: P1_
  - [x] 1.2 Create `tests/pbt/support/config.ts`: read the variables in design 4.1 with strict validation (non-numeric or negative values fail with a message). Default seed is a constant.
    - _Requirements: 5.1, 5.2, 8.3_ · _Design: 4.1_
  - [x] 1.3 Create `tests/pbt/support/coverage.ts`: counters per category, tag, AWS-valid form, tag-with-explained-TS-unsafe, and Lean-checked set. Provide a check that fails if a required counter is zero, and a printer for the run summary.
    - _Requirements: 8.5_ · _Property: P26_ · _Design: 5.2_
  - [x] 1.4 Write unit tests for 1.1 to 1.3 (determinism, invalid configuration, counters).
    - _Property: P1, P26_

- [x] 2. Independent oracle
  - [x] 2.1 Write the AWS decision comments first.
    - Create `tests/pbt/support/oracle.ts` skeleton with the English header listing coverage limits (Explicit Deny, SCP, permissions boundary, session policy, resource policy, Condition, policy variables, cross-account, S3 actions beyond the supported set).
    - _Requirements: 2.5, 13.5_ · _Design: 4.3, 8.2_
  - [x] 2.2 Create `tests/pbt/support/glob.ts`.
    - Token compilation (literal, `OneAny`, `OneNoColon`, `StarAny`, `StarNoColon`) per design 4.3.1, `matches`, and the memoized intersection of two token sequences per design 4.3.2. Import nothing from `@proofgate/*` except types if needed.
    - _Requirements: 2.2, 13.1_ · _Property: P16_
  - [x] 2.3 Implement `oracle.ts`: verdict for any Valid StackModel and config. PassRole per design 4.3.3, Lambda control, trust (`lambda.amazonaws.com` only), S3 access by intersection, `allowedPassRoleTargets`, Action names case-insensitive, Resources case-sensitive. Each rule cites `// Decision 8.2: <item>`.
    - _Requirements: 2.1, 2.2, 13.1, 13.2, 13.5_ · _Design: 4.3, 8.2_
  - [x] 2.4 Write example tests for the oracle using the D1 table (design 6.2) and the PassRole, trust, and wildcard rows of design 8.2.
    - Include a test that fails if `oracle.ts` or `glob.ts` imports from `@proofgate/core`.
    - _Requirements: 2.2, 13_ · _Property: P2, P16_
  - [x] 2.5 Write property-style tests for `glob.ts`.
    - Intersection symmetry; `matches(p, s)` equals non-empty intersection of `p` with the literal `s`; `*` and `?` identities.
    - _Property: P16_

- [x] 3. Case generator
  - [x] 3.1 Create `tests/pbt/support/model-gen.ts`: `Case` type, categories, tags, witness.
    - AWS-valid forms of design 4.2.1, noise per 4.2.2, safe derivation, and the fixed boundary list including the ten D1 regressions of design 6.2 (D1-9 is extractor-level and is covered in task 8).
    - _Requirements: 1.1 to 1.5_ · _Design: 4.2_
  - [x] 3.2 Add the conservative stream (design 4.2.3) with stratified allocation: about 35% `unsafe`, 35% `safe`, 15% `conservative` spread over the four tags with some two-tag Cases, the rest boundary.
    - _Requirements: 1.4, 8.4_
  - [x] 3.3 Create `tests/pbt/model-properties.test.ts` for generator self-consistency.
    - Invariants I1 to I5, no tags on non-conservative Cases, O1 equals O2 for every Case (a difference is a harness error), determinism, bounds (roles at most 4, Statements per role at most 6, buckets at most 2).
    - A sample of Cases rendered as templates is accepted by `extractStack`.
    - _Requirements: 1.6, 2.1_ · _Property: P1, P2, P3, P4_
  - [x] 3.4 Add metamorphic tests (inert Statement or role, permutation, Allow monotonicity) using TS and O2.
    - _Requirements: 2.4_ · _Property: P14, P15_

## Phase 2: Lean batch runner, comparison, shrinking

- [x] 4. Lean batch runner
  - [x] 4.1 Create `tests/pbt/support/lean-batch.ts` builder.
    - Call the real `generateLean` per Case. Strict structural check of the output (one `import ProofGate.Security`, one `def generatedPaths ...`, one `#eval` marker line, one `theorem generatedStackIsSafe ... native_decide`). Any difference is a harness error naming the Case. Emit `case_i`, the `PGCASE i` `#eval`, and `thm_i` stating the TS verdict. Record line ranges per Case.
    - _Requirements: 3.2, 4.4_ · _Property: P13_ · _Design: 4.5_
  - [x] 4.2 Implement the runner: temp directory removed in `finally`, `lake env lean` with cwd `packages/cdk-plugin/lean`, timeout, `.lake` existence check, no `lake build`.
    - _Requirements: 3.3, 4.6_
  - [x] 4.3 Implement the result classifier exactly as in the design 4.5 table.
    - Success only with exit 0, zero error diagnostics, and one marker per Case. An error inside a Case's lines is a per-Case mismatch. Any unmapped error, even with all markers present, is an infrastructure failure. A truncated error list fails the run. Warnings are printed only.
    - _Requirements: 3.3_ · _Property: P11_
  - [x] 4.4 Add a launch counter that lives inside the Lean runner of the Model-level test file, and the default-profile split rule (a second launch only above 4,000 Lean-checked Cases). The counter is read only by the same test file and does not need to work across Vitest workers. If task 0.3 found a conflict, serialize this test.
    - _Requirements: 4.1, 4.3_ · _Property: P12_
  - [x] 4.5 Unit tests with small hand-written modules: all pass; one wrong theorem; unmapped error with all markers; missing marker; truncated errors; shape change.
    - _Property: P9, P11, P13_

- [x] 5. Comparison and shrinking
  - [x] 5.1 Create `tests/pbt/support/compare.ts`: the per-category rules of design 4.4, the `witness` explanation check against violation `sourcePaths`, tag vitality, and the `Counterexample` type with a mismatch kind and verdict pair.
    - _Requirements: 2.3, 3.1, 3.4, 13.4_ · _Property: P5 to P10_
  - [x] 5.2 Create `tests/pbt/support/shrink.ts`: operations and rules of design 4.6.
    - Valid StackModel check, same verdict pair, O2 as the verdict after reduction, rejection of steps that remove the witness, at most 8 batched rounds for Lean-involved mismatches, one final three-way confirmation, fallback to the last confirmed Case.
    - _Requirements: 5.4 to 5.9_ · _Property: P17, P18_
  - [x] 5.3 Create `tests/pbt/support/report.ts`: the failure report of design 6.1 with the separate heading for harness errors and the replay command.
    - _Requirements: 5.3_
  - [x] 5.4 Unit tests for shrinking on synthetic failing predicates (validity, verdict pair preserved, confirmation failure fallback, size never grows).
    - _Property: P17, P18_

## Phase 3: Model-level suite, red first

- [x] 6. Model-level agreement test
  - [x] 6.1 Create `tests/pbt/model-agreement.test.ts`.
    - Generate the default 2,000 Cases, check coverage counters, run O1 vs O2, then TS comparison for all Cases, then one Lean batch for the Lean-checked set (boundary and conservative always included), then per-category comparison. Explicit test timeouts (Lean 120 s, others 60 s). Print the run summary.
    - _Requirements: 1, 2, 3, 4, 8.5_ · _Property: P5 to P12, P26_
  - [x] 6.2 Run the suite against the **unfixed** production code and record the result.
    - **The Model-level suite is expected to detect exactly two known defects:** the `?` wildcard gap and the D1 prefix-scoped S3 access gap. Save each reduced Counterexample JSON under `tests/pbt/regressions/` with the AWS label and a short English note. Record in the usage log what was found, including anything unexpected.
    - **D5 (policy variables) is not detected by the Model-level suite**, because a `StackModel` cannot represent a policy variable. D5 is detected by the Extractor-level red tests of Task 9.
    - If the suite finds anything beyond these two defects, stop and report before fixing.
    - _Requirements: 5.4, 5.7, 7.5_
  - [x] 6.3 Create `tests/pbt/regressions.test.ts` and add the Model-level regression files: D1-1 to D1-8, D1-10 (design 6.2) and the reduced `?` Counterexample. D1-9 (policy variable) is an Extractor-level and validator test and is added in Task 9.
    - Replays each through O2, TS, and one Lean batch.
    - _Requirements: 5.11_ · _Design: 6.2_
  - [x] 6.4 **CHECKPOINT 2.** Report the red-first result: which Counterexamples were found, their reduced JSON, and whether anything unexpected appeared. Stop and wait for the user before starting Phase 4.

## Phase 4: Production corrections (D1, D5, `?`)

Each task is a minimal change with a regression test and must keep `pnpm test`, `pnpm synth`, and `pnpm verify:demo` passing. None may accept more input. Check this explicitly.

- [x] 7. Fix `?` wildcard matching (`@proofgate/core`)
  - [x] 7.1 Make `matches` treat `?` as one arbitrary character in Action and Resource patterns. Keep existing case rules and the wide `*`.
    - _Requirements: 7.5, 7.6_ · _Design: 13.1_
  - [x] 7.2 Confirm the `?` regression files pass and no existing test changed.
    - _Property: P5, P6, P16_

- [x] 8. Fix S3 access to use intersection (`@proofgate/core`), D1
  - [x] 8.1 Add the production intersection function (case-insensitive literals, `*` crosses any character, `?` one character). Write it independently of `tests/pbt/support/glob.ts`.
    - _Requirements: 7.5_ · _Design: 13.2_
  - [x] 8.2 Use it for the protected-bucket access fact: policy Resource set intersects the protected bucket's object set (bucket ARN without trailing `/`, then `/`, then any key). Keep the PassRole path on `matches`.
    - The Lean side and `generateLean` stay unchanged.
    - _Requirements: 7.5_ · _Property: P16_
  - [x] 8.3 Confirm all D1 regression cases pass: D1-1 to D1-8 and D1-10.
    - _Property: P5, P6, P10, P16_
  - [x] 8.4 Add or update production unit tests only by **adding** cases. Existing assertions stay.
    - _Requirements: 7.3, 7.4_
  - [x] 8.5 Report to the user: the fix only adds findings and no existing demo result changed (`safe-app` passes, `vulnerable-app` is rejected with `PG-IAM-004`).
    - _Requirements: 7.6, 7.7_

- [x] 9. Reject policy variables in Resource (`@proofgate/extractor`), D5, red first
  - [x] 9.1 **Add the tests first.** Create `tests/pbt/policy-variable.test.ts` with example tests:
    - Extractor level (D1-9): a Resource string `arn:aws:s3:::protected-bucket/${aws:username}/*` and the same value as an array element, in an inline role policy and in `AWS::IAM::Policy`, for Allow and Deny. Expect: an unsupported finding, no model, and a `sourcePath` ending in `.Resource` (string) or `.Resource[k]` (array element).
    - Validator level: `ProofGateValidator` on a synthesized template with that Resource reports `PG-IAM-003`.
    - Characterization test for the intrinsic case: a Resource that is a CloudFormation intrinsic (for example `Fn::Join`, including one whose text contains `${aws:username}`) produces the **existing** non-literal finding at the Statement path, exactly one finding, and no variable finding. This test must pass **before** the fix and must keep passing after it.
    - _Requirements: 6.1, 12.4, 12.6_ · _Property: P20, P21_
  - [x] 9.2 **Confirm the tests fail before the fix.** Run them against the unfixed extractor.
    - Expected: the policy-variable tests fail (no finding, a model is returned, so `ProofGateValidator` does not report `PG-IAM-003` for D5); the intrinsic characterization test passes.
    - Record the failure output and the `sourcePath` values (or their absence) in the usage log. If the characterization test fails before the fix, stop and report.
    - _Requirements: 7.5_
  - [x] 9.3 **Minimal extractor fix.** Return an unsupported finding for a literal Resource string, or literal array element, that contains IAM policy variable syntax (`${` with a closing `}`).
    - `sourcePath` is `<statement>.Resource` or `<statement>.Resource[k]`. The reason says IAM policy variables in Resource are not supported. No model is returned. Variables are not evaluated.
    - Apply to Allow and Deny Statements, in inline role policies and `AWS::IAM::Policy`.
    - If the Resource is already unsupported because it is a CloudFormation intrinsic, leave the existing finding exactly as is and add nothing.
    - _Requirements: 7.5, 7.6_ · _Design: 13.3_
  - [x] 9.4 **Confirm the tests pass after the fix.** The policy-variable tests pass. The intrinsic characterization test still passes unchanged, with the same finding text, path, and count. All existing tests and assertions are unchanged and pass. Run `pnpm test`, `pnpm synth`, and `pnpm verify:demo` by the Command success criteria.
    - _Property: P20, P21_
  - [x] 9.5 Add Japanese bullets (additions only, nothing removed) to `docs/SUPPORTED_IAM.md` and `docs/ASSUMPTIONS.md`, and to `packages/cdk-plugin/README.md` and the root `README.md`, stating that policy variables in Resource are rejected with `PG-IAM-003`, that this rejects more input than before, and that S3 access now means access to any object in a protected bucket.
    - Update `docs/PROOFS.md` only if it describes the access fact; add, do not delete.
    - _Requirements: 10.2_ · _Design: 13.3_
  - [x] 9.6 Report to the user that this change rejects more input (Fail Closed), and name who is affected.
    - _Requirements: 7.6_

- [x] 10. Checkpoint after production corrections
  - [x] 10.1 Run `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check`, `pnpm synth`, `pnpm verify:demo`, plus both `synth:proofgate` commands. Judge each by the Command success criteria: `pnpm synth` exits 0; `safe-app` `synth:proofgate` exits 0; `vulnerable-app` `synth:proofgate` exits 1 with `PG-IAM-004`; `pnpm verify:demo` exits 1 with `PG-IAM-004`.
  - [x] 10.2 Re-run the Model-level suite with several additional seeds. **Upper limit for these routine extra runs:** `PROOFGATE_PBT_CASES=5000` and `PROOFGATE_PBT_LEAN_CASES=2000`, with `PROOFGATE_PBT_SEED` set to each seed. The 20,000-Case profile is a manual deep profile only and is not part of this task. Any new Counterexample becomes its own task (design 13.4) and is reported before any fix that could change a verdict from unsafe to safe.
    - _Requirements: 5.2, 7.7, 8.3_
  - [x] 10.3 **CHECKPOINT 3.** Report the results of 10.1 and 10.2, the production diff, and the Fail Closed impact of D5. Stop and wait for the user's review before starting Phase 5.

## Phase 5: Extractor-level suite

- [x] 11. Extractor-level PBT
  - [x] 11.1 Create `tests/pbt/support/template-gen.ts`: `TemplateRecipe`, template rendering (string or array Action and Resource, inline `Policies`, `AWS::IAM::Policy` with `Roles: [{ Ref }]`, several roles and Statements, Allow and Deny), and `expectedModel` written independently of the extractor with canonical ordering.
    - _Requirements: 12.1 to 12.3_ · _Property: P19_ · _Design: 4.7_
  - [x] 11.2 Add the poison catalogue: `Condition`, `NotAction`, `NotResource`, trust `NotPrincipal`, trust `Condition`, non-literal trust value, non-literal `Action`, `Resource`, `RoleName`, non-default `Path`, `AWS::IAM::ManagedPolicy`, `ManagedPolicyArns`, another `AWS::IAM::*` type, malformed `PolicyDocument`, missing `Resources`, `POLICY_VARIABLE`, `INTRINSIC_WITH_VARIABLE`. For each poison, record the expected `sourcePath` granularity next to its definition.
    - _Requirements: 6.1, 12.4, 12.5_ · _Property: P20, P21_
  - [x] 11.3 Create `tests/pbt/extractor.test.ts`: supported round-trip, one poison, mixed fragments (no partial model), no roles, no supported Statements. Default 1,000 Cases with coverage counters per poison.
    - _Requirements: 12.2, 12.4 to 12.7_ · _Property: P19 to P22_
  - [x] 11.4 Add extractor-layer shrinking (remove resources, statements, array elements; the fragment stays valid; the same failure stays) and the report.
    - _Requirements: 5.10_ · _Property: P17_
  - [x] 11.5 Enforce the Extractor layer boundary by import inspection, not by a runtime counter.
    - Do **not** rely on an in-memory Lean launch counter across Vitest workers.
    - Create `tests/pbt/architecture.test.ts`. It reads the import specifiers of the Extractor PBT files (`extractor.test.ts`, `template-gen.ts`, and every support file they import, followed transitively through relative imports) and fails if any of them imports: `lean-batch.ts` (any relative path ending in `lean-batch`), `@proofgate/core`, `@proofgate/cdk-plugin`, or `node:child_process` (or `child_process`).
    - Allowed dependencies: `@proofgate/extractor`, types from `@proofgate/model`, `vitest`, Node built-ins other than `child_process`, and Extractor test support (`template-gen.ts`, extractor shrinking, and shared helpers that themselves pass this check: `prng.ts`, `config.ts`, `coverage.ts`, `report.ts`).
    - If a shared helper would import a forbidden module, split it so the Extractor side stays clean.
    - Add a negative self-check: a fixture file that imports `lean-batch` is reported by the same checker.
    - _Requirements: 4.7_ · _Design: 4.5, 4.7_

- [x] 12. Fail-closed tests
  - [x] 12.1 Create `tests/pbt/failclosed.test.ts`: `ProofGateValidator` with empty `protectedBucketArns` reports `PG-IAM-003` (no Lean start); malformed template file is rejected.
    - _Requirements: 6.2, 6.4_ · _Property: P23_

## Phase 6: Harness self-check and regressions

- [x] 13. Self-check with mutants
  - [x] 13.1 Create `tests/pbt/selfcheck.test.ts` with the mutants of design 11, through the same parameters the harness already uses.
    - Mutants: evaluator ignores role-name wildcard PassRole; evaluator returns safe with three or more roles (and the shrunk output is no larger than the original); evaluator reports unsafe without a witness; evaluator never over-approximates `TRUST_STAR`; `generateLean` flips `targetCanAccess` (one Lean launch, 200 Cases); `generateLean` output of a changed shape (harness error naming the Case); Lean module with an unmapped error and all markers present (infrastructure failure); O2 mutant (case-sensitive Action, harness error).
    - The test fails if any mutant is not detected.
    - _Requirements: 6.3, 4.2_ · _Property: P24, P13, P11_
  - [x] 13.2 Record the self-check launch count in the usage log and in the file header.
    - _Requirements: 4.2_

## Phase 7: Packaging, CI, and time budget

- [x] 14. Package boundary check
  - [x] 14.1 Add one assertion to `scripts/check-packages.mjs`: every tarball entry is under `package/dist/`, `package/lean/`, or is `package.json`, `README.md`, `LICENSE`. This changes a script, not a package.
    - _Requirements: 9.1, 9.2_ · _Property: P25_
  - [x] 14.2 Run `pnpm pack:check` and confirm no test-only code is in any tarball and no `dependencies` changed.
    - _Requirements: 9.2, 9.3, 9.5, 9.6_

- [x] 15. Time budget and CI
  - [x] 15.1 Measure the whole PBT suite locally: wall time added to `pnpm test`, Lean batch time, launch count. The limit is 60 seconds.
    - _Requirements: 8.2_
  - [x] 15.2 **CHECKPOINT 4. Push permission needed.** Push is not allowed in this spec without the user's approval. Report the local timing from 15.1, ask the user to run the CI or to authorize a commit and push, and stop. Do not guess CI time. Continue to 15.3 only after the user supplies CI results or declines.
    - _Requirements: 8.1, 8.2_
  - [x] 15.3 With the CI numbers, fix the default Lean-checked count (design 9.2). If the Lean batch for 2,000 Cases exceeds 90 s in CI, lower the Lean-checked count with a seeded sample that always includes boundary and conservative Cases.
    - Record in `.kiro/steering/kiroween.md`: local time, CI time, the Case counts tried, and the final count, with the machine and runner named.
    - _Requirements: 8.2, 8.4, 11.1_
  - [x] 15.4 Document the deep profile and the seed variables (a short English section in a new `tests/pbt/README.md`, and one Japanese line in the root `README.md` pointing to it). Confirm the CI job needs no new workflow.
    - _Requirements: 8.1, 8.3_

## Phase 8: Final verification and records

- [x] 16. Final verification
  - [x] 16.1 Run, on a clean build: `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check`, `pnpm synth`, the two `synth:proofgate` commands, and `pnpm verify:demo`. Judge each by the Command success criteria:
    - `pnpm synth`: exit code 0 (both apps succeed).
    - `safe-app` `synth:proofgate`: exit code 0.
    - `vulnerable-app` `synth:proofgate`: exit code 1 and the output contains `PG-IAM-004`.
    - `pnpm verify:demo`: exit code 1 and the output contains `PG-IAM-004`. This is expected and is not a failure.
    - _Requirements: 7.1, 7.2, 10.1_
  - [x] 16.2 Confirm by diff review that no existing test or assertion was deleted, skipped, or weakened, and that `lean-toolchain`, Node, pnpm, and TypeScript versions are unchanged.
    - _Requirements: 7.4, 9.5_
  - [x] 16.3 Grep the repository for `sorry` and `axiom` in Lean sources (the CI audit command) and confirm none.
    - _Requirements: 10.1_
  - [x] 16.4 Confirm no credentials, tokens, or credit codes were written to any file.
    - _Requirements: 11.3_

- [x] 17. Kiro work record and write-up material
  - [x] 17.1 Review the usage log in `.kiro/steering/kiroween.md`. Each row names the Kiro app, the feature, and the result. It includes failures, rejected options (`fast-check`), the red-first run, and every Counterexample found.
    - _Requirements: 11.1, 11.2_
  - [x] 17.2 State in the log whether Kiro's property-based testing feature was used to generate or run any of P1 to P26, or whether the in-repo harness did, with the reason.
    - _Requirements: 11.4_
  - [x] 17.3 Write a short English summary for the submission write-up: the problem the oracle solved (TS vs Lean alone is weak), what the suite found, and the exact claims allowed by Requirement 14. Do not claim Lean independently verifies CloudFormation or IAM statements.
    - _Requirements: 14.1 to 14.5_
  - [x] 17.4 **CHECKPOINT 5.** Report to the user: files changed, findings, open risks, and the diff. Stop and wait. Do not commit or push.

## Checkpoints

The work stops, reports, and waits for the user at each of these. Nothing after a checkpoint starts without the user's go-ahead.

| #   | Where                            | What is reported                                                                                   |
| --- | -------------------------------- | -------------------------------------------------------------------------------------------------- |
| 1   | After Task 0 (0.5)               | Baseline by the Command success criteria, Lean timings, concurrency finding                        |
| 2   | After the red-first result (6.4) | Counterexamples found at the Model level (expected: `?` and D1 prefix access), anything unexpected |
| 3   | After Task 10 (10.3)             | Production corrections, the checks of 10.1 and 10.2, Fail Closed impact of D5                      |
| 4   | At Task 15.2                     | Local timing, and the request for permission to commit and push so that CI can run                 |
| 5   | After Task 17 (17.4)             | Files changed, findings, open risks, diff                                                          |

Commit and push are never done without the user's approval.

## Dependency order

```
0 [CP1] -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 [CP2] -> {7, 8, 9} -> 10 [CP3] -> 11 -> 12 -> 13 -> 14 -> 15 [CP4 at 15.2] -> 16 -> 17 [CP5]
```

Tasks 7, 8, and 9 are independent of each other. Tasks 7 and 8 need the red result of 6.2. Task 9 has its own red test (9.2) and needs only Checkpoint 2. Tasks 11 and 12 may start after 10. Task 15.3 depends on a CI run, which needs the user's approval to push.

## Property coverage map

| Property   | Tasks                     |
| ---------- | ------------------------- |
| P1         | 1.1, 1.4, 3.3             |
| P2, P3, P4 | 3.3                       |
| P5 to P8   | 5.1, 6.1, 7.2, 8.3        |
| P9, P10    | 4.5, 6.1, 8.3             |
| P11        | 4.3, 4.5, 13.1            |
| P12        | 4.4                       |
| P13        | 4.1, 4.5, 13.1            |
| P14, P15   | 3.4                       |
| P16        | 2.2, 2.4, 2.5, 8.1 to 8.3 |
| P17, P18   | 5.2, 5.4, 11.4            |
| P19 to P22 | 9.1 to 9.4, 11.1 to 11.3  |
| P23        | 12.1                      |
| P24        | 13.1                      |
| P25        | 14.1                      |
| P26        | 1.3, 6.1                  |

## Requirement coverage map

| Requirement | Tasks                                  |
| ----------- | -------------------------------------- |
| 1           | 3.1, 3.2, 3.3                          |
| 2           | 2, 3.4, 5.1                            |
| 3           | 4, 5.1, 6.1                            |
| 4           | 4.2, 4.4, 11.5 (import boundary), 13.2 |
| 5           | 1.2, 5.2, 5.3, 6.2, 6.3, 11.4          |
| 6           | 11.2, 12.1, 13.1                       |
| 7           | 0.1, 7 to 10, 16.1, 16.2               |
| 8           | 0.2, 1.3, 15                           |
| 9           | 14, 16.2                               |
| 10          | 9.3, 16                                |
| 11          | every task's log row, 15.3, 17         |
| 12          | 11, 9.1                                |
| 13          | 2.1, 2.3, 2.4                          |
| 14          | 5.1, 17.3                              |
