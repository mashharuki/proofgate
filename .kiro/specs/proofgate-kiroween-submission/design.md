# Design: proofgate-kiroween-submission

Status: APPROVED by the user on 2026-11-23 with Option A of section 7.1. The other points of section 11 are taken as proposed; a prebuild (point 4) is asked again only if the first measurement is over 10 minutes. Requirements: [requirements.md](./requirements.md) (revision 3). Tasks: [tasks.md](./tasks.md).

## 1. Overview

All work produces material around the existing product; no rule, matcher, or verdict changes. The pieces depend on one fixed sequence (R2), so it is built first and every later piece reuses its commands and output.

```
R2 demo sequence (script + CI) ──> R1 English guide ──> R5 dev container ──> R6 trials (user)
        │                               │                                        │
        ├──> R7 comparison (cdk-nag)    ├──> R12 Devpost text                    └──> R3 output changes (if any)
        └──> R11 video script           └──> R8, R9, R10 write-ups                          │
                                                                                            v
                                             R4 release 1.2.0 (user publishes) ──> recording, submission
```

## 2. Where the files go

| Item | Path | Language |
| --- | --- | --- |
| Judge entry page (R1) | `docs/GETTING_STARTED.en.md`, linked from the first lines of `README.md` | English |
| Demo sequence (R2) | `scripts/demo-fix.mjs`, the fix `examples/vulnerable-app/fix.patch`, root script `demo:fix` | code; comments ja + en |
| Output checklist (R3) | `.kiro/specs/proofgate-kiroween-submission/output-checklist.md` | English |
| Dev container (R5) | `.devcontainer/devcontainer.json`, `.devcontainer/post-create.sh` | English |
| Trial protocol and sheet (R6) | `docs/submission/trial-protocol.md`, `docs/submission/trial-sheet.md`; results in `docs/submission/trial-results.md` | English |
| Comparison (R7) | `comparison/cdk-nag/` (own `package.json` and `package-lock.json`, outside the pnpm workspace), results in `docs/submission/comparison.md` | English |
| Write-ups (R8, R9, R10) | `docs/submission/kiro-usage.md` | English |
| Video script (R11) | `docs/submission/video-script.md` | English |
| Devpost text (R12) | `docs/submission/description.md` | English |

`docs/submission/` is new and English only. The existing Japanese docs are not changed except for one English link line in `README.md` (R1.1).

## 3. R2: the demo sequence

### 3.1 The stack and the fix

The stack is `examples/vulnerable-app` as it is. The fix is the smallest change that removes the path: delete the `iam:PassRole` statement (the comment `条件1` and the 7 lines of the statement after it). This was checked on 2026-11-23: with that statement removed, gated synth exits 0. The other permissions (`lambda:CreateFunction`, `lambda:UpdateFunctionCode`, `lambda:InvokeFunction` on `*`) stay, which shows that ProofGate does not reject wide Lambda permissions by themselves. It rejects the path to the protected bucket. The stack has no Lambda function, so the rule for paths without `iam:PassRole` has nothing to report.

The fix is stored as `examples/vulnerable-app/fix.patch`, a unified diff of `src/app.ts`. The guide and the video show this diff.

### 3.2 `scripts/demo-fix.mjs`

```
pnpm demo:fix            # four steps on the workspace packages
```

1. Plain synth of `examples/vulnerable-app` (`cdk synth --quiet`): expect exit 0.
2. Gated synth (`PROOFGATE=1`): expect exit 1 and the rule `PG-IAM-004` in `cdk.out/validation-report.json`.
3. Copy `src/` to `examples/vulnerable-app/.demo-fixed/src/`, apply `fix.patch` there with `git apply --directory`, print the diff, and compile it to `.demo-fixed/dist/` with the package's `tsc`. The copy lives under the app directory, so Node resolves `aws-cdk-lib` and the plugin from the app's `node_modules`. `.demo-fixed/` is added to `.gitignore`.
4. Gated synth of the fixed copy (`cdk synth --app "node .demo-fixed/dist/app.js" -o .demo-fixed/cdk.out`): expect exit 0 and conclusion `success` in its validation report.

