# Tasks: proofgate-kiroween-submission

Status: DRAFT (2026-11-23), waiting for the user's approval. Requirements: [requirements.md](./requirements.md) (revision 3). Design: [design.md](./design.md) (approved, Option A).
Deadline: Dec 5, 2026, 07:00 JST (Dec 4, 2:00 PM PT). Planned submission: Dec 4 JST. Brushup code freeze: 2026-11-29.
Branches: one per step, from `main`: `submission/step-1-demo`, `submission/step-2-guide`, and so on. Committing is allowed. Push and merge need the user's approval; each step is merged on its own.
Rules for every task: no rule, matcher, or verdict changes; no dependency or toolchain change of the packages; Kiro does not publish, tag, or bump a version outside Step 3; no existing test or assertion is deleted, skipped, or weakened (a change that the work forces is listed at the checkpoint); English only under `docs/submission/`, `.devcontainer/`, and `.kiro`; no credentials anywhere; nothing is written as a trial or viewer result unless the user reported it. After each task run the quality gate; after each change under `tests/` run the temporary typecheck of `tests/`. Each session adds a row to the usage log.

| Step | Target date (JST) | Owner of the checkpoint |
| --- | --- | --- |
| 1 Demo sequence | 11-24 | user approves merge |
| 2 Trial kit and guide draft | 11-25 | user approves merge, sends the trial requests |
| 3 Release 1.2.0 | 11-27 prepared, 11-28 published | user merges and publishes |
| 4 After release: npm checks, dev container | 11-29 | user approves merge |
| 5 Comparison with cdk-nag | 11-29 | user approves merge |
| 6 Write-ups and description | 11-29 | user reviews the text |
| 7 Trials and the R3 decision | 11-30 to 12-02 | user runs trials; decides on 1.2.1 |
| 8 Video and submission | 12-02 to 12-04 | user records, uploads, submits |

## Step 1: Demo sequence (R2, R3 checklist)
- [ ] 1. Create branch `submission/step-1-demo`.
  - [ ] 1.1 Tests first: `tests/demo-fix.test.ts` runs `pnpm demo:fix` and checks the four steps (exit 0, exit 1 with `PG-IAM-004` in the report, the fix applied, exit 0 with conclusion `success`) and an unchanged `git status --porcelain`. Show it red (the script does not exist).
  - [ ] 1.2 Write `examples/vulnerable-app/fix.patch` (removes the `iam:PassRole` statement and its comment, 8 lines) and `scripts/demo-fix.mjs` (design 3.2: argument arrays, a copy under `.demo-fixed/`, one line per step, `--app-dir` for the npm copy later). Add `.demo-fixed/` to `.gitignore` and the root script `demo:fix`. Comments in Japanese with English beside.
  - [ ] 1.3 Add the step `pnpm demo:fix` to `.github/workflows/ci.yml` after the tests.
  - [ ] 1.4 Write `output-checklist.md` in this spec (design 4) from a real run of step 2 of the script.
  - [ ] 1.5 Gate, the `tests/` typecheck, `pnpm verify:demo` (still exit 1 with `PG-IAM-004`), `git diff --check`.
- [ ] 2. **Checkpoint 1.** Report the output of `pnpm demo:fix` and the CI log line. Wait for the user's approval to merge.

## Step 2: Trial kit and guide draft (R6, R1)
- [ ] 3. Create branch `submission/step-2-guide`.
  - [ ] 3.1 `docs/submission/trial-protocol.md` and `docs/submission/trial-sheet.md` (design 8): the task, what the observer may say, what is recorded, separate times, the version or commit used. `docs/submission/trial-results.md` with "not verified".
  - [ ] 3.2 `docs/GETTING_STARTED.en.md` (R1): what ProofGate is, the tools with exact versions, no AWS account, the manual fix path (design 3.4) and `pnpm demo:fix`, the expected exit codes and lines copied from a real run, the acknowledgement shown apart from the fix, what is not checked, what Lean covers. The version is marked "to be filled after the release". One English link line at the top of `README.md`.
  - [ ] 3.3 Run the guide once from a fresh clone on this machine, exactly as written, and fix every step that does not work as written.
- [ ] 4. **Checkpoint 2.** The user reviews the kit and the guide, approves the merge, and sends the trial requests.

## Step 3: Release 1.2.0 (R4, Option A)
- [ ] 5. Create branch `submission/step-3-release`.
  - [ ] 5.1 Tests first: the plugin's `version` equals the version in its `package.json`. Red with the fixed string `1.1.2`.
  - [ ] 5.2 `ProofGateValidator.version` reads its own `package.json`. Version 1.2.0 in the four package manifests and the private examples. `CHANGELOG.md`: "Unreleased" becomes "1.2.0 - <date>".
  - [ ] 5.3 Gate, `pnpm pack:check` (inspect the tarballs: Lean sources, no `.lake`, no test files), the differential against 1.1.2, the Lean audit, `pnpm verify:demo`, `pnpm demo:fix`.
