# Tasks: proofgate-real-stack-validation

Status: APPROVED by the user's go-ahead ("you may proceed with the tasks"). In progress. The box of each task shows its state.

Structure: **17 top-level tasks (Task 0 to Task 16) in 6 phases (Phase 0 to Phase 5).** The catalogue has 14 Patterns (RS-14 was added at Checkpoint 1).

Requirements: [requirements.md](./requirements.md) (revision 3). Design: [design.md](./design.md) (revision 2). Properties `P1` to `P12` are defined in design section 13.

## Assumptions made when writing these tasks

The design lists five decisions. These tasks assume the recommended answer for D2 to D5. D1 was decided by the user at Checkpoint 1:

- D1 (Pattern RS-14, an acknowledged finding): **decided: add it**. Task 4.5 builds it.
- D2: the message hints are written after the decision gate (Task 12).
- D3: the root script is `pnpm real-stacks`.
- D4: the result documents are `docs/REAL_STACKS.md` (Japanese) and `docs/REAL_STACKS.en.md` (English).
- D5: evaluating the supported part next to unsupported syntax is not done here. It is recorded as a follow-up candidate.
- Branches: one branch per phase, stacked, named `realstacks/phase-<n>-<name>`. Commits on them are allowed. Push and merge need the user's approval, as in the earlier spec.

## Command success criteria

| Command | Success condition |
| --- | --- |
| `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check` | exit code 0 |
| `pnpm synth` | exit code 0 |
| `pnpm --filter @proofgate-cdk/safe-app synth:proofgate` | exit code 0 |
| `pnpm --filter @proofgate-cdk/vulnerable-app synth:proofgate` | exit code 1 and the output contains `PG-IAM-004` |
| `pnpm verify:demo` | exit code 1 and the output contains `PG-IAM-004` |
| `pnpm real-stacks` (from Task 8) | exit code 0 means every observed Result equals `expected-results.json`; 1 means a difference; 2 means a harness error |

`verify:demo` exits 1 on purpose. That is not a failure.

## Ground rules for every task

- Do not add or change any dependency, lockfile entry for an external package, Lean toolchain, Node.js, pnpm, or TypeScript pin. The new workspace package may add its own importer entry to `pnpm-lock.yaml`; check the diff.
- Do not publish, tag, release, or change the package version. The version is the user's decision (Requirement 8.4).
- Do not delete, skip, or weaken an existing test or assertion. Adding tests is allowed. The extractor's `reason` strings are asserted by tests and are not changed.
- Do not push or merge without the user's approval.
- A fix may only add findings or rejections. Anything that accepts what is rejected today needs the user's approval.
- Throwaway scripts (spikes) are deleted after use. If a spike leaves a file in the repository, the task is not done.
- Code comments are Japanese. Documents under `.kiro` and `docs/REAL_STACKS.en.md` are English. `docs/REAL_STACKS.md` is Japanese.
- Never write credentials, tokens, or credit codes to any file.
- **Usage log rule.** Add at least one row to `.kiro/steering/kiroween.md` for each actual Kiro session. Several tasks of one session may share a row. Never record a session that did not happen. Record wrong predictions, failures, and surprises.
- **Checkpoints.** Stop and wait for the user at every checkpoint in the Checkpoints section.
- After a task that changes code, run the quality gate: `bash .kiro/scripts/proofgate-quality-gate.sh`.
- Test files are not covered by `pnpm typecheck`; check new test files with a temporary tsconfig that extends `tsconfig.base.json`.

## Progress by phase

| Phase | Branch | Tasks | State |
| --- | --- | --- | --- |
| 0 | `realstacks/phase-0-spikes` | 0 | done, Checkpoint 1 passed |
| 1 | `realstacks/phase-1-catalogue` | 1, 2, 3, 4, 5 | done |
| 2 | `realstacks/phase-2-predictions` | 6 | done (predictions fixed in commit 6cf7b0d) |
| 3 | `realstacks/phase-3-runner` | 7, 8, 9, 10, 11 | not started; Checkpoint 2 (decision gate) at Task 11 |
| 4 | `realstacks/phase-4-after-gate` | 12, 13, 14, 15 | not started; only after the user's decision |
| 5 | `realstacks/phase-5-record` | 16 | not started; Checkpoint 3 |

## Phase 0: Spikes and baseline

