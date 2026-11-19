# Design: proofgate-real-stack-validation

Status: APPROVED (revision 1), because the user asked for the tasks next; decision D1 (Pattern RS-14) is still open and is handled at Checkpoint 1 of `tasks.md`. No code has been changed for this spec.

Requirements: [requirements.md](./requirements.md) (revision 2, approved).

## 1. Summary

Add one private CDK app, `examples/real-stacks`, that can build any of 13 realistic Patterns by name. A runner synthesizes every Pattern twice (without and with ProofGate), reads what the real plugin reports, classifies the outcome, and compares it with an expected-results table kept in the repository. Predictions are written and committed before the first measurement. After the measurement the work stops at a decision gate (Requirement 10) before anything changes in the README, the version, or npm.

Message improvements are additive. They live in the validator's `description` and `fix` text, never in the extractor's `reason` strings, because existing tests assert those strings exactly.

## 2. Evidence gathered for this design

All probes were throwaway scripts. They were deleted and nothing was added to the repository.

### 2.1 What common CDK code produces (extractor only)

Eight common constructs were synthesized and passed to `extractStack`. Six of the eight give no model (see requirements, Introduction). The three causes are managed policies (`ManagedPolicyArns`), a non-literal `Resource` produced by `grant*` (`Fn::GetAtt`, `Fn::Join`), and a `Condition` in a trust policy (Step Functions).

### 2.2 The real plugin, in process

The real `ProofGateValidator` was added to a CDK `App` and `app.synth()` was called in the same Node.js process, for three small stacks.

| Stack | Without ProofGate | With ProofGate |
| --- | --- | --- |
| literal developer role and data role (an escalation path) | ok, 0.4 s | throws `Validation failed`, 2.2 s (first run, includes Lean start-up) |
| Lambda with `bucket.grantRead` | ok, 0.2 s | throws, 7 ms (no model, so Lean is not started) |
| literal role without a path | ok | ok, 0.4 s |

What this shows:

- A failed validation is an exception (`UnscopedValidationError`, "Validation failed. A copy of this report can be found in: `<outdir>/validation-report.json`"). The runner can catch it and read the report file. The report format is verified in Task 1; I did not read the file's content in the probe.
- The printed report names the CloudFormation resource and the construct path, for example `S/Fn/ServiceRole/DefaultPolicy/Resource (FnServiceRoleDefaultPolicyC6A839BF)`. The location is already useful.
- In-process synthesis is fast: 13 Patterns twice should take well under 20 s. The CLI takes about 1.6 s per plain `cdk synth` and 1.9 to 4 s with ProofGate, which would give 45 s or more for 26 CLI runs. That is too close to the 60 s limit, so the CLI is used for a sample only (section 5.3).

### 2.3 Messages a user sees today

The reasons are written for the maintainers. Examples:

- `Managed policies are not supported in the first vertical slice` (jargon: "vertical slice").
- `No supported IAM policy statements were found; refusing a vacuous proof` (does not say that other findings caused it).
- `Action and Resource must be literal strings or arrays of strings` (does not say that `grantRead` produces such a value).
- The suggested fix ends with "or extend ProofGate before deployment", which a user cannot do.

### 2.4 A CDK feature that may bypass a finding (not verified)

Each printed finding ends with "Acknowledge with `ProofGate::PG-IAM-004`". This is CDK's mechanism to acknowledge a validation finding. If a developer can add that acknowledgement in the same CDK code, then a finding of this guardrail can be silenced by the person who writes the stack. I have not tested this. It is raised as decision D1 (section 12).

## 3. Architecture

```
examples/real-stacks/                  new private workspace package @proofgate-cdk/real-stacks
  package.json                         same dependencies as the other example apps, no new package
  tsconfig.json  cdk.json
  src/
    app.ts                             CDK entry: -c pattern=RS-02, PROOFGATE=1 enables the plugin
    catalog.ts                         the list of Patterns, in order
    helpers.ts                         shared builders (literal roles, data role) to avoid duplicate code
    patterns/rs-01.ts ... rs-13.ts     one Pattern each: id, title, description, groundTruth, build(app)
    config.ts                          the protected bucket ARN and the plugin settings in one place
  data/
    predictions.json                   written and committed BEFORE the first measurement
    expected-results.json              observed and reviewed results (what the runner compares with)
  scripts/
    run.mjs                            the runner (in process, plus a CLI sample)
    classify.mjs                       classification function (also used by the test)
tests/
  real-stacks-table.test.ts            file-only consistency test of the two JSON files (fast)
docs/
  REAL_STACKS.md                       results, Japanese
  REAL_STACKS.en.md                    results, English
```