The script prints one line per step (`step 2/4 gated synth: exit 1, PG-IAM-004 (as expected)`). It exits 0 only if all four match, and 1 otherwise. It runs commands with argument arrays, never through a shell. It removes `.demo-fixed/` at the start, and leaves it after the run so that the judge can open the fixed source. No tracked file changes (R2.2), and a test checks `git status --porcelain` before and after.

The stack names stay the same (`VulnerableAppStack`), so the fixed copy is the same stack with the fix, not another app (R2.3). The script does not use `acknowledge` or any allow list.

### 3.3 Checks (R2.4)

- `tests/demo-fix.test.ts` runs the script and checks the four exit codes and the clean `git status`. It runs only where `lake` is on `PATH` and is part of `pnpm test`, like the existing CDK integration test.
- `.github/workflows/ci.yml` gets a step `pnpm demo:fix` after the tests, so the log of every CI run shows the four steps. This log is the third judge entry (R5.4).
- After the release (R4), a second CI job runs the same four steps against `@proofgate-cdk/cdk-plugin@1.2.0` from npm (section 7.3).

### 3.4 The manual path for a person

The guide also tells the judge to make the edit by hand: delete those eight lines, run `pnpm --filter @proofgate-cdk/vulnerable-app build`, run the gated synth again, and see exit 0. Then `git checkout examples/vulnerable-app/src/app.ts` restores the file. The trials (R6) use the manual path, because that is the experience being tested.

## 4. R3: the output checklist

`output-checklist.md` maps the three questions to the current terminal output of step 2 and to the JSON report:

| Question | Terminal (today) | Only in `validation-report.json` |
| --- | --- | --- |
| Who? | `DeveloperRole58EC5A58`; the construct path `VulnerableAppStack/DeveloperRole/Resource` | the role name is not shown anywhere |
| Which data? | `arn:aws:s3:::proofgate-protected-data`; through `ProtectedDataRoleCDFF69BA` (logical ID only) | `ruleName: PG-IAM-004` |
| What to change? | three alternatives; the location `dist/app.js:23:1` (compiled JS, at the `Role` constructor) | `propertyPaths` with the three statements |

Candidates, not decisions (each needs an observation from R6 first, R3.3):

- C1 (wording only, product): name the statements to change in the terminal text (for example `the iam:PassRole statement and the lambda:CreateFunction statement of DeveloperRole`), and put the smallest fix first.
- C2 (product): print the construct path of the target role too.
- C3 (example config, not product): run the example app with `node --enable-source-maps`, so that the location points at `src/app.ts`. This changes `examples/*/cdk.json` only.
- C4 (guide only): explain in the guide that `Acknowledge with` records an exception and is not a fix.

C1 and C2 change the text of a violation. Existing tests assert parts of the text; any change to those assertions is listed for approval (R3.4). The rule ID, the verdict, the exit code, and the report fields stay the same.

## 5. R5: the dev container

### 5.1 Definition

- Base: `mcr.microsoft.com/devcontainers/base:ubuntu` with the Node.js feature `ghcr.io/devcontainers/features/node:1` at version `26.13.1` (the `.nvmrc` value). pnpm comes from Corepack with the `packageManager` field, so no pnpm version is added.
- `post-create.sh`: install elan with `--default-toolchain none` (the toolchain comes from `packages/cdk-plugin/lean/lean-toolchain`), then `pnpm install --frozen-lockfile`, `pnpm build`, `pnpm lean:build`. Each phase prints its duration, and the timings go to `/tmp/proofgate-setup-times.txt` for R5.3.
- No AWS CLI, no AWS feature, no credentials, and no secrets.
- Machine: 2 cores (the smallest). Judges pay nothing within the free quota (section 5.3).

The container runs the workspace packages by default. After the release, `post-create.sh` also prepares `~/proofgate-npm-demo`, a copy of the vulnerable app that installs `@proofgate-cdk/cdk-plugin@1.2.0` from npm, made by the same method as `examples/trial-app/scripts/prepare-npm-copy.mjs`. The guide runs the four steps there, so that what the judge sees is the published version (R4.1). The demo script takes `--app-dir <dir>` for this.

### 5.2 Time target