- [x] 0. Baseline and feasibility spikes
  - [x] 0.1 Create the branch `realstacks/phase-0-spikes` from the current branch `realstacks/spec` and commit the spec documents (`requirements.md`, `design.md`, `tasks.md`) and the usage-log rows written so far, as one commit.
    - Update the commit rule in `AGENTS.md` and `.kiro/steering/development.md` so that commits on `realstacks/phase-*` are allowed like those on `hardening/phase-*`. Keep push and merge rules unchanged.
    - _Requirements: 9.1_
  - [x] 0.2 Record the baseline on the unchanged tree: `pnpm quality`, `typecheck`, `test`, `pack:check`, `synth`, both `synth:proofgate` commands, and `verify:demo`, judged by the Command success criteria. Record the exit codes and times in the usage log.
    - If a command misses its condition, stop and report.
    - _Requirements: 8.1_
  - [x] 0.3 Spike: the report format and the failure shape.
    - In a throwaway script (deleted afterwards), run the real `ProofGateValidator` in process for the three stacks of design section 2.2 and read `validation-report.json`. Record in the usage log: the file's fields (rule name, description, resource locations), and how to get rule ids and reasons from it.
    - Check that a stack with two templates passes both templates to the plugin (needed for RS-13).
    - _Requirements: 3.1_ · _Design: 2.2, 5.1_
  - [x] 0.4 Spike: can the constructs of RS-10, RS-12, and RS-13 be synthesized without credentials, Docker, or network?
    - CodeBuild with a GitHub source, a `PolicyStatement` whose resource string contains `${aws:username}`, and two stacks in one app. Record what works and what must change in the Pattern (design section 4, note on RS-12).
    - _Requirements: 1.3_
  - [x] 0.5 Spike for decision D1: acknowledgement of a finding.
    - Read the CDK validation API in the installed `aws-cdk-lib` and find how a finding is acknowledged. Then, in a throwaway script, acknowledge the `PG-IAM-004` finding of the literal unsafe stack and see whether `synth` still fails. Record the answer without opinion: yes or no, and how.
    - Do not change the plugin.
    - _Design: 2.4, 12 (D1)_
  - [x] 0.6 **CHECKPOINT 1.** Report the baseline, the report format, the construct findings, and the answer to D1. Ask the user whether RS-14 is added. Stop and wait. (Done: the user said to add RS-14.)

## Phase 1: The package and the catalogue

- [x] 1. Package skeleton `examples/real-stacks`
  - [x] 1.1 Create the branch `realstacks/phase-1-catalogue`. Create `package.json` (private, name `@proofgate-cdk/real-stacks`, the same dependency versions as `examples/safe-app`), `tsconfig.json`, `cdk.json`, `src/config.ts`, `src/catalog.ts` (empty list), and `src/app.ts`.
    - `app.ts` reads the context value `pattern`. A missing or unknown id is an error that lists the valid ids. No default. `PROOFGATE=1` registers the plugin with the protected bucket from `config.ts`.
    - _Requirements: 1.1, 1.5_ · _Property: P2_ · _Design: 3, 3.2_
  - [x] 1.2 Run `pnpm install --offline --no-frozen-lockfile`, then check the lockfile diff: only an importer entry for the new package may appear. Then `pnpm install --frozen-lockfile --offline` must pass.
    - If an external package entry changes, stop and report.
    - _Requirements: 8.2_ · _Property: P9_
  - [x] 1.3 Tests for the selection rule (a small file under `tests/`): a missing id, an unknown id, and a valid id. The test calls the selection function, not `cdk`.
    - _Property: P2_
  - [x] 1.4 Run the quality gate. Knip and jscpd must pass; if Knip needs an entry for `scripts/*.mjs`, add it to `knip.json` and say so in the usage log.

- [x] 2. Shared helpers and Patterns RS-01 to RS-04 (literal roles)
  - [x] 2.1 `src/helpers.ts`: a literal role, a data role with a bucket grant, a developer role with PassRole and Lambda statements. Keep the Pattern files short so that jscpd stays quiet.
    - _Requirements: 1.1_ · _Design: 3_
  - [x] 2.2 `src/patterns/rs-01.ts` to `rs-04.ts` as in design section 4. Each file states the id, the title, a two or three sentence English description, the ground truth, the scope, and a comment (Japanese) with the reasoning for the ground truth. Register them in `catalog.ts`.
    - _Requirements: 1.2, 1.4_

- [x] 3. Patterns RS-05 to RS-09 (ordinary CDK helpers)
  - [x] 3.1 `rs-05.ts` to `rs-09.ts` as in design section 4: Lambda with `grantRead`, role with `grantReadWrite`, Step Functions with `LambdaInvoke`, ECS Fargate task with `grantReadWrite`, EventBridge rule with a Lambda target. Inline Lambda code only. Register them in `catalog.ts`.
    - If a construct needs something that is not available offline, change the Pattern, record it, and keep its ground truth.
    - _Requirements: 1.2, 1.3, 1.4_

