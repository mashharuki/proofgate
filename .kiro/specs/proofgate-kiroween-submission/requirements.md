# Requirements: proofgate-kiroween-submission

Status: APPROVED by the user on 2026-11-23 (revision 2, with the decisions recorded below). Revision 3 (2026-11-23): R4 follows Option A of the approved design (section 7.1). Revision 4 (2026-11-23): R9.1 and R9.2 changed by the user's decision (see R9).

## Why a separate spec

The open specs (`proofgate-brushup`, `proofgate-self-escalation`) change rule behavior and stop at open release checkpoints. This work produces submission material and evidence about the product as a whole, so it gets its own spec. It depends on those checkpoints (the version decision, R4) and does not reopen them.

## Goal

Prepare a Kiroween 2026 submission in the Frankenstein category that a judge can understand and try alone. The center of the submission is one sequence on one CDK stack: plain synthesis succeeds, the ProofGate gate rejects the stack, the developer removes the excess permission, and the same stack passes the gate. Targets: the Frankenstein category prize and a place in the overall top three. No ranking is promised.

## Sources

- Official rules: https://kiroween.devpost.com/rules (read 2026-11-23). Required items: a project built with Kiro during the Submission Period (Oct 30 to Dec 4, 2026), a URL to the working project or a test build that judges can use free of charge, an English text description, a public YouTube video under three minutes that shows the project working, a public GitHub repository with an open source license shown in the About section, `/.kiro` at the root and not ignored, the category, and a write-up of how Kiro was used. Pre-existing work must be disclosed. Stage Two scores five criteria equally (Potential Impact, Technological Implementation, Design, Innovation/Idea, Presentation). Deadline: Dec 4, 2026, 2:00 PM PT, which is Dec 5, 07:00 JST.
- External mock review: written by the user's Codex session on 2026-11-22, against commit `17fd143`. It is stored in the user's notes outside the repository. Provisional scores: Impact 7/10, Kiro use 9/10, Design 6/10, Innovation 8/10. Presentation was not scored, because there is no video yet. The review is the opinion of another AI, not of the official judges, and the submission must say so if it cites it.
- Repository state: `HEAD` is `17fd143`, the reviewed commit. No later commit exists, so the review applies to the current code unchanged.

## Review points already satisfied at 17fd143

These points need no new work, only a link in the submission.

| Review point | Evidence |
| --- | --- |
| A permissive fix of the same stack passes the gate | Rerun on 2026-11-23: a copy of `examples/vulnerable-app` without the `iam:PassRole` statement gives gated synth exit 0, and plain synth exit 0. The original gives exit 1 with `PG-IAM-004`. |
| The license is detected | `gh repo view`: public, `apache-2.0`. |
| `/.kiro` is committed and not ignored | `git check-ignore .kiro/steering/kiroween.md` matches nothing. |
| English results exist | `docs/REAL_STACKS.en.md`, and the English paragraphs in `docs/*.md` and `README.md`. |
| Prediction-first trials | `examples/trial-app` (24 variants), `examples/real-stacks/data/*-predictions.json`. |

## Requirements

Each requirement lists the current evidence, the missing evidence, the acceptance criteria, and the owner. **Kiro** means that Kiro can do the work in the repository. **Owner** means that the user must do it: trials with people, recording, publishing, or submitting.

### R1. One English entry point for judges

The user story: as a judge who does not read Japanese, I want one page that tells me what ProofGate is, which version to try, what I need, which commands to run, and what I should see.

- Current evidence: `README.md` is Japanese, with English paragraphs inside its sections. `packages/cdk-plugin/README.md` is the same. There is no single English page with prerequisites, commands, and expected output.
- Missing evidence: an English page that a first-time reader can follow without other pages.
- Acceptance criteria:
  1. THE repository SHALL have one English entry page for judges. The first screen of `README.md` SHALL link to it in English, and the Japanese text SHALL stay (repository rule: add English, never replace Japanese).
  2. THE page SHALL state the submission version (R4), the tools with exact versions (Node.js, pnpm, elan and the Lean toolchain), and that no AWS account, credentials, or deployment are used.
  3. THE page SHALL give the commands of R2 in order. After each command it SHALL show the expected exit code and the lines to look for, copied from a real run of the submission version.
  4. THE page SHALL state what ProofGate does not check (one short list that links to `docs/ASSUMPTIONS.md`), and what the Lean check covers (R9).
  5. THE page SHALL give two times: the setup time (install of tools and dependencies, first Lean build) and the time for the R2 sequence once setup is done. Both SHALL be measured in a clean environment (R5), and the page SHALL say on which machine.