Target: under 10 minutes from "Create codespace" to "ready", and under 2 minutes for the four steps. The Lean toolchain download and `lake build` are expected to be the largest part. If the first measurement is over 10 minutes, the next step is a Codespaces prebuild, and the time is measured again. A prebuild uses the repository owner's Actions minutes and storage, not the judge's, so it needs the user's approval.

### 5.3 Cost to a judge (GitHub docs, read 2026-11-23)

- GitHub Free personal accounts include 120 core-hours of compute and 15 GB-month of storage per month for Codespaces. A 2-core machine uses 2 core-hours per hour, so this is 60 hours of the smallest machine. Usage is billed to the account that creates the codespace. Without a payment method, use is blocked when the quota runs out, and nothing is charged.
- Source: https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-codespaces/about-billing-for-github-codespaces
- The guide states this, and that a GitHub account is needed.

### 5.4 Who measures

Kiro tries `gh codespace create` with the user's `gh` login. If the login has no `codespace` scope, the user creates the codespace from the browser, runs the setup, and pastes `/tmp/proofgate-setup-times.txt`. A clean local measurement (R5.6) counts the codespace as the clean environment.

## 6. R7: the comparison

### 6.1 Placement

`comparison/cdk-nag/` at the repository root: its own `package.json` with exact versions, and an npm `package-lock.json`. It is outside `pnpm-workspace.yaml` (which lists `packages/*` and `examples/*`), so the workspace, the root `package.json`, and `pnpm-lock.yaml` do not change. Biome, Knip, and jscpd get an ignore entry for `comparison/` if they scan it (configuration only, no dependency change). `node_modules`, `cdk.out`, and `dist` there are ignored by git.

Pinned versions: `cdk-nag` 3.1.0 (npm `latest` on 2026-11-23; its peer range accepts `aws-cdk-lib` ^2.257.0), `aws-cdk-lib` 2.277.0, `constructs` and the CDK CLI at the repository's versions, `typescript` at the repository's version.

### 6.2 Inputs and runs

- Inputs: the R2 stack before the fix and after the fix. The source is copied from `examples/vulnerable-app/src/app.ts` and `fix.patch`, and one line adds `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))`. The copy is noted in the record.
- Tools and modes: (1) plain `cdk synth`; (2) `cdk synth` with `cdk-nag` `AwsSolutionsChecks`; (3) ProofGate (the R2 steps 2 and 4).
- Record: `docs/submission/comparison.md`. It holds the plan, written and committed before the run (the R7.1 items), then the raw outputs (stored unchanged under `comparison/cdk-nag/results/`), then the table. The table's question is "what can the reviewer decide about this change from this output", answered per tool and per input. If `cdk-nag` also reports a problem with the before-fix stack (for example a wildcard Resource), that row stays.

## 7. R4: release 1.2.0

### 7.1 Timeline problem

The requirements say: release after the R2 and R3 code changes (R4.2), the first trials on the current output (R3.2), the trials in the week of 2026-11-30 (R6.5), and the brushup code freeze on 2026-11-29. R3 changes can only be chosen after the trials, so they cannot land before the freeze. Two options:

- **Option A (chosen by the user, 2026-11-23):** release 1.2.0 by 2026-11-28 with R2 and the version fix, before the freeze. The trials use 1.2.0. If the trials show a confusion that needs a product change (C1 or C2), it ships as 1.2.1 by 2026-12-02, and 1.2.1 becomes the submission version for the guide, the video, and the test build. If no product change is needed, 1.2.0 stays the submission version.
- Option B: hold the release until after the trials (about 2026-12-02), with R3 changes merged after the freeze. This gives one version, but leaves no buffer before the recording and needs the user's approval of post-freeze merges.

Option A keeps the "one version everywhere" rule (R4.5) by making the submission version whatever is published last before the recording. It also means the trials test the published package.

### 7.2 Release preparation (Kiro, on a branch)