- [x] 4. Patterns RS-10 to RS-14
  - [x] 4.1 `rs-10.ts`: CodeBuild project with `iam:PassRole *` and `lambda:CreateFunction *`, plus a literal data role in the same stack.
  - [x] 4.2 `rs-11.ts`: the literal unsafe pair of RS-02 plus an unrelated Lambda with `grantRead`.
  - [x] 4.3 `rs-12.ts`: a role whose statement resource contains a policy variable.
  - [x] 4.4 `rs-13.ts`: two stacks, the developer role in one and the data role in the other, `inScope: false`.
  - [x] 4.5 `rs-14.ts`: as RS-02, with `Validations.of(app).acknowledge({ id: 'ProofGate::PG-IAM-004', reason })` in `build`. Ground truth unsafe, `inScope: false`, `boundary: 'acknowledged'`. Also give RS-13 `boundary: 'cross-template'`.
  - _Requirements: 1.2, 1.4, 5.1_

- [x] 5. Every Pattern synthesizes without ProofGate
  - [x] 5.1 For every Pattern, run the real `cdk synth -c pattern=<id>` (plain, no `PROOFGATE`). All must exit 0 without credentials, Docker, or network. Record the time of each.
    - _Requirements: 1.3_ · _Property: P1_
  - [x] 5.2 Run the quality gate. Commit the phase. Do not run ProofGate on any Pattern yet: the predictions come first.

## Phase 2: Predictions

- [x] 6. Write and fix the predictions before any measurement
  - [x] 6.1 Create the branch `realstacks/phase-2-predictions`. Write `examples/real-stacks/data/predictions.json` from the appendix of `requirements.md`: for each Pattern the ground truth, the scope, the predicted Result, the predicted reasons, and `basis` (`"probe (extractor only)"` for RS-05 to RS-09 and RS-12, `"spike (plugin, in process)"` for RS-11 and RS-14, `"reasoning"` for the others).
    - _Requirements: 2.1, 2.3_ · _Design: 6_
  - [x] 6.2 Commit `predictions.json` **alone**, in its own commit. Check with `git show --stat` that the commit contains only that file, and with `git ls-files` that no runner, no classifier, and no `expected-results.json` exists yet.
    - From now on `predictions.json` is never edited. A wrong prediction is recorded in `expected-results.json` and in the usage log, not here.
    - _Requirements: 2.1_ · _Property: P6_

## Phase 3: Runner, measurement, and the decision gate

- [ ] 7. Classification function
  - [ ] 7.1 Create the branch `realstacks/phase-3-runner`. Write `scripts/classify.mjs` as in design section 5.2 (six classes, and an exception for a combination that fits no class).
    - _Requirements: 4.1_ · _Design: 5.2_
  - [ ] 7.2 Unit tests under `tests/` for every class and for the exception, including: unsafe in scope with `PG-IAM-003` only (rejected as unsupported, path not visible), unsafe in scope accepted (false negative), safe with `PG-IAM-004` (false positive), unsafe out of scope accepted (outside the boundary), and both rule ids together.
    - _Requirements: 4.1, 4.3_ · _Property: P5_

- [ ] 8. The runner
  - [ ] 8.1 `scripts/run.mjs`, in process: for each Pattern, plain synthesis (a failure is a harness error, exit 2), gated synthesis with the real plugin, read `validation-report.json` as found in Task 0.3, compute the Result (`accepted`, `PG-IAM-003`, `PG-IAM-004`, or both), the unsupported reasons, and the construct locations. Temporary output directories are removed.
    - _Requirements: 3.1, 3.4_ · _Design: 5.1_
  - [ ] 8.2 Modes: `--print` prints the observed results as JSON and compares nothing; the default compares with `data/expected-results.json` and prints the Pattern, what was expected, and what happened for each difference (exit 1); `--cli sample` (default) and `--cli all` as in design section 5.3; `--only <id>`.
    - _Requirements: 3.2_
  - [ ] 8.3 Add the root script `pnpm real-stacks` that runs the runner. This is a change to the root `package.json` scripts only.
    - _Requirements: 3.1_ · _Design: 12 (D3)_
  - [ ] 8.4 Run the quality gate. The runner does not exist in any package's `files`.
    - _Property: P9_