- Owner: Kiro (writing, measurement). The user reviews the text.

### R2. Fix the same stack: plain synth, rejection, fix, pass

The user story: as a CDK developer, I want to see the gate stop my stack and then accept the same stack after I remove the excess permission, so that I know the gate is something I can act on.

- Current evidence: `examples/vulnerable-app` and `examples/safe-app` are two different stacks. `pnpm verify:demo` shows the safe one passing and the vulnerable one rejected; it does not show a fix. The mock review and the rerun of 2026-11-23 removed the statement by hand in a copy. `examples/trial-app` has an `acknowledged` variant that passes through `Validations.of(app).acknowledge`.
- Missing evidence: a scripted, repeatable sequence on one stack, in the repository, with the fix shown as a diff.
- Acceptance criteria:
  1. A judge SHALL be able to run, without AWS credentials or deployment: (a) plain synth of stack S with exit 0; (b) gated synth of S with exit 1 and `PG-IAM-004`; (c) the fix, which removes the excess permission in the CDK source of S; (d) gated synth of the fixed S with exit 0.
  2. THE fix SHALL be shown as a source diff of a few lines, and the sequence SHALL leave no tracked file changed after it runs.
  3. THE sequence SHALL NOT use `acknowledge`, `allowedPassRoleTargets`, `allowedPolicyWriters`, or a different stack. THE guide SHALL show the acknowledgement separately and say that it records an exception and fixes nothing.
  4. Each step's exit code SHALL be checked by an automated test or a CI job, so that the guide and the video cannot drift from the code.
  5. No rule, matcher, or verdict SHALL change for this requirement.
- Owner: Kiro.

### R3. A rejection that says who, which data, and what to change

The user story: as a reviewer, I want to read from the rejection which principal is involved, which protected data it reaches, and where I change the code next.

- Current evidence (gated synth of `examples/vulnerable-app` on 2026-11-23, terminal output):
  - The violation line names the principal, the role, the service, the launch action, and the protected bucket ARN.
  - The names are CloudFormation logical IDs with hash suffixes (`DeveloperRole58EC5A58`, `ProtectedDataRoleCDFF69BA`). The construct path is shown only for the principal (`VulnerableAppStack/DeveloperRole/Resource`).
  - The source location is `dist/app.js:23:1`, the compiled JavaScript at the `Role` constructor. It is not the TypeScript line of the policy statement.
  - The statements that make the path are listed only in `cdk.out/validation-report.json` (`propertyPaths`), not in the terminal.
  - The rule ID appears in the terminal only in `Acknowledge with 'ProofGate::PG-IAM-004'`, which is printed right after the suggested fix.
  - The suggested fix gives three alternatives and does not say which change is the smallest.
- Missing evidence: whether these points actually confuse a CDK user. That comes from R6, which has not been run.
- Acceptance criteria:
  1. Kiro SHALL write a checklist from the current output: for each of the three questions (who, which data, what to change), what the terminal shows and what only the JSON report shows.
  2. THE first trial round of R6 SHALL use the current output unchanged.
  3. Improvements SHALL be chosen from the observed confusion, smallest first (wording, construct paths, the statement to change). Each improvement SHALL be listed with the observation it answers.
  4. Any change to the output SHALL keep the rule ID, the verdict, the exit code, and the CDK report fields. A change of an existing test assertion SHALL be listed for the user's approval.
  5. Any code change for R3 SHALL be merged before the brushup code freeze (2026-11-29), or the user SHALL approve a later merge.
- Owner: Kiro (checklist, changes). Owner (the observations, through R6).

### R4. One submission version for the guide, the video, and the test build

