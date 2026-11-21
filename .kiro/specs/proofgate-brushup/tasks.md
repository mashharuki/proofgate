# Tasks: proofgate-brushup

Status: APPROVED by the user on 2026-11-21 (design approved with its four open points). In progress. The box of each task shows its state.
Requirements: [requirements.md](./requirements.md). Design: [design.md](./design.md).
Last day for code changes: 2026-11-29. Code not finished by then is not merged and the result is reported as it is.
Branches: stacked, one per step, from `brushup/phase-0-patterns` (which holds the spec, Patterns RS-23 to RS-38 and their baseline): `brushup/phase-1-tables`, `phase-2-s3`, `phase-3-roleless`, `phase-4-sub-managed`, `phase-5-launch`, `phase-6-guide`. Each step is merged to `main` on its own, by a new branch from `main` that carries only that step (as for R0), after the user's approval. Committing on these branches is allowed. Push and merge need the user's approval.

Rules for every task: Fail Closed stays; changes only add findings or rejections, except Requirements 3, 4, 5 (approved as permissive); no existing test or assertion is deleted, skipped, or weakened (a change that the requirements force is listed at a checkpoint and needs the user's approval); the oracle is changed first and committed alone; every rule is test-first and the failing run is recorded; no dependency or toolchain change; no publish, tag, or release. After each task run the quality gate.

## Step 0: Patterns RS-39 to RS-47, predictions first

- [x] 0. Create branch `brushup/phase-0b-launch-patterns` from `brushup/phase-0-patterns`.
  - [x] 0.1 Write RS-39 to RS-47 of design section 10 under `examples/real-stacks/src/launch-probe/` (own catalogue, runner option `--launch`, selectable by `-c pattern=`). Each unsafe Pattern has a deploy role with `iam:PassRole` for the target role and the launch action, a target role that trusts the service and reads the protected bucket.
  - [x] 0.2 Write `data/launch-probe-predictions.json` (ground truth, Result on 1.1.2, Result after the spec) and commit it **alone**. Never edit it afterwards.
  - [x] 0.3 Run the Patterns on the unchanged code and record the baseline `data/launch-probe-baseline-1.1.2.json`. Compare with the predictions for 1.1.2 and record each difference. Done: 9 of 9 as predicted, no difference. On 1.1.2, RS-39, 41, 42, 43, 44, 45 (and RS-47, whose ground truth is unknown) are accepted although they hold the escalation path (false negatives); RS-40 is rejected because of `AWS::IAM::InstanceProfile`; RS-46 is correctly accepted.
- [ ] 1. **Checkpoint 0.** Stop and wait for the user.

## Step 1: Generated tables, no behavior change

- [ ] 2. Create branch `brushup/phase-1-tables`.
  - [ ] 2.1 Write `scripts/sync-service-reference.mjs` (dev-time, network, never run by tests or CI): downloads the index and the service files to a temporary directory, extracts `OBJECT_ACTIONS`, `BUCKET_GRANT_ACTIONS`, and `LAUNCH_ACTIONS` as in design sections 3 to 5, writes `packages/core/src/aws-tables.generated.ts` with a header (source, date, counts), deletes the downloads.
  - [ ] 2.2 Commit the generated module. A test checks the spot values of design section 3 and the counts.
  - [ ] 2.3 Add the trust assumption to `docs/ASSUMPTIONS.md` (ja + en). No evaluator code uses the tables yet. Gate; usage-log row.
- [ ] 3. **Checkpoint 1.**

## Step 2: B1 complete S3 access

- [ ] 4. Create branch `brushup/phase-2-s3`.
  - [ ] 4.1 Change the independent oracle to read the tables (object actions on the object set, bucket grant actions on the bucket ARN). Commit it alone.
  - [ ] 4.2 Tests first (oracle, evaluator, one Lean launch) for each of: `GetObjectVersion`, `DeleteObjectVersion`, `PutObjectAcl`, `ReplicateObject`, `PutBucketPolicy` on the bucket ARN, `PutBucketAcl`, a bucket ARN with an object action (still no access), another bucket (no access). Show them red.
  - [ ] 4.3 Change `bucketAccessStatements` in `core`. Extend the model generator on a separate random stream (new tag for bucket grants). Differential against 1.1.2: no finding lost.
  - [ ] 4.4 Docs (ja + en), CHANGELOG Unreleased. Gate; usage-log row.
- [ ] 5. **Checkpoint 2.**

## Step 3: B3 templates without IAM resources

- [ ] 6. Create branch `brushup/phase-3-roleless`.
  - [ ] 6.1 Tests first: no IAM resource is accepted with no finding and no Lean run; still rejected: empty `protectedBucketArns`, an unreadable template, an unsupported IAM resource, a policy that points outside the template, roles without readable statements.
  - [ ] 6.2 Change the extractor and the validator (design 6). List the existing assertions that change (the generator's `no-iam` kind and any test of "No IAM roles were found") and ask the user at the checkpoint.
  - [ ] 6.3 Docs (ja + en) say what "accepted" means here. Run RS-30 and RS-31. Gate; usage-log row.
- [ ] 7. **Checkpoint 3.** Needs the user's approval of the changed assertions.

## Step 4: B4 `Fn::Sub` and B5 managed policies

- [ ] 8. Create branch `brushup/phase-4-sub-managed`.
  - [ ] 8.1 Read the CloudFormation `Fn::Sub` page (escape `${!...}`, the variable map form) and the two AWS managed policy pages (statements, version). Record what was read.
  - [ ] 8.2 B5 tests first, then the two table entries. Any other managed policy stays rejected.
  - [ ] 8.3 B4 tests first (known variables, `${!x}`, unknown name, parameter, variable map, policy variable inside the text), then the resolver. Extend the extractor-level generator on a separate stream and add poisons and mutants.
  - [ ] 8.4 Docs, CHANGELOG. Run RS-23, RS-32, RS-37. Gate; usage-log row.
- [ ] 9. **Checkpoint 4.**

## Step 5: B2 launch services

- [ ] 10. Create branch `brushup/phase-5-launch`.
  - [ ] 10.1 Change the oracle to the generalized path (service, launch action, trust of the same service, `*` trust for every service) and to the `PG-IAM-003` rule of design 5.4. Commit it alone.
  - [ ] 10.2 Tests first for every service of RS-39 to RS-47, Lambda regression cases, the tagging-only exclusion, the unknown-service rejection, and `*` trust. Show them red.
  - [ ] 10.3 Change `core` (candidate paths per service, violation text with the service) and the Lean sources (`canLaunch`, `targetTrustsService`, `service`), `generateLean`, the batch runner's shape check, and `docs/PROOFS.md`. Lean audit (no `sorry`, no `axiom`). Evaluator and Lean must agree on every Case.
  - [ ] 10.4 Extractor: read `AWS::IAM::InstanceProfile` (design 5.3).
  - [ ] 10.5 Differential against 1.1.2: no finding lost; list the new findings by service. Run all Pattern sets; update each expected table row by row with a reason.
  - [ ] 10.6 Docs (ja + en), CHANGELOG. Gate; usage-log row.
- [ ] 11. **Checkpoint 5.**

## Step 6: Adoption guide and final verification

- [ ] 12. Create branch `brushup/phase-6-guide`.
  - [ ] 12.1 Write the guide (design 9) in `README.md` and `packages/cdk-plugin/README.md`; check each statement against the trial app.
  - [ ] 12.2 Update `docs/REAL_STACKS.md` and the English file with the new Patterns and the trial. Update Serena memories, `AGENTS.md`, and steering.
  - [ ] 12.3 Final verification on a clean build: quality, typecheck, test, pack:check, synth, verify:demo, all Pattern sets, the trial app, differential, Lean audit, `git diff --check`, and a scan of added lines for credentials.
- [ ] 13. **Checkpoint 6.** Version, publish, tags, and releases only on the user's instruction (proposal: 1.2.0).

## Step 7: More trials until 2026-11-29

- [ ] 14. For each new construct or layout tried: write the prediction first, run, record. A fix that a trial shows follows Requirements 7 and 9 and is merged alone.