- [ ] 9. Real `cdk synth` sample
  - [ ] 9.1 In the runner, run the real CLI for RS-01, RS-02, and RS-05 with and without `PROOFGATE=1`. Check exit codes 0, 1, 1 and the rule id in the output. `--cli all` runs the same check for every Pattern.
    - _Requirements: 2.3_ · _Property: P8_ · _Design: 5.3_

- [ ] 10. Measure, review, and record
  - [ ] 10.1 Run `pnpm real-stacks -- --print` and save the observed results. Do not look at the predictions while classifying.
    - _Requirements: 4.1_
  - [ ] 10.2 Compare with `predictions.json`. For each Pattern where the observed Result or the reasons differ, write a `deviation` that says what was predicted, what happened, and why. Wrong predictions are recorded in the usage log. If a result looks like a defect (a false negative or false positive), stop and tell the user before going on (Requirement 7.1).
    - _Requirements: 2.2, 7.1_
  - [ ] 10.3 Write `data/expected-results.json` from the reviewed results (Result, class, reasons, `deviation`, and a `knownDefects` list that is expected to be empty). Then the default `pnpm real-stacks` must exit 0.
    - _Requirements: 3.1, 4.1_
  - [ ] 10.4 Write `tests/real-stacks-table.test.ts` as in design section 7: the table is consistent with the catalogue ids, the allowed values, the classifier, the rule that an unsafe in-scope Pattern is never filed as accepted unless it is in `knownDefects`, and the rule that every Pattern with `inScope: false` has a `boundary` value. It reads files only and runs in milliseconds.
    - _Requirements: 4.1, 4.3_ · _Property: P5_
  - [ ] 10.5 Measure: three runs of the default `pnpm real-stacks` (time each), and one run of `--cli all` (time and results). The default run must finish within 60 s.
    - _Requirements: 3.3_ · _Property: P7_
  - [ ] 10.6 Run the quality gate, and check that `pnpm test` still passes with the new table test.
  - [ ] 10.7 Check each Pattern with ground truth unsafe and in scope against Property P3 and Requirement 5.2: what Result is seen, and whether the path is visible in it.
    - _Requirements: 5.1, 5.2_ · _Property: P3_

- [ ] 11. The decision gate
  - [ ] 11.1 Compute the three criteria of Requirement 10.2 from the table: any false negative or false positive; any literal-only Pattern (RS-01 to RS-04) decided wrongly or rejected as unsupported; the number of RS-05 to RS-09 rejected as unsupported (poor if 4 or more).
    - _Requirements: 10.2_
  - [ ] 11.2 **CHECKPOINT 2, the decision gate.** Stop and report: the table, the three criteria with their values, the evidence, the wrong predictions, the time of the runner, and the options (a) to (d) of Requirement 10.3 with their costs. Say openly whether the result is "poor" by the definition. Make no change to the README, the changelog, the version, the tag, or npm. Wait for the user's decision.
    - _Requirements: 10.1, 10.3, 10.4, 10.5_

## Phase 4: After the decision gate (only with the user's decision)

Do not start this phase before the user has decided at Checkpoint 2. If the user chooses a different course (for example a follow-up spec that widens support), these tasks are changed first and the change is approved.

- [ ] 12. Message hints (additive)
  - [ ] 12.1 Create the branch `realstacks/phase-4-after-gate`. Write tests first for a pure function `hintFor(reason)` in `packages/cdk-plugin` (the table of design section 8, and "no hint" for other reasons), and for the validator: the violation `description` still begins with `Unsupported IAM syntax: <reason>` and ends with the hint. Run them against the unchanged code and record that they fail.
    - _Requirements: 7.4_
  - [ ] 12.2 Implement `hintFor` and append the hint to the `description` and to `fix` of the unsupported-syntax violations. Do not change any `reason` string of the extractor. Keep the old sentence of `fix` unless no test asserts it.
    - _Requirements: 7.4_ · _Design: 8_
  - [ ] 12.3 Differential check (Property P10): the Result of every Pattern, every regression JSON, and the generated Cases of the earlier spec (default seed and two other seeds) is the same before and after. Existing tests are unchanged and pass.
    - _Requirements: 7.4, 8.1_ · _Property: P10_
  - [ ] 12.4 Run the real-stack runner again and update the expected reasons if the compared text includes the hint. Run the quality gate.