- Current evidence: npm `latest` is 1.1.2. `main` has unreleased features (CHANGELOG "Unreleased"). The demo verdict is the same on both, but the violation text differs: 1.1.2 prints `... can pass Lambda-assumable role ... and control Lambda code or configuration ...`, while `main` prints `... can pass role ... to lambda.amazonaws.com and launch it (lambda:CreateFunction) ...`. The plugin reports `pluginVersion: "1.1.2"` on `main` too (`packages/cdk-plugin/src/index.ts`, `version = "1.1.2"`), so a report from `main` looks like 1.1.2. The release of 1.2.0 waits at brushup Checkpoint 6 and self-escalation Checkpoint 3.
- Decision (2026-11-23): the submission version is **1.2.0 on npm**. This is the user's instruction for brushup Checkpoint 6 and self-escalation Checkpoint 3 as far as the version number goes; the timing is set below.
- Missing evidence: the release itself, and the materials made from it.
- Acceptance criteria:
  1. THE submission version SHALL be `@proofgate-cdk/*` 1.2.0 from npm (or 1.2.1 under R4.2; "1.2.0" below means the submission version), all four packages at the same version. The guide, the video, and the test build SHALL install it from npm, not from the workspace.
  2. Revision 3 (Option A of the design, chosen by the user): 1.2.0 SHALL be released after the R2 code change and before the brushup code freeze (2026-11-29). If the trials (R6) lead to a product change of R3, it SHALL be released as 1.2.1, and 1.2.1 SHALL then be the submission version for every item of R4.5. The recorded output is always the published output. Kiro prepares the version bump, the CHANGELOG section, and the tarball check on a branch; the user approves the merge and publishes with `pnpm publish -r --access public`. Kiro SHALL NOT publish or push a tag. The planned order: code changes merged by the brushup code freeze (2026-11-29), then the release, then the recording (R11).
  3. Decision (2026-11-23): `0.0.0-stage` is not kept. It was published on 2026-11-20 at about 13:03 UTC for all four packages, so the 72-hour unpublish window of npm (https://docs.npmjs.com/policies/unpublish) ends on 2026-11-23 at about 13:03 UTC (22:03 JST). After that, unpublishing needs fewer than 300 downloads in the last week, and `@proofgate-cdk/cdk-plugin` had 602 (2026-11-15 to 11-21). The user SHALL run `npm unpublish @proofgate-cdk/<package>@0.0.0-stage` for the four packages inside the window (plugin first, model last). If the window has passed or npm refuses, the user SHALL run `npm deprecate @proofgate-cdk/<package>@0.0.0-stage "<message>"` instead. A version number that was unpublished can never be published again; 1.2.0 is not affected. Kiro checks afterwards that `npm view` no longer lists the version, or shows it as deprecated. Result (2026-11-23, checked by Kiro on the registry): `@proofgate-cdk/cdk-plugin@0.0.0-stage` is unpublished; for `core`, `extractor`, and `model` the user's unpublish did not take effect (the likely reason is npm's rule that a package other packages depend on cannot be unpublished; the error text was not recorded), so the user deprecated them with "Not a release. Use 1.2.0 or later." `latest` is 1.1.2 for all four, and 1.1.2 is not deprecated.
  4. After the release, Kiro SHALL check from a clean directory that npm `latest` is 1.2.0 for all four packages and that the R2 sequence gives the same exit codes and output with the published packages.
  5. THE guide (R1), the video (R11), the test build (R5), and the Devpost text (R12) SHALL name 1.2.0. Every output shown SHALL come from that version.
  6. THE version reported by the plugin (`pluginVersion` in the CDK report) SHALL be 1.2.0 in the published package. Today the source has a fixed string `1.1.2`; the bump SHALL change it, and a test SHALL check that it equals the package version.
- Owner: Kiro prepares the release. The user approves, publishes, and decides on `0.0.0-stage`.

### R5. A free test build that judges can use

- Current evidence: the rules ask for a URL to the working project or a test build, free of charge. ProofGate is a CDK plugin that runs locally and needs Node.js 26, pnpm, and elan with Lean. CI (`.github/workflows/ci.yml`) already runs `pnpm verify:demo`, but its log is not presented to judges. The setup time on a new machine has not been measured; the mock review used caches and an installed Lean.
- Decision (2026-11-23): provide a hosted development environment (GitHub Codespaces or similar) and try it.
- Missing evidence: the environment definition, a run in it, and the measured setup time.
- Acceptance criteria:
  1. THE repository SHALL have a development container definition that a judge can open in GitHub Codespaces. It SHALL install the pinned Node.js, pnpm, and elan with the pinned Lean toolchain, and SHALL install the 1.2.0 packages for the R2 sequence. No AWS tool or credential SHALL be configured in it.
  2. In a new codespace, the judge SHALL be able to run the R2 sequence with the commands of the R1 guide and get the same exit codes and output as a local run.
  3. THE time from "create codespace" to "ready to run R2" SHALL be measured, with the Lean build shown separately. If it is too long for a judge (the target is set in the design), the design SHALL choose a way to shorten it (for example a prebuild) and measure again.
  4. Cost to the judge: the design SHALL check, in GitHub's current documentation, what a personal account may use free of charge, and the guide SHALL state it. Opening a codespace needs a GitHub account; the guide SHALL say so. The local run of the R1 guide stays as the second way, and a public CI run of the R2 sequence stays as a third way that needs no account.
  5. Adding the container definition SHALL not change any dependency or toolchain version of the packages; it uses the versions that the repository already pins.
  6. THE local setup time SHALL be measured once in a clean environment without caches (the codespace counts as one), with the time for installing elan and building Lean shown separately.
  7. Nothing in the test build SHALL need AWS credentials, a paid account, or a deployment.
- Owner: Kiro (container definition, measurement in a codespace if Kiro can create one; otherwise the user creates it and Kiro reads the log). The user checks the entry point with a GitHub account that has no access to the repository's settings.

### R6. Unaided trial by two CDK users

- Current evidence: none with other people. All trials so far (`examples/trial-app`, `examples/real-stacks`) were done by the author and Kiro.
- Missing evidence: two CDK users following the guide without the author's help.
- Acceptance criteria:
  1. Kiro SHALL write the trial protocol: the task given to the participant, what the observer may say (nothing beyond the protocol), what is recorded (where the participant stopped, which text they misread, what they changed, whether they used the acknowledgement instead of a fix), and the times (setup and task measured separately).
  2. Kiro SHALL write an English observation sheet that the participant or the observer fills in.
  3. THE results SHALL be recorded as "not verified" until the user has collected them. Kiro SHALL NOT write or paraphrase observations that it did not receive.
  4. THE submission SHALL cite only the collected results, with the number of participants.
  5. Schedule: the user asks the two participants by the week of 2026-11-30. THE protocol and the sheet SHALL be ready before the user sends the request, and they SHALL use the 1.2.0 guide; if a trial happens before the release, the protocol SHALL say which commit was used.
- Owner: the user recruits and runs the trials. Kiro prepares the protocol and records the results the user gives.

### R7. Comparison with existing tools on the same stack

- Current evidence: none. `cdk-nag` is not a dependency of the repository. IAM Access Analyzer custom policy checks need AWS credentials and are out of scope for a no-credentials run.
- Missing evidence: the outputs of the same stack under plain synth, `cdk-nag` with a pinned version and rule pack, and ProofGate.
- Acceptance criteria:
  1. THE experiment SHALL be written down before it runs: the stack (the R2 stack before and after the fix), the tools with exact versions, the `cdk-nag` rule pack (for example `AwsSolutionsChecks`), the commands, and the comparison question: "From this output, what can the reviewer decide about this change?"
  2. No winner SHALL be written before the run. A finding that more than one tool reports SHALL be kept in the table.
  3. THE outputs SHALL be stored unchanged, with the commands and versions, and the table SHALL refer to them. Claims about another tool SHALL be limited to the inputs and modes that were run.
  4. Decision (2026-11-23): `cdk-nag` SHALL be installed in an isolated directory outside the pnpm workspace, with exact pinned versions (`cdk-nag`, `aws-cdk-lib`, `constructs`, the CDK CLI) and its own lockfile. No workspace package, root `package.json`, or `pnpm-lock.yaml` SHALL change for it. The committed record (commands, versions, outputs) SHALL say how to recreate the directory.
- Owner: Kiro (design, run, table).

### R8. One Kiro example: the missed partial-bucket access (D1)

- Current evidence, in order:
  - Found: `.kiro/steering/kiroween.md`, row of 2026-11-18 "Spec, AWS Documentation MCP". While writing `design.md` and reading the AWS docs through the AWS Documentation MCP server, probing the evaluator showed that prefix-scoped S3 grants were judged safe (`design.md` section 3, line "S3 resource `bucket/reports/*` | judged safe | Defect").
  - Specified: `requirements.md` of `proofgate-verification-hardening`, "D1: S3 access by intersection" (commit `af9fcdf`).
  - Red first: commit `83a357a`. The generated suite showed 532 soundness failures. 178 cases contain a prefix-scoped grant (a feature count, not a cause; not the same as the 178 failures left after the `?` fix).
  - Fixed: commit `e11b4b2` (the 178 failures left after the `?` fix to 0; 532 to 0 in total).
  - Checked: commit `09226c8`. The differential over 18,014 inputs removed no finding, and the demos were byte-identical.
- Missing evidence: a short English account for the write-up and the video, with links.
- Acceptance criteria:
  1. THE write-up SHALL tell the chain (found, specified, red, fixed, checked) in at most about 120 words, with the five links above.
  2. It SHALL say what Kiro did (the probe, the spec, the tests, the fix) and what the user decided (approving the scope clarification).
  3. It SHALL say that the generated tests use an in-repo generator and not Kiro's built-in property-based testing feature (the log of 2026-11-18 says that feature was not used).
- Owner: Kiro.

### R9. Provenance and trust boundary, stated exactly

- Current evidence:
  - The first commit is 2026-11-16 and the MVP was committed on 2026-11-17 (`d5858f3`), both inside the Submission Period. Kiro work starts on 2026-11-18 (the first row of the usage log).
  - The usage log records only Kiro work.
  - `docs/PROOFS.md` and `AGENTS.md` say that Lean checks Booleans computed by TypeScript.
- Missing evidence: an English statement for the submission.
- Revision 4 (2026-11-23, the user's decision at Checkpoint 6): the submission materials do not describe the MVP of 2026-11-17 or the external mock review.
- Acceptance criteria:
  1. THE submission SHALL describe as Kiro work only what was done in Kiro from 2026-11-18 (the dates of the usage log), and SHALL link the usage log. It SHALL NOT describe earlier work as Kiro work, and SHALL NOT say that the whole project was built in Kiro.
  2. THE submission materials SHALL NOT cite the external mock review, and SHALL NOT quote its scores.
  3. It SHALL say that Lean checks a finite model built by TypeScript, and that the extractor, the evaluator, the generated tables, and the assumption that the synthesized template is what is deployed are trusted. No text, slide, or video SHALL say that Lean proves CloudFormation or IAM semantics.
- Owner: Kiro writes it. The user confirms the provenance facts.

### R10. Kiro write-up covering the features the rules name

- Current evidence: the usage log has rows for steering, specs, the quality-gate hook (`PostTaskExec`), the MCP servers (AWS Documentation MCP and the AWS MCP Server, including the sessions where they were unavailable, and Serena), and the Kiro app used (Kiro IDE in every row). Custom agents and powers do not appear in the log. It also records failures and rejected options.
- Missing evidence: the English write-up for the Devpost form.
- Acceptance criteria:
  1. THE write-up SHALL answer each item of the rules (Kiro app, custom agents, hooks, spec-driven development, steering, MCP, property-based testing, powers) only with what the log shows. An unused feature SHALL be named as unused.
  2. Each claim SHALL link a file or a commit.
  3. It SHALL include R8 and one failure that Kiro caught and corrected (for example the RS-70 prediction).
- Owner: Kiro. The user reviews it.

### R11. A video under three minutes, on the submission version

- Current evidence: no video, script, or recording plan.
- Missing evidence: the script, the commands, and the screens to record.
- Acceptance criteria:
  1. Kiro SHALL write an English script of about 2 minutes 40 seconds. It opens with "This CDK change passes synthesis. Would you approve it for a stack that handles customer data?" and shows the real screens of R2: rejection, fix, and pass.
  2. THE script SHALL list, per scene, the command, the output lines to highlight, the diff to show, and the Kiro evidence (a file or a commit). Every output SHALL come from the submission version (R4).
  3. THE script SHALL show the trust boundary (R9) in one picture or sentence, and SHALL use no third-party trademarks or music without permission.
  4. Completion check: one viewer who is not a cloud specialist watches it once and can say who uses ProofGate, what it stopped, and how the stack was fixed. The user runs this check, and the result stays "not verified" until the user reports it.
- Owner: Kiro (script, recording list). The user records, uploads to YouTube as public, and runs the viewer check.

### R12. Devpost submission package

- Current evidence: the checklist in `.kiro/steering/kiroween.md`, with every item unticked.
- Missing evidence: the English text description, the Frankenstein category statement, and the final link check.
- Acceptance criteria:
  1. Kiro SHALL draft the English text description: the problem, who it is for, the R2 sequence, and the Frankenstein statement. The Frankenstein statement names the parts stitched together: AWS CDK validation plugins, Lean 4, the AWS Service Reference data, the pathfinding.cloud data, and an independent test oracle.
  2. Before submitting, the user SHALL check from a logged-out browser that the repository, the video, the test build, and the guide open and name the same version.
  3. THE submission SHALL be sent before Dec 5, 2026, 07:00 JST. The planned buffer is to submit by Dec 4 JST.
- Owner: Kiro (draft, checklist). The user submits.

## Out of scope

- New rules, new IAM syntax, or changes of a verdict.
- Publishing, tagging, or changing a version without the user's instruction (R4).
- Bonus prizes (blog, social post). They can be added later if the user asks.
- A standalone slide deck. If the user wants slides, three are enough, and they reuse the video's pictures.

## Decisions recorded (2026-11-23)

1. R4: the submission uses 1.2.0, published to npm by the user. The release follows the R2 and R3 code changes.
2. R5: a hosted development environment (Codespaces or similar) is provided and tried; the local guide and a CI run stay as further ways.
3. R6: the user asks the two CDK users by the week of 2026-11-30.
4. R7: `cdk-nag` goes into an isolated directory outside the workspace, with pinned versions.

5. R4: `0.0.0-stage` is not kept. Done: unpublished for `cdk-plugin`, deprecated for `core`, `extractor`, and `model`.

## Open questions for the user

None.