- [ ] 6. **Checkpoint 3.** The user merges and publishes with `pnpm publish -r --access public`. Kiro does not publish or tag.

## Step 4: After the release (R4.4, R4.6, R5)
- [ ] 7. Create branch `submission/step-4-container`.
  - [ ] 7.1 Check the registry: `latest` 1.2.0 for all four packages. In a new directory outside the repository, run the four steps against the npm packages (`--app-dir`) and compare the exit codes and the violation text with the workspace run. The report shows `pluginVersion` 1.2.0.
  - [ ] 7.2 Add the CI job `npm-demo` (design 7.3).
  - [ ] 7.3 `.devcontainer/devcontainer.json` and `.devcontainer/post-create.sh` (design 5.1), with the timings written to `/tmp/proofgate-setup-times.txt` and the npm demo copy in `~/proofgate-npm-demo`.
  - [ ] 7.4 Measure in a new codespace (design 5.4: Kiro with `gh codespace create` if the login allows it, otherwise the user). Record the times. If the setup is over 10 minutes, stop and ask about a prebuild.
  - [ ] 7.5 Fill the version, the Codespaces entry, the free-quota text (design 5.3), and the measured times into `docs/GETTING_STARTED.en.md`.
- [ ] 8. **Checkpoint 4.** Report the times and the npm comparison. Wait for the merge approval.

## Step 5: Comparison with cdk-nag (R7)
- [ ] 9. Create branch `submission/step-5-comparison`.
  - [ ] 9.1 Write the plan in `docs/submission/comparison.md` (inputs, tools with exact versions, the rule pack, the commands, the question) and commit it **alone**, before any run.
  - [ ] 9.2 Create `comparison/cdk-nag/` (design 6.1) with its own lockfile; add ignore entries for the quality tools if they scan it. Check that `pnpm-lock.yaml`, the root `package.json`, and the workspace packages are unchanged.
  - [ ] 9.3 Run the three tools on both inputs; store the raw outputs unchanged under `comparison/cdk-nag/results/`.
  - [ ] 9.4 Write the table. Keep a finding that more than one tool reports. Limit the claims to what was run.
- [ ] 10. **Checkpoint 5.** Wait for the merge approval.

## Step 6: Write-ups and description (R8, R9, R10, R12)
- [ ] 11. Create branch `submission/step-6-writeups`.
  - [ ] 11.1 `docs/submission/kiro-usage.md` from the usage log (design 9): one section per item of the rules, the D1 chain with five links, the RS-70 failure, the provenance, the trust boundary, the external review named as another AI's opinion, unused features named as unused. Every claim links a file or a commit.
  - [ ] 11.2 `docs/submission/description.md` (R12.1).
  - [ ] 11.3 Check every link of both files against the repository (a script that lists the links and checks that the files and commits exist).
- [ ] 12. **Checkpoint 6.** The user reviews the provenance facts and the text.

## Step 7: Trials and the R3 decision (R6, R3)
- [ ] 13. The user runs the two trials and sends the sheets.
  - [ ] 13.1 Kiro records the results in `trial-results.md` exactly as received, with the version or commit used.
  - [ ] 13.2 Kiro maps each observed confusion to the candidates C1 to C4 (design 4), smallest first, and proposes changes with the observation each one answers.
- [ ] 14. **Checkpoint 7.** The user decides: no product change (1.2.0 stays the submission version), or a product change released as 1.2.1 (then Steps 3 and 4.1 to 4.5 repeat for 1.2.1 by 12-02). Guide-only and example-only changes (C3, C4) need no release.

## Step 8: Video and submission (R11, R12)
- [ ] 15. Create branch `submission/step-8-video`.
  - [ ] 15.1 `docs/submission/video-script.md` (design 9), with every output taken from a run of the submission version on the day the script is written.
  - [ ] 15.2 A recording list: the commands in order, the terminal size and font, the lines to highlight, the diff, the Kiro evidence to show.
- [ ] 16. **Checkpoint 8.** The user records the video (under 3 minutes), uploads it to YouTube as public, and runs the one-viewer check (R11.4); Kiro records the result only as the user reports it.
- [ ] 17. Final check (Kiro, on the submission day): the repository, the guide, the codespace entry, the CI runs, and the npm version agree; the submission checklist in `.kiro/steering/kiroween.md` is ticked from evidence.
- [ ] 18. **Checkpoint 9.** The user checks the links from a logged-out browser and submits on Devpost by Dec 4 JST.