- [ ] 13. Result documents
  - [ ] 13.1 Write `docs/REAL_STACKS.md` (Japanese) and `docs/REAL_STACKS.en.md` (English): the table of Patterns (ground truth, prediction, Result, class, reasons), how to run `pnpm real-stacks`, the wrong predictions, and the sentence that the Patterns are a sample and not a claim about typical projects. Repeat the statement of what the Lean check proves from Requirement 6.5. Add nothing that says or implies more than the table shows.
    - _Requirements: 6.1, 6.2, 6.3, 6.5_
  - [ ] 13.2 Add a link from `README.md` (Japanese, one sentence) to the documents. Do not remove or rewrite existing text.
    - _Requirements: 6.1_

- [ ] 14. README position and changelog (as the user decided)
  - [ ] 14.1 Apply what the user decided at the gate. If the results show that many realistic stacks are rejected, write that in plain words in the README and name the common causes (managed policies, non-literal `Resource`, trust conditions) (Requirement 6.4). Add additions only to existing Japanese documents.
  - [ ] 14.2 Changelog and version: write an entry only if the user asks for one. Do not change the version, create a tag, or publish. If the user chooses another version, change it in the nine places listed in the earlier spec's record, and run the quality gate.
    - _Requirements: 6.4, 8.4_

- [ ] 15. Final verification
  - [ ] 15.1 On a clean build (delete `dist` and `cdk.out` of the packages and examples), run `pnpm quality`, `typecheck`, `test`, `pack:check`, `synth`, both `synth:proofgate` commands, `verify:demo`, and `pnpm real-stacks`, judged by the Command success criteria.
    - _Requirements: 8.1_
  - [ ] 15.2 Check against `main`: no existing test file changed except additions, no file deleted, no `skip`/`only`/`todo`, no change of dependency, lockfile entry for an external package, toolchain pin, or tarball content (`pack:check` passes and lists the same four packages).
    - _Requirements: 8.2, 8.3_ · _Property: P9_
  - [ ] 15.3 Lean audit (no `sorry`, no `axiom`), `git diff --check`, and a scan of the added lines for credentials and tokens.

## Phase 5: Record and summary

- [ ] 16. Kiro work record and write-up material
  - [ ] 16.1 Review the usage log for this spec: each session has a row, wrong predictions and surprises are included, the probes are described as probes, and the result of the decision gate is recorded.
    - _Requirements: 9.1, 9.2_
  - [ ] 16.2 Write `summary.md` in the spec directory (English, for the submission): what was tried, what was found, what is not shown. Do not say that ProofGate works on typical projects beyond the table. Update the Serena memories and `AGENTS.md` if they became stale.
    - _Requirements: 6.3, 9.3_
  - [ ] 16.3 **CHECKPOINT 3.** Report the files changed, the findings, the open risks, and the diff. Stop and wait. Do not push or merge.

## Checkpoints

The work stops, reports, and waits for the user at each of these.

| # | Where | What is reported |
| --- | --- | --- |
| 1 | Task 0.6 | Baseline, report format, construct findings, and the answer to D1 (RS-14 or not) |
| 2 | Task 11.2 | The decision gate: the table, the criteria, the options |
| 3 | Task 16.3 | Files changed, findings, open risks, diff |

Push and merge are never done without the user's approval.

## Dependency order

```
0 [CP1] -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9 -> 10 -> 11 [CP2] -> (user's decision) -> 12 -> 13 -> 14 -> 15 -> 16 [CP3]
```

Task 6 (predictions) must be committed before Task 8 (the runner) exists, and Task 5 must not run ProofGate on any Pattern.

## Property coverage map

| Property | Tasks |
| --- | --- |
| P1 | 5.1 |
| P2 | 1.1, 1.3 |
| P3 | 10.7 |
| P4 | 8.2, 10.3, 10.5 |
| P5 | 7.2, 10.4 |
| P6 | 6.2 |
| P7 | 10.5 |
| P8 | 9.1 |
| P9 | 1.2, 8.4, 15.2 |
| P10 | 12.3 |
| P11 | 4.3, 10.3 |
| P12 | 10.4 |

## Requirement coverage map

| Requirement | Tasks |
| --- | --- |
| 1 Catalogue | 1, 2, 3, 4, 5 |
| 2 Predictions | 6, 9, 10.2 |
| 3 Runner | 0.3, 8, 10.5 |
| 4 Classification | 7, 10.1, 10.3, 10.4 |
| 5 Fail Closed | 4, 10.7 |
| 6 Documents | 13, 14.1, 16.2 |
| 7 Handling of findings | 10.2, 12 |
| 8 Existing behavior and release | 0.2, 1.2, 14.2, 15 |
| 9 Kiro work record | 0.1, 16 |
| 10 Decision gate | 11 |
