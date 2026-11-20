# Tasks: proofgate-cdk-construct-support
Status: APPROVED by the user. In progress. The box of each task shows its state.
Requirements: [requirements.md](./requirements.md) (approved). Design: [design.md](./design.md) (approved). Properties `P1` to `P12` are defined in design section 12.
Branches: stacked, one per phase, starting from `support/spec` (which is based on `realstacks/phase-3-runner`): `support/phase-0-holdout`, `support/phase-1-r0`, `support/phase-2-r3-r2`, `support/phase-3-r1`, `support/phase-4-verify`, `support/phase-5-docs`. Committing on these branches is allowed. Push and merge need the user's approval.
Last day for code changes (Requirement 7.3, assumption D2): 2026-11-29. Code not finished by then is not merged and the result is reported as it is.
Rules for every task: Fail Closed stays; an unknown part of an `Allow` is read larger, never smaller; no existing test or assertion is deleted, skipped, or weakened; Lean, `StackModel`, rule IDs, and the validator API do not change; no dependency change. After each task run the quality gate; if the hook reports a failure, the task is not complete.

## Phase 0: Hold-out Patterns (design section 9)
- [x] 0. Create branch `support/phase-0-holdout`.
  - [x] 0.1 Write the Patterns RS-15 to RS-22 under `examples/real-stacks/src/holdout/` (not `src/patterns/`, because `tests/real-stacks-table.test.ts` requires every file there to be in the main table), registered in `holdout/catalog.ts`. `createApp` can select them; the runner runs them with `--holdout`. Commit `787929d`.
  - [x] 0.2 Write `holdout-predictions.json` (ground truth and predicted Result for each Pattern, before any implementation) and commit it **alone** in its own commit. It is never edited afterwards.
  - [x] 0.3 Run the hold-out Patterns on the unchanged code and record the baseline (not used to design rules). Result: 8 of 8 baseline predictions matched, saved in `data/holdout-baseline-1.0.1.json`. Add a usage-log row.
- [ ] 1. **Checkpoint 0.** Stop and wait for the user.

## Phase 1: R0, unnamed role as a PassRole target
- [x] 2. Create branch `support/phase-1-r0`.
  - [x] 2.1 Change the independent oracle (`tests/pbt/support/oracle.ts`, `passRoleResourceMatches`) to the rule of design 2.3. Commit it alone (`54b83c6`). Review it before touching the evaluator, so it is not copied from the code. Review so far: by me only; the user may review that commit.
  - [x] 2.2 Add unit tests for the table of design 2.3 and generator Cases with unnamed roles (categories `unsafe`, `safe`, `conservative`). Show them failing on the unchanged evaluator (red first). Done: 7 regression JSONs `r0-*` and `tests/pbt/unnamed-role.test.ts` (10 patterns x named/unnamed, oracle, evaluate, and one Lean launch). Red: exactly the 4 rows r0-1 to r0-4 failed on the old evaluator, the 3 safe rows passed. The generator itself was not changed (it would shift every existing seed); the enumerated test replaces the generator Cases.
  - [x] 2.3 Fix `allowsPassRoleTarget` in `packages/core/src/index.ts`. Check TypeScript and Lean agree on the new Cases. Properties P6, P10.
  - [x] 2.4 Add a regression JSON under `tests/pbt/regressions/`. Update `docs/SUPPORTED_IAM.md` and `docs/ASSUMPTIONS.md` for the rule.
  - [x] 2.5 Run the quality gate, `pnpm verify:demo`, and `pnpm real-stacks`. Record any row that changes. Add a usage-log row.
- [ ] 3. **Checkpoint 1.** Stop and wait for the user. Steps 0 to 3 can be merged without Phase 3 (design section 10).

## Phase 2: R3 and R2
- [ ] 4. Create branch `support/phase-2-r3-r2`.
  - [ ] 4.1 R3: tests for a `Condition` on an `Allow` trust statement (red first), then implement in `parseTrustServices`. A `Condition` on a permission statement stays `PG-IAM-003`. Property P3.
  - [ ] 4.2 R2: `packages/extractor/src/managed-policies.ts` with only `AWSLambdaBasicExecutionRole` (literal ARN and the `Fn::Join` form of the sample). Tests (red first), including an unknown managed policy staying `PG-IAM-003`.
  - [ ] 4.3 Extend extractor-level generated tests and the poison list. Run the gate. Add a usage-log row.
- [ ] 5. **Checkpoint 2.** Stop and wait for the user.

## Phase 3: R1, the resolver
- [ ] 6. Read the S3 bucket return-values page (`Ref`, `GetAtt Arn`) of the AWS documentation before writing code. Record what was read.
- [ ] 7. Create branch `support/phase-3-r1`.
  - [ ] 7.1 Tests for `Fn::Join`, pseudo-parameters (`*`), `Ref` and `Fn::GetAtt` to in-template resources, with and without names (red first). The poison list: parameter, `ImportValue`, unknown attribute, unknown resource type, `Fn::Sub`.
  - [ ] 7.2 `packages/extractor/src/resolve.ts` and its use in `parseStatements` and the role loop. Partial models are never returned. Properties P3, P4, P5.
  - [ ] 7.3 Opaque generated names `_generated_<LogicalId>` for unnamed roles and buckets, in the evaluator (design section 5). New tag `GENERATED_NAME` in the generator. Property P7.
  - [ ] 7.4 Self-check mutants of design 8.4, each detected (P12). Run the gate. Add a usage-log row.
- [ ] 8. **Checkpoint 3.** Stop and wait for the user.

## Phase 4: Verification
- [ ] 9. Create branch `support/phase-4-verify`.
  - [ ] 9.1 Differential run of 1.0.1 against the new code over the 14 Patterns, regression cases, and generated fragments. No 1.0.1 finding may disappear (P1). Print the list of inputs that moved from `PG-IAM-003` to accepted, with the rule (P2).
  - [ ] 9.2 Acceptance run: update the expected table of the real-stack runner one reviewed row at a time and compare with Requirement 1 (P8). Any difference from the target is listed for the user's approval.
  - [ ] 9.3 Hold-out run, once (P9). Report every Result, including Patterns still rejected. Do not change a rule after seeing it without recording that as a new decision.
  - [ ] 9.4 Run the gate, `pnpm verify:demo`, `pnpm synth`, `pnpm pack:check`.
- [ ] 10. **Checkpoint 4.** Stop and wait for the user.

## Phase 5: Documents
- [ ] 11. Create branch `support/phase-5-docs`.
  - [ ] 11.1 Update `docs/SUPPORTED_IAM.md`, `docs/ASSUMPTIONS.md`, `docs/architecture.md` with the new reading and the trust assumptions of design section 6. Wording: the Lean check covers the generated finite model, not CloudFormation or IAM semantics.
  - [ ] 11.2 Resume the paused Phase 4 of `proofgate-real-stack-validation` (message hints, result docs). README and CHANGELOG entry. Version and publish only on the user's instruction.
  - [ ] 11.3 Update Serena memories and `AGENTS.md` for both follow-up specs. Add the final usage-log row.
- [ ] 12. **Checkpoint 5.** Stop and wait for the user. Push, merge, tag, release, and `npm publish` need explicit approval.