- `examples/*` is already a workspace glob, so the package is picked up without changing `pnpm-workspace.yaml`. Its dependencies are the same versions as `examples/safe-app`. `pnpm-lock.yaml` gets a new importer entry for the workspace package only; no external package entry changes (Requirement 8.2). I will check this with a diff in the first task.
- The package is `private`, is not in any `files` array, and is not packed.
- A root script `pnpm real-stacks` runs the runner.
- Knip: `examples/*` already has `src/app.ts` as entry, so `catalog.ts`, `helpers.ts`, and the patterns are reachable through imports. `scripts/*.mjs` is outside Knip's `project`; if Knip complains, the config gets an explicit entry for it, which is a change to `knip.json` and will be reported.
- jscpd: thirteen similar files would trigger duplicate-code detection (`minLines` 8). `helpers.ts` holds the repeated parts: a literal role, a data role with a bucket grant, a developer role with PassRole and Lambda statements. Each Pattern file only states what differs.

### 3.1 A Pattern

```ts
interface Pattern {
  readonly id: `RS-${string}`;
  readonly title: string;
  readonly description: string;            // English, two or three sentences
  readonly groundTruth: "safe" | "unsafe"; // under AWS semantics, decided by review
  readonly inScope: boolean;               // false when the path leaves the modeled scope (RS-13)
  readonly build: (app: App) => void;      // adds one or more stacks to the app
}
```

`build` takes the `App` (not a `Stack`) because RS-13 needs two stacks.

### 3.2 Selecting a Pattern

`app.ts` reads the context value `pattern`. A missing or unknown value is an error that lists the valid ids (it never falls back to a default, so a typo cannot silently test the wrong stack). The environment variable `PROOFGATE=1` registers the plugin with the protected bucket from `config.ts`, as in the existing demo apps.

## 4. The Patterns

The protected bucket is `arn:aws:s3:::proofgate-protected-data` in every Pattern, the same as the demo apps. Constructs use inline Lambda code, no Docker, no assets, no network. Ground truth uses the AWS rules of the earlier spec (design section 8).

| ID | Constructs | Ground truth and reason |
| --- | --- | --- |
| RS-01 | two `iam.Role`, `addToPolicy` with literal ARNs. Dev: `iam:PassRole` for the data role, `lambda:CreateFunction`. Data role: `s3:GetObject` on a different bucket | safe: the data role cannot reach the protected bucket |
| RS-02 | as RS-01, data role has `s3:GetObject` on `bucket/*` | unsafe: all four conditions hold |
| RS-03 | as RS-02, but the data role has a prefix grant only (`bucket/reports/*`), the PassRole Resource ends in a `?` pattern for the role name, and Lambda control is `UpdateFunctionConfiguration` and `UpdateFunctionCode` in two statements | unsafe: each of these forms was fixed in 1.0 |
| RS-04 | as RS-02, but the statements are separate `iam.Policy` objects attached with `attachToRole` | unsafe: the path is the same, the template shape differs (`AWS::IAM::Policy` with `Roles`) |
| RS-05 | `lambda.Function` (inline code) and `bucket.grantRead(fn)` on a CDK-created bucket | safe: no PassRole, no Lambda control by anyone |
| RS-06 | `iam.Role` and `bucket.grantReadWrite(role)` | safe: no PassRole |
| RS-07 | `sfn.StateMachine` with `tasks.LambdaInvoke` | safe |
| RS-08 | `ecs.FargateTaskDefinition` and `grantReadWrite(taskRole)` | safe |
| RS-09 | `events.Rule` with a `LambdaFunction` target | safe |
| RS-10 | `codebuild.Project` whose role gets `iam:PassRole` on `*` and `lambda:CreateFunction` on `*` through `addToRolePolicy`, plus a literal data role (Lambda trust, `bucket/*`) in the same stack | unsafe: the project role can pass the data role (`*`) and create a function |
| RS-11 | the literal pair of RS-02 and an unrelated Lambda with `bucket.grantRead` in the same stack | unsafe: the literal pair is a path |
| RS-12 | a role whose statement has `Resource` `bucket/${aws:username}/*`, written through `PolicyStatement` | safe: no PassRole |
| RS-13 | stack A: dev role with PassRole for the literal ARN `arn:aws:iam::123456789012:role/data-role` and `lambda:CreateFunction`. Stack B: the data role with that name, Lambda trust, `bucket/*` | unsafe, `inScope: false`: the path crosses two templates, outside the modeled scope |

Notes:

- RS-05 to RS-09 and RS-12 are safe in the AWS sense, so a rejection is a usability limit, not a missed or false finding.
- RS-10 and RS-11 test Fail Closed: the plugin must not accept them.
- In RS-12 the bucket ARN with the variable is built as a plain string; CDK passes it through unchanged. If CDK refuses to synthesize it, the Pattern is changed in Task 1 and the change is recorded.
- Some of the ground truths contain judgment (RS-10: the project role's other permissions are broad, but the two statements alone form the path). Each Pattern file records its reasoning in a comment.

## 5. Runner

### 5.1 What one run does

For each Pattern in the catalogue order:

1. Plain run (in process): build the app, `synth()`. It must succeed. A failure here is a harness error (the Pattern itself is broken), reported separately from a ProofGate result.
2. Gated run (in process): build the app, register the real `ProofGateValidator` with the protected bucket, `synth()`. Catch the validation exception, read `validation-report.json` from the output directory, and extract the rule names, the construct locations, and the unsupported reasons.
3. Compute the Result: `accepted`, `PG-IAM-003`, `PG-IAM-004`, or both.
4. Classify (5.2) and compare with `expected-results.json`.

The output directory is a temporary folder, removed afterwards. The runner uses no AWS credentials and no network.

### 5.2 Classification (Requirement 4)

| Class | Condition |
| --- | --- |
| correct detection | ground truth unsafe, in scope, and the Result contains `PG-IAM-004` |
| correct acceptance | ground truth safe and the Result is `accepted` |
| rejected as unsupported | the Result is `PG-IAM-003` only. For an unsafe in-scope Pattern the record also states that the path is not visible in the Result (Requirement 5.2) |
| false negative | ground truth unsafe, in scope, and the Result is `accepted` |
| false positive | ground truth safe and the Result contains `PG-IAM-004` |
| outside the documented boundary | ground truth unsafe, not in scope, and the Result is `accepted` |

A Pattern that is unsafe, not in scope, and not accepted would not fit any class; the classifier throws, so that nothing is filed under a wrong name.

### 5.3 Real `cdk synth` sample

Requirement 2.3 asks that the final Result comes from `cdk synth`. The in-process run uses the real plugin and the real CDK `App`, but not the CLI. The runner therefore also runs the real CLI (`cdk synth`, `PROOFGATE=1`) for a fixed sample: RS-01 (accepted), RS-02 (detection), RS-05 (rejected as unsupported). It checks the exit code (0, 1, 1) and the rule id in the output. The sample takes about 12 s. With `--cli all` the runner runs every Pattern through the CLI; this is done once for the trial and recorded, not by default.

### 5.4 Time budget

| Part | Estimate | Basis |
| --- | --- | --- |
| 13 Patterns, in process, plain and gated | about 10 s | probe: 0.2 to 0.5 s per run, 2.2 s for the first Lean start |
| CLI sample of 3 Patterns, plain and gated | about 12 s | existing demos: 1.6 s plain, 1.9 to 4 s gated |
| Total | about 25 s | within the 60 s limit |

Measured numbers replace these estimates in the first runner task.

## 6. Predictions and expected results

Two files, with different roles, so that a prediction cannot be edited to match a result.

- `data/predictions.json`: for each Pattern, the predicted Result and reason (the appendix of the requirements). It is written first and committed in its own commit before the runner exists. It is never edited afterwards. The git history is the proof of the order (Property P6).
- `data/expected-results.json`: for each Pattern, the reviewed observed Result, the class, and the set of unsupported reasons. The runner compares with this file. Each entry that differs from the prediction carries a `deviation` text that explains why (Requirement 2.2).

The probe's predictions for RS-05 to RS-09 and RS-12 are marked `basis: "probe (extractor only)"`. The others are `basis: "reasoning"`.

## 7. Consistency test inside `pnpm test`

Requirement 3.5 keeps the runner out of `pnpm test`. A small test is added anyway, and it needs no synthesis: `tests/real-stacks-table.test.ts` reads the two JSON files and the catalogue ids from the source text and checks that

- every Pattern id has exactly one prediction and one expected result, and nothing else;
- each value is from the allowed sets (ground truth, Result, class, basis);
- the class is consistent with ground truth, scope, and Result (the same function as the runner's classifier, imported from `scripts/classify.mjs`);
- no Pattern with ground truth unsafe and in scope is classified as `correct acceptance` or `false negative` without being listed in an explicit `knownDefects` array (so a false negative can never be recorded quietly as expected; it must be a visible, reviewed exception);
- every deviation from the prediction has a non-empty explanation.

It runs in a few milliseconds. The justification for putting it in `pnpm test` is that the table is the record the 1.0 claims rely on, and a stale or inconsistent table should fail the normal gate.

## 8. Messages (after the decision gate, additive)

The extractor's `reason` strings are asserted by existing tests (for example `Condition is not supported`, `AWS::IAM::User is not supported in the first vertical slice`, and the two strings in `tests/pbt/policy-variable.test.ts`). They are not changed.

The improvement is in `packages/cdk-plugin`: a pure function `hintFor(reason)` returns a short plain-English explanation, and the validator appends it to the violation's `description` and to `fix`. Existing tests assert only `stringContaining` on the beginning of the description, so appended text keeps them passing. Which input is accepted or rejected does not change.

| Reason contains | Hint |
| --- | --- |
| `Managed policies` or `ManagedPolicy` | ProofGate cannot read AWS managed policies. CDK attaches them by default, for example to the execution role of a Lambda function. This role cannot be checked yet. |
| `must be literal strings` | The value is built from a CloudFormation function such as `Fn::GetAtt`. Helper methods such as `grantRead` produce this. ProofGate reads literal values only. |
| `in trust policies` | A condition in a trust policy is not evaluated. |
| `refusing a vacuous proof` | No other statement in this template could be read, so ProofGate cannot say that the template is safe. See the other findings for the cause. |
| `policy variables` | IAM policy variables are not evaluated. Write the resource without the variable. |
| other | no hint |

The suggested fix ends with "or extend ProofGate before deployment". The new text replaces that part with "or do not enable ProofGate for this stack" only if no existing test asserts it (checked in the task); otherwise the hint is appended and the old sentence stays.

Because of the decision gate, these changes are written only after the user has read the measurement.

## 9. Decision gate (Requirement 10)

After the measurement the work stops. The report contains the table, the three criteria of Requirement 10.2 with their values, the evidence, and the options (a) to (d) with costs. The predictions already say that the criterion "4 or more of RS-05 to RS-09 are rejected" is expected to hold. The report says so openly. Nothing is changed in the README, the changelog, the version, the tag, or npm before the user's decision.

## 10. Documents

- `docs/REAL_STACKS.md` (Japanese) and `docs/REAL_STACKS.en.md` (English): the table of Patterns with ground truth, prediction, Result, class, and reasons; how to run the runner; what the sample does not show (Requirement 6.3); the Lean statement from Requirement 6.5.
- README: changed only after the gate, and only in plain words (Requirement 6.4).
- Existing documents are not deleted or rewritten. Additions only.

## 11. Quality, packaging, and conventions

- `pnpm quality`, `pnpm typecheck` (covers the new example's `src`), `pnpm test`, and `pnpm pack:check` must pass; `verify:demo` still exits 1 with `PG-IAM-004`.
- No dependency changes. Node.js 26, pnpm 11, TypeScript strict, and the Lean toolchain stay as pinned.
- Comments in code are Japanese. Spec documents and `docs/REAL_STACKS.en.md` are English. `docs/REAL_STACKS.md` is Japanese.
- The runner is not part of a published package. `tests/real-stacks-table.test.ts` is outside `pnpm typecheck`, as decided for `tests/`.
- Each phase gets its own branch, stacked on the previous one, as in the earlier spec. Commits are allowed on those branches. Push and merge need the user's approval.

## 12. Open decisions for you

| ID | Question | Recommendation |
| --- | --- | --- |
| D1 | Add Pattern RS-14: a stack in which the developer acknowledges the `PG-IAM-004` finding with CDK's acknowledge mechanism? The requirements list is approved with 13 Patterns, so this needs your agreement. | Yes, as a measurement only. Verify in Task 1 whether an acknowledgement removes the finding. If it does, the README and `docs/ASSUMPTIONS.md` must say that ProofGate guards against mistakes, not against the author of the stack. Do not change the plugin in this spec. |
| D2 | Should the message hints (section 8) be written only after the gate? | Yes, because a poor result may change what the messages should say. |
| D3 | Name of the root script: `pnpm real-stacks`. | Accept. |
| D4 | Locations of the result documents: `docs/REAL_STACKS.md` and `docs/REAL_STACKS.en.md`. | Accept. |
| D5 | When a literal escalation path appears next to an unsupported construct (RS-10, RS-11), the user sees only `PG-IAM-003`. Evaluating the supported part and reporting `PG-IAM-004` as well would add information and would only add findings, but it changes the rule that the extractor returns no partial model. | Do not do it here. Record it as a follow-up spec candidate with the evidence from RS-10 and RS-11. |

## 13. Correctness properties

| ID | Property | Requirements |
| --- | --- | --- |
| P1 | Each Pattern synthesizes without ProofGate, without credentials, Docker, or network. | 1.3 |
| P2 | Selecting an unknown or missing Pattern is an error that lists the valid ids; there is no default. | 1.1 |
| P3 | For every Pattern with ground truth unsafe and in scope, the gated Result is `PG-IAM-004` or `PG-IAM-003`, never `accepted`. | 5.1, 4.3 |
| P4 | The observed Result and reasons of every Pattern equal the entry in `expected-results.json`. | 3.1, 3.2 |
| P5 | The two JSON files are consistent with the catalogue and with the classification rules. | 4.1, 2.2 |
| P6 | `predictions.json` was committed before the first run and has not been changed since. | 2.1 |
| P7 | The runner finishes within 60 s and starts no AWS, Docker, or network call. | 3.3, 3.4 |
| P8 | The CLI sample (RS-01, RS-02, RS-05) gives exit codes 0, 1, 1 and the expected rule ids. | 2.3 |
| P9 | No external dependency, toolchain pin, or published tarball content changes. | 8.2, 8.3 |
| P10 | A message hint never changes which Patterns, regression Cases, or generated Cases are accepted or rejected (differential before and after). | 7.4 |
| P11 | A Pattern with a policy variable is reported with the policy variable message. | 4.2 |

These give evidence from a sample. They do not show that ProofGate works on "typical" projects.

## 14. Traceability

| Requirement | Design section |
| --- | --- |
| 1 Catalogue | 3, 4 |
| 2 Predictions | 6, 5.3 |
| 3 Runner | 5, 7 |
| 4 Classification | 5.2 |
| 5 Fail Closed | 4, 5.2, 13 (P3) |
| 6 Documents | 10 |
| 7 Handling of findings | 8, 12 (D5) |
| 8 Existing behavior and release | 3, 11 |
| 9 Kiro work record | 15 |
| 10 Decision gate | 9 |

## 15. Kiro work record plan

Each Kiro session adds a row to `.kiro/steering/kiroween.md`. The record includes wrong predictions and anything that surprised me, and the result of the decision gate. The probes used in this design (extractor probe, in-process plugin probe) are recorded as probes, with the note that they were deleted.

## 16. Results of the spikes (Task 0)

These facts were measured in throwaway scripts that were deleted afterwards.

- **Failure shape.** With ProofGate, a failed validation makes `app.synth()` throw `UnscopedValidationError` ("Validation failed. A copy of this report can be found in: `<outdir>`"). A clean run does not throw.
- **Report file.** `<outdir>/validation-report.json` has the form `{ version, title, pluginReports: [ { pluginName, pluginVersion, conclusion, violations: [ { description, ruleName, severity, suggestedFix, violatingConstructs: [ { constructPath, constructFqn, libraryVersion, cloudFormationResource: { templatePath, logicalId, propertyPaths } } ] } ] } ] }`. `conclusion` was `failure` and `severity` was `error` in every failing run. When nothing is reported, `pluginReports` is an **empty array** (there is no entry for ProofGate), so "accepted" means: no exception and no plugin report.
- **Two stacks.** Both templates (`StackA.template.json`, `StackB.template.json`) are given to a plugin in one run, so RS-13 is a real two-template case.
- **Constructs offline.** CodeBuild with a GitHub source, a `PolicyStatement` with a resource string containing `${aws:username}`, two stacks, and `Role.fromRoleArn` all synthesize without credentials, Docker, or network, each in a few milliseconds up to 0.4 s. CDK passes the policy variable through unchanged. The CodeBuild role gets a separate default policy whose log-group resources are `Fn::Join` values, and the two statements added with `addToRolePolicy` are literal.
- **Mixed stack (RS-11 shape).** For a stack with a literal escalation path and a `grantRead` Lambda, the report had only `PG-IAM-003` findings (two violations: managed policy, non-literal `Resource`) and no `PG-IAM-004`. The path is not visible in the Result. This confirms the prediction for RS-11 from an early look, so the basis of the RS-11 prediction is "spike (plugin, in process)", not "reasoning".
- **Acknowledgement (decision D1).** CDK's `Validations.of(scope).acknowledge({ id: "ProofGate::PG-IAM-004", reason })` removes the finding: with the acknowledgement on the app, on the stack, or on the violating role, `synth` no longer throws and the report has no violation. The same works for `ProofGate::PG-IAM-003` on an unsupported stack. Without the `ProofGate::` prefix (`PG-IAM-004`), the acknowledgement does not work. The CDK declaration says "currently only annotation warnings can be suppressed", but for plugin violations the observed behavior is that they can be suppressed. A person who writes the stack can therefore silence ProofGate with one line, in the same code. This is observed behavior of one CDK version (2.277.0).