1. Version 1.2.0 in the four package manifests and the private examples (they share one version today).
2. `ProofGateValidator.version` reads the version from the package's own `package.json` at load time, instead of the fixed string. A test checks that it equals the manifest version (R4.6).
3. `CHANGELOG.md`: "Unreleased" becomes "1.2.0 - <date>". The public type changes stay listed (`Violation.ruleId` union, `allowedPolicyWriters`, optional `resources`).
4. The full gate, `pnpm pack:check`, the differential against 1.1.2, and the Lean audit.
5. Stop. The user merges, then publishes with `pnpm publish -r --access public`.

### 7.3 After publishing (Kiro)

- The registry shows `latest` 1.2.0 for all four packages.
- In a new directory, the four R2 steps run against the npm packages with the same exit codes and the same violation text as the workspace.
- A CI job `npm-demo` (on `workflow_dispatch` and on push to `main`) runs the four steps against the npm version, so judges can see a run that uses the published package without an account.
- Kiro creates no tag or GitHub release. If the user wants them, the user creates them as for 1.1.x.

## 8. R6: the trials

- The task given to the participant: "This repository has a CDK app that ProofGate rejects. Using only `docs/GETTING_STARTED.en.md`, find out why, change the CDK code so that the gate accepts it without an exception, and tell us when you are done."
- The observer says nothing beyond the protocol. A participant who asks is pointed back to the guide, and the question is recorded.
- Recorded: setup time and task time separately; the first place they looked in the output; which of the three questions they could answer from the terminal; what they changed; whether they used `acknowledge` or an allow list; the text they misread; their own words, written by the user.
- Results go into `trial-results.md` only from what the user sends. Until then the file says "not verified" (R6.3).
- Which version: 1.2.0 under Option A. If a trial runs before the release, the sheet records the commit.

## 9. R8 to R12: write-ups, script, description

- `kiro-usage.md` is built from `.kiro/steering/kiroween.md`, one section per item of the rules. It includes:
  - the D1 chain (R8, about 120 words, five links);
  - one caught failure, the RS-70 prediction;
  - the provenance statement (R9): the MVP of 2026-11-17 was built without Kiro, and Kiro work starts on 2026-11-18;
  - the trust boundary (R9.3);
  - the external mock review named as another AI's opinion (R9.2);
  - unused features named as unused (custom agents, powers, Kiro's built-in PBT).
- `video-script.md` is a table per scene: time, screen, command, the output lines to highlight, the narration, and the evidence link. Its scene plan follows the review's outline:
  - 0:00 the question and the two results side by side;
  - 0:15 the rejection, with the principal, the role, and the bucket highlighted and a drawn "who to which data" line;
  - 0:55 the fix diff and the pass;
  - 1:25 the D1 chain;
  - 1:55 the comparison row or the trial result, whichever exists by then;
  - 2:25 the try-it entry and the version.
  The outputs are taken from the submission version only.
- `description.md`: the problem, who it is for, the four steps, the Frankenstein statement (CDK validation plugins, Lean 4, the AWS Service Reference data, pathfinding.cloud data, an independent test oracle), the limits, and the links.

## 10. Risks

| Risk | Effect | Handling |
| --- | --- | --- |
| The codespace setup is slow (Lean toolchain download) | judges give up | measure first; prebuild with approval; CI log as an entry that needs no account |
| The trial participants are not available in time | no outside evidence | the submission states that no outside trial was done; nothing is invented (R6.4) |
| A post-trial product change cannot be released before recording | the video shows an older output | Option A: 1.2.0 is a complete fallback |
| The `cdk-nag` result is close to ProofGate's for this stack | the comparison shows little difference | it is published as it is (R7.2); the claim narrows to what was seen |
| The violation text differs between workspace and npm | the guide drifts | the npm CI job and the post-release check compare the text |

## 11. Points for the user's decision

1. Release timing: Option A (1.2.0 before the freeze, 1.2.1 only if the trials need a product change) or Option B (hold the release until after the trials).
2. File locations of section 2, in particular `docs/GETTING_STARTED.en.md` as the judge entry, and `comparison/` at the root.
3. The demo keeps the name `vulnerable-app` and the existing stack, rather than a new example app. A new app would be a copy, and the review asked for the same stack.
4. A Codespaces prebuild only if the first measurement is over 10 minutes, at the cost of the owner's Actions minutes and storage.
