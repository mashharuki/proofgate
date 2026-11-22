# Tasks: proofgate-implicit-role-paths
Status: APPROVED by the user on 2026-11-22 (design points 10.1 to 10.5 approved). Step 1 is done and waits for Checkpoint 1; nothing else is implemented.
Requirements: [requirements.md](./requirements.md) (approved 2026-11-21). Design: [design.md](./design.md).
Time box: see design section 11 (freeze 2026-11-29 for the brushup, deadline 2026-12-04 14:00 PT).
Branches: one per step, from `main`: `implicit/step-1-evidence`, `implicit/step-2-extractor`, `implicit/step-3-core-lean`, `implicit/step-4-release-prep`. Committing is allowed. Push and merge need the user's approval; each step is merged on its own.
Rules for every task: Fail Closed stays; changes only add findings or rejections; no existing test or assertion is deleted, skipped, or weakened (a change that the work forces is listed at a checkpoint and needs the user's approval); the oracle is changed first and committed alone; every rule is test-first and the failing run is recorded; no dependency or toolchain change; no publish, tag, or release. After each task run the quality gate.

## Step 1: Evidence and Patterns, no code
- [x] 1. Create branch `implicit/step-1-evidence`.
  - [x] 1.1 Read the AWS pages and record what was read (date, URL, what it says) in `data-verification.md` of this spec: Lambda `UpdateFunctionCode` and `UpdateFunctionConfiguration`, CodeBuild `StartBuild` and `StartBuildBatch`, Step Functions `UpdateStateMachine`; the CloudFormation resource pages for `Role`, `ServiceRole`, `RoleArn`. An action whose page does not confirm the behavior stays out of the table.
  - [x] 1.2 Write the Patterns RS-54 and later under `examples/real-stacks/src/implicit-probe/` (own catalogue, runner option `--implicit`): per service one unsafe layout (a role that may change the resource that runs as a bucket-reaching role) and one safe layout (the resource runs as a role that cannot reach the bucket, or nobody can change it), plus one unknown-role layout (role from a parameter, a statement that touches the resource), plus one layout where the resource ARN is scoped to another resource.
  - [x] 1.3 Write `data/implicit-probe-predictions.json` (ground truth, Result on `main`, Result after the spec) and commit it **alone**. Never edit it afterwards. Record the pathfinding.cloud prediction: 52 of 91 reported after the spec (lambda-003/004/005, codebuild-002/003, stepfunctions-002 added).
  - [x] 1.4 Run the Patterns on the unchanged code and record the baseline `data/implicit-probe-baseline.json`. Record each difference from the prediction.
- [ ] 2. **Checkpoint 1.** Report the evidence, the Patterns, and the baseline. Wait for the user's approval to start Step 2.

## Step 2: Model and extractor
- [ ] 3. Create branch `implicit/step-2-extractor`.
  - [ ] 3.1 Tests first (extractor level): the three resource types with a role by `GetAtt Arn`, by a literal ARN of a role of the template, by a parameter (`roleUnknown`), by `Fn::ImportValue` (`roleUnknown`), a missing property (`roleUnknown`); names (literal, opaque); a template without these types gives no `resources`. Show them red.
  - [ ] 3.2 Add `ResourceModel` and the optional `resources` to `packages/model`. Implement the reading in the extractor as a table. Gate.
  - [ ] 3.3 Tests first for the resolver narrowing (section 3 of the design): `Ref` and `GetAtt Arn` of the three kinds give the ARN pattern, not `*`; other kinds still give `*`. Implement. Differential against `main`: no finding lost, and list every statement whose Resource changed.
  - [ ] 3.4 Extractor-level generator stream and mutants (design section 8). Docs: `docs/SUPPORTED_IAM.md`. Gate; usage-log row.
- [ ] 4. **Checkpoint 2.**

## Step 3: Oracle, core, Lean
- [ ] 5. Create branch `implicit/step-3-core-lean`.
  - [ ] 5.1 Write the table `packages/core/src/implicit-actions.ts` with one source per entry; a test guards its shape (like `launch-supplements`). The oracle reads it through a data-only re-export.
  - [ ] 5.2 Change the independent oracle (implicit paths, own ARN matcher, `allowedPassRoleTargets`, unknown role). Commit it alone.
  - [ ] 5.3 Tests first: fixed rows for each action and kind (oracle, evaluator, one Lean launch), P = T, an allowed target, a scoped Resource, a bare logical ID, a glob, an unknown role (both the finding and the silence). Model-level generator stream. Show them red.
  - [ ] 5.4 Implement `evaluate` and `unknownRoleFindings` in `core`; the Lean structures and the new `generateLean`; the batch runner's shape check; `docs/PROOFS.md`. Lean audit (no `sorry`, no `axiom`). Evaluator and Lean agree on every Case.
  - [ ] 5.5 Validator: map `unknownRoleFindings` to `PG-IAM-003`, the violation text and fix for the implicit shape. Tests on the validator.
  - [ ] 5.6 Differential against `main` (no finding lost, new findings by kind); run all Pattern sets and update each expected table row by row with a reason (RS-48 changes to `PG-IAM-004`); rerun the pathfinding.cloud benchmark and record `observedAfterImplicit`. Gate; usage-log row.
- [ ] 6. **Checkpoint 3.** If the Lean change is not finished by 2026-12-01, report it and merge only Steps 1 and 2 (design section 11).

## Step 4: Docs and release preparation
- [ ] 7. Create branch `implicit/step-4-release-prep`.
  - [ ] 7.1 `docs/SUPPORTED_IAM.md`, `docs/ASSUMPTIONS.md` (the two over-approximations of design section 4, the not-modeled list), the adoption guide in `README.md` and `packages/cdk-plugin/README.md`, `docs/REAL_STACKS.md` and the English file, `CHANGELOG.md`, steering and `AGENTS.md`.
  - [ ] 7.2 Final verification on a clean build: quality, typecheck, test, pack:check, synth, verify:demo, all Pattern sets, the trial app (add the Sysdig 2025 shape as a variant), differential, Lean audit, `git diff --check`, scan of added lines for credentials.
- [ ] 8. **Checkpoint 4.** Version, publish, tags, and releases only on the user's instruction (proposal: 1.2.0 together with the brushup).
