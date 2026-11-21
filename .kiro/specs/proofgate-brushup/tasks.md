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
- [x] 1. **Checkpoint 0.** Passed (the user approved Step 1).

## Step 1: Generated tables, no behavior change

- [x] 2. Create branch `brushup/phase-1-tables`.
  - [x] 2.1 Write `scripts/sync-service-reference.mjs` (dev-time, network, never run by tests or CI): downloads the index and the service files to a temporary directory, extracts `OBJECT_ACTIONS`, `BUCKET_GRANT_ACTIONS`, and `LAUNCH_ACTIONS` as in design sections 3 to 5, writes `packages/core/src/aws-tables.generated.ts` with a header (source, date, counts), deletes the downloads. Done: the script keeps the downloads in memory (no temporary files), has `--from-dir` for an offline run and `--out`/`--date`; the output is deterministic (same file on a second run, and a network run gave the same file as the offline run). Result: 44 object actions, 7 bucket grant actions, 988 launch actions (23 without a passed-to service), 726 tagging-only actions excluded. Two points found while checking: `iam:PassRole` itself appeared as a launch action for EC2 (an iam operation authorizes it) and would have made every PassRole holder an EC2 launcher, so the script excludes it; and actions of other services that an operation authorizes on the side are not taken.
  - [x] 2.2 Commit the generated module. A test checks the spot values of design section 3 and the counts (`tests/aws-tables.test.ts`, 7 tests). Honest note: this step has no red-first run, because the tests check generated data; I looked at the generated values once while writing them, and wrote the expected values from the AWS pages read earlier (ECS and S3 pages, the Lambda API reference).
  - [x] 2.3 Add the trust assumption to `docs/ASSUMPTIONS.md` (ja + en). No evaluator code uses the tables yet. Gate; usage-log row.
- [x] 3. **Checkpoint 1.** Passed. Steps 0 and 1 were merged to `main` with PR #14 (merge commit `1833876`, CI passed) at the user's request; the user then approved Step 2.

## Step 2: B1 complete S3 access

- [x] 4. Create branch `brushup/phase-2-s3`.
  - [x] 4.1 Change the independent oracle to read the tables (object actions on the object set, bucket grant actions on the bucket ARN). Commit it alone. Done (`cc135eb`). The oracle reads the data through a new file `tests/pbt/support/aws-facts.ts`, which only re-exports the generated tables, so the existing independence test (no production imports in `oracle.ts`) still holds; I added a test that `aws-facts.ts` contains nothing but that re-export. Limit: the oracle and the evaluator now share the same AWS data, so an error in the data would not be caught by their comparison; `tests/aws-tables.test.ts` checks spot values against the AWS pages.
  - [x] 4.2 Tests first (oracle, evaluator, one Lean launch) for each of: `GetObjectVersion`, `DeleteObjectVersion`, `PutObjectAcl`, `ReplicateObject`, `PutBucketPolicy` on the bucket ARN, `PutBucketAcl`, a bucket ARN with an object action (still no access), another bucket (no access). Show them red. Done (`tests/pbt/s3-access.test.ts`, 34 rows): before the evaluator change 23 tests failed (every row that 1.1.2 misses) and 12 passed (every safe row); one row I had named confusingly was a duplicate and was removed before the evaluator change.
  - [x] 4.3 Change `bucketAccessStatements` in `core`. Extend the model generator on a separate random stream (new tag for bucket grants). Differential against 1.1.2: no finding lost. Done: `core` reads the tables (`s3:*` is kept in the object list so that no finding of 1.1.2 disappears); 3038 inputs, 0 findings lost, 268 inputs gain a finding (266 generated model cases, 2 regression cases), no real-stack Pattern of the acceptance, hold-out, or construct sets changes. RS-44 and RS-45 are now `PG-IAM-004`, as predicted. The model generator got 3 object-action forms and 10 fixed boundary cases; that shifts the indices of all generated cases (the content of a case for a given index differs from before; replay by index of an old report is not possible, and none is stored). Extra seeds 12345 and 987654321 pass. 4 regression JSONs added.
  - [x] 4.4 Docs (ja + en), CHANGELOG Unreleased. Gate; usage-log row.
- [x] 5. **Checkpoint 2.** Passed. The user asked to merge Step 2 together with the oracle fix (PR #16). `main` (PRs #15 and #16) was merged into `brushup/phase-2-s3`; the conflicts (usage log, `ASSUMPTIONS.md`) were resolved by keeping both sides, and the Step 2 function `resourceReachesBucketArn` was updated for the oracle that no longer has a colon option.

## Step 3: B3 templates without IAM resources

- [x] 6. Create branch `brushup/phase-3-roleless`.
  - [x] 6.1 Tests first: no IAM resource is accepted with no finding and no Lean run; still rejected: empty `protectedBucketArns`, an unreadable template, an unsupported IAM resource, a policy that points outside the template, roles without readable statements. Done (`tests/roleless-templates.test.ts`, 22 tests): before the change 8 failed (the accepted cases) and 14 passed (the cases that stay rejected). **Hardening found while implementing, not in the design:** a template with a nested stack, a `Transform` or `Fn::Transform`, an `AWS::Serverless::` resource, or an entry that cannot be read is not accepted (it used to be caught by accident by the "no roles" finding; accepting it would have let a nested-stack parent pass silently).
  - [x] 6.2 Change the extractor and the validator (design 6). List the existing assertions that change (the generator's `no-iam` kind and any test of "No IAM roles were found") and ask the user at the checkpoint. Done; two existing assertions changed (see the usage log): the `no-iam` kind of the extractor-level generator (`tests/pbt/support/template-gen.ts`, now expects an empty model), and the entry "a template without any IAM role" of `tests/pbt/failclosed.test.ts` (it held `AWS::S3::Bucket` only; now it holds a nested stack only, which stays rejected; the accepted case moved to the new test file). Nothing was deleted or skipped. The second one was not on my list: I found it when the full test run failed.
  - [x] 6.3 Docs (ja + en) say what "accepted" means here. Run RS-30 and RS-31. Gate; usage-log row. Done: RS-30 and RS-31 are `accepted` as predicted; the other construct Patterns, the hold-out set, and the 14 acceptance Patterns do not change; differential against 1.1.2 (3038 inputs): 0 findings lost, 34 generated fragments move from `PG-IAM-003` to accepted (all of the kind "no IAM resource").
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
  - [ ] 10.4b From the data verification of 2026-11-21 (`data-verification.md`): normalize a trust principal of the form `<service>.<region>.amazonaws.com` to `<service>.amazonaws.com` before comparing with the launch table (Step Functions documents both forms); decide how to read the 23 any-service entries; tests first for both.
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

## Data verification (2026-11-21, after Step 2)

The user asked for a thorough check of the AWS data that the oracle and the evaluator share. Result and findings: [data-verification.md](./data-verification.md). Done on `brushup/data-verification`: the launch table rule was corrected (996 to 879 actions; read actions removed), independent S3 User Guide expectations were added to `tests/aws-tables.test.ts`, and 44 decisions of the real IAM engine were saved with a test that fixes the known deviations of the oracle (a `*` crossing a colon) and of the evaluator (case, over-approximation). Follow-ups a to e of section 5 of that document wait for the user's decision.

Follow-up b of the data verification (the oracle reads `*` and `?` as plain wildcards that also stand for a colon; the tag `ARN_STAR_SPAN` removed) was done on 2026-11-21 at the user's request: see section 7 of `data-verification.md`. Follow-ups a, c, d, and e still wait for the user's decision.
