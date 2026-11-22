# Tasks: proofgate-self-escalation
Status: DRAFT, awaiting the user's approval of the design (points 10.1 to 10.5 of [design.md](./design.md)). Nothing is implemented.
Requirements: [requirements.md](./requirements.md) (approved 2026-11-22). Design: [design.md](./design.md). Evidence: [data-verification.md](./data-verification.md).
Time box: see design section 11. Code starts after Step 7 of the brushup is closed, or when the user says so.
Branches: one per step, from `main`: `selfesc/step-1-evidence`, `selfesc/step-2-core-lean`, `selfesc/step-3-release-prep`. Committing is allowed. Push and merge need the user's approval; each step is merged on its own.
Rules for every task: Fail Closed stays; changes only add findings or rejections; no existing test or assertion is deleted, skipped, or weakened (a change that the work forces is listed at a checkpoint and needs the user's approval); the oracle is changed first and committed alone; every rule is test-first and the failing run is recorded; no dependency or toolchain change; no publish, tag, or release. After each task run the quality gate, and after each change of the oracle or the support files run the temporary typecheck of `tests/`.

## Step 1: Evidence and Patterns, no rule code
- [ ] 1. Create branch `selfesc/step-1-evidence`.
  - [ ] 1.1 Finish `data-verification.md`: confirm in the Service Authorization Reference (or the Service Reference JSON) the resource type of `iam:PutRolePolicy`, `iam:AttachRolePolicy`, `iam:UpdateAssumeRolePolicy`, and `iam:CreateRole`. Record what was read.
  - [ ] 1.2 Write the Patterns RS-63 and later under `examples/real-stacks/src/policy-write-probe/` (own catalogue, runner option `--policy-write`): per shape one unsafe and one safe layout (self-grant by `PutRolePolicy` and by `AttachRolePolicy`; take-over with a target that reaches the bucket and one that does not; creation grant), a scoped layout (the role may write only to another role that cannot reach the bucket), an administrator role (`Action: "*"`), and a pipeline role listed in `allowedPolicyWriters` (this one needs the runner to pass a config; see 1.5).
  - [ ] 1.3 Write `data/policy-write-probe-predictions.json` (ground truth, Result on `main`, Result after the spec) and commit it **alone**. Never edit it afterwards. Record the benchmark prediction: 60 of 91 (+8).
  - [ ] 1.4 Run the Patterns on the unchanged code and record the baseline `data/policy-write-probe-baseline.json`. Record each difference from the prediction. RS-49 is in the incident set; record its prediction for after the spec (`PG-IAM-005`) in the same file.
  - [ ] 1.5 Decide how a Pattern passes `allowedPolicyWriters` (the runner uses one fixed config today). Smallest change: an optional `config` field of a Pattern. Tests first for the runner.
- [ ] 2. **Checkpoint 1.** Report the evidence, the Patterns, and the baseline. Wait for the user's approval of the design points and of Step 2.

## Step 2: Oracle, core, Lean, validator
- [ ] 3. Create branch `selfesc/step-2-core-lean`.
  - [ ] 3.1 Write the table `packages/core/src/policy-write-actions.ts` (one source per entry) and its shape test (like `implicit-actions`). Add the data-only re-export `tests/pbt/support/aws-policy-write.ts`.
  - [ ] 3.2 Change the independent oracle (the three shapes, its own role ARN matcher, `allowedPolicyWriters`, `allowedPassRoleTargets` for the take-over). Run the temporary typecheck of `tests/`. Commit it alone.
  - [ ] 3.3 Adapt the existing model-level generator so that its plan labels stay correct (design section 7). Show which cases fail first and why, as a harness error, and list the change at the checkpoint.
  - [ ] 3.4 Tests first: fixed rows for every shape and exclusion of design section 7 (oracle, evaluator, one Lean launch); a model-level generator stream on a separate random stream; validator tests (the text, the `fix`, `allowedPolicyWriters`). Show them red.
  - [ ] 3.5 Add `RULE_ID_POLICY_WRITE`, the `Violation.ruleId` union, and `allowedPolicyWriters` to `packages/model`. Generalize `resourceDenoted` (design section 5). Implement the shapes in `evaluate`. Add `PolicyWritePath` to the Lean sources, extend `generateLean` and the strict shape of the batch runner, update `docs/PROOFS.md`. Lean audit (no `sorry`, no `axiom`). Evaluator and Lean agree on every Case. Mutants: ignore the exemption, ignore `iam:*`, count a bare name, skip the creation grant intersection, treat P = T as a take-over.
  - [ ] 3.6 Differential against the previous `main` (no finding lost; list every new finding of the existing Pattern sets); run all Pattern sets and update each expected table row by row with a reason; rerun the pathfinding.cloud benchmark and record `observedAfterPolicyWrite`. Gate; usage-log row.
- [ ] 4. **Checkpoint 2.** If the Lean change is not finished by 2026-12-01, report it and merge only Step 1 and the table, the oracle, and the Patterns (design section 11).

## Step 3: Docs and release preparation
- [ ] 5. Create branch `selfesc/step-3-release-prep`.
  - [ ] 5.1 `docs/SUPPORTED_IAM.md`, `docs/ASSUMPTIONS.md` (the over-approximations and the not-modeled list of design sections 8 and 9), the adoption guide in `README.md` and `packages/cdk-plugin/README.md` (the administrator-role and pipeline-role advice, `allowedPolicyWriters`), `docs/REAL_STACKS.md` and the English file, `CHANGELOG.md`, steering and `AGENTS.md`.
  - [ ] 5.2 Final verification on a clean build: quality, typecheck, test, pack:check, synth, verify:demo, all Pattern sets, the trial app (add a variant with `iam:AttachRolePolicy` on `*`), differential, Lean audit, `git diff --check`, scan of added lines for credentials.
- [ ] 6. **Checkpoint 3.** Version, publish, tags, and releases only on the user's instruction (proposal: 1.2.0 together with the brushup).
