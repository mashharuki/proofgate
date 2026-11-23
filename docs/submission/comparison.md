# Comparison: plain synth, cdk-nag, and ProofGate on the same stack

Spec `proofgate-kiroween-submission`, R7. **Part 1 (the plan) was written and committed on 2026-11-23 before any run.** Parts 2 and 3 are added after the run and do not change Part 1.

## Part 1. Plan

### Question

For each tool and each input: **from this output alone, what can the reviewer decide about this change?** In particular: is there a path from a principal to the protected data, who is involved, and what to change. No tool is declared better before the run. A problem reported by more than one tool is kept in the table.

### Inputs

Both are the demo stack of `examples/vulnerable-app` (one CDK app, stack `VulnerableAppStack`):

- **before**: `examples/vulnerable-app/src/app.ts` unchanged.
- **after**: the same file with `examples/vulnerable-app/fix.patch` applied (the `iam:PassRole` statement removed).

The run script copies the file into a git-ignored work directory and adds an opt-in line for cdk-nag before `app.synth()`:

```ts
if (process.env.CDK_NAG === "1") Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }));
```

No other line changes. ProofGate stays registered only when `PROOFGATE=1`, as in the example.

### Tools and versions (exact)

| Tool                    | Version                                        | Mode                                                             |
| ----------------------- | ---------------------------------------------- | ---------------------------------------------------------------- |
| AWS CDK (`aws-cdk-lib`) | 2.277.0                                        | `cdk synth` with CLI `aws-cdk` 2.1148.1, `constructs` 10.8.1     |
| cdk-nag                 | 3.1.0 (npm `latest` on 2026-11-23, Apache-2.0) | rule pack `AwsSolutionsChecks`, `verbose: true`, no suppressions |
| ProofGate               | `@proofgate-cdk/cdk-plugin` 1.2.0 from npm     | protected bucket `arn:aws:s3:::proofgate-protected-data`         |

Node.js 26.13.1, TypeScript 7.0.2, and `@types/node` 26.6.6 compile the copies. The comparison runs in `comparison/cdk-nag/`, which has its own `package.json` and npm `package-lock.json`. It is outside the pnpm workspace, so no workspace package, the root `package.json`, and `pnpm-lock.yaml` do not change.

### Runs

For each input (`before`, `after`), three runs from `comparison/cdk-nag/`:

1. `plain`: `cdk synth --quiet` with neither `CDK_NAG` nor `PROOFGATE`.
2. `cdk-nag`: `CDK_NAG=1 cdk synth --quiet`.
3. `proofgate`: `PROOFGATE=1 cdk synth --quiet`.

The script `comparison/cdk-nag/run.mjs` records, per run: the exit code, the full terminal output, and the files that the tools write in `cdk.out` (`validation-report.json`, and cdk-nag's `AwsSolutions-VulnerableAppStack-NagReport.csv`). They are stored unchanged under `comparison/cdk-nag/results/<input>-<run>/`.

### How the table is filled

- Per run: the exit code, the findings (rule ID and the resource each one names), and whether the output names (a) the principal, (b) the protected data, (c) the role that connects them, and (d) a change to make.
- Then one sentence per tool and input: what the reviewer can decide from it.
- Limits are stated: this is one stack and one rule pack. The result says nothing about other stacks, other cdk-nag rule packs, or tools that were not run, such as IAM Access Analyzer, which needs AWS credentials.

### To recreate

```bash
cd comparison/cdk-nag
npm ci
node run.mjs
```

The script needs `elan` on `PATH` for ProofGate (the Lean toolchain is downloaded on the first run).

## Part 2. Deviations from the plan

- **How cdk-nag is registered.** The plan said `Aspects.of(app).add(new AwsSolutionsChecks({ verbose: true }))`. That is the cdk-nag 2 API, and it did not compile with 3.1.0. cdk-nag 3 is a CDK validation plugin, the same mechanism as ProofGate: `Validations.of(app).addPlugins(new AwsSolutionsChecks(app, { verbose: true }))` (README and `MIGRATION.md` of cdk-nag 3.1.0). The run uses that line, still only when `CDK_NAG=1`.
- **No CSV report.** cdk-nag 3 writes its findings into CDK's `validation-report.json`, like every validation plugin, and wrote no `NagReport.csv`. The stored files are `terminal.txt`, `exit-code.txt`, and `validation-report.json` per run.
- The copies and their `cdk.out` directories are in a temporary directory outside the repository (so that the quality tools do not check them); only `results/` is kept.

## Part 3. Results (run on 2026-11-23)

Versions as planned (`comparison/cdk-nag/results/versions.txt`): `aws-cdk-lib` 2.277.0, `cdk-nag` 3.1.0, `constructs` 10.8.1, `@proofgate-cdk/cdk-plugin` 1.2.0, `aws-cdk` 2.1148.1, `typescript` 7.0.2, Node.js v26.13.1.

### Exit codes and findings

| Input  | Run       | Exit | Findings (rule, resource the finding names)                                                                                                                                                                                                                                                       |
| ------ | --------- | ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| before | plain     | 0    | none                                                                                                                                                                                                                                                                                              |
| before | cdk-nag   | 1    | `AwsSolutions-IAM5[Resource::arn:aws:s3:::proofgate-protected-data/*]` on `ProtectedDataRole/DefaultPolicy`; `AwsSolutions-IAM5[Resource::arn:aws:iam::*:role/proofgate-protected-data-role]` on `DeveloperRole/DefaultPolicy`; `AwsSolutions-IAM5[Resource::*]` on `DeveloperRole/DefaultPolicy` |
| before | ProofGate | 1    | `PG-IAM-004` on `DeveloperRole`: can pass `ProtectedDataRole` to `lambda.amazonaws.com` and launch it (`lambda:CreateFunction`); that role trusts Lambda and can access `arn:aws:s3:::proofgate-protected-data`                                                                                   |
| after  | plain     | 0    | none                                                                                                                                                                                                                                                                                              |
| after  | cdk-nag   | 1    | `AwsSolutions-IAM5[Resource::arn:aws:s3:::proofgate-protected-data/*]` on `ProtectedDataRole/DefaultPolicy`; `AwsSolutions-IAM5[Resource::*]` on `DeveloperRole/DefaultPolicy`                                                                                                                    |
| after  | ProofGate | 0    | none (the line `ProofGate is on: ...` shows that the gate ran)                                                                                                                                                                                                                                    |

### What the output names

| Run (before) | (a) principal                                                                        | (b) protected data                                                           | (c) role that connects them                                                                                   | (d) a change to make                                                                                         |
| ------------ | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| plain        | no                                                                                   | no                                                                           | no                                                                                                            | no                                                                                                           |
| cdk-nag      | the policies of `DeveloperRole` and of `ProtectedDataRole`, as two separate findings | the bucket ARN appears as a wildcard Resource of `ProtectedDataRole`         | no; the `iam:PassRole` statement is reported for the `*` in its account part, not as a link between the roles | justify each wildcard with a suppression, or narrow it                                                       |
| ProofGate    | `DeveloperRole`                                                                      | `arn:aws:s3:::proofgate-protected-data` (the bucket configured as protected) | `ProtectedDataRole`, through Lambda                                                                           | remove `iam:PassRole` or the launch action, remove Lambda from the trust policy, or remove the bucket access |

### What the reviewer can decide

- **Plain synth**: the template is valid. Nothing about permissions.
- **cdk-nag (`AwsSolutionsChecks`)**: three statements contain wildcards and need a justification or a narrower Resource. It reports each statement on its own. The output does not say that the two roles together let `DeveloperRole` read the protected bucket. After the fix, two wildcard findings remain, so the synth still fails. Those two (the bucket's objects for the data role, and `*` for the Lambda actions) are ordinary in this stack, and a team that uses cdk-nag would suppress or narrow them.
- **ProofGate**: there is one path from `DeveloperRole` to the protected bucket, through `ProtectedDataRole` and Lambda, and these are the three ways to break it. After the fix there is no such path, and the synth passes, although wide Lambda permissions remain.

### Overlap and limits

- Both tools flag the `iam:PassRole` statement before the fix. cdk-nag flags it for the wildcard account (`arn:aws:iam::*:role/...`). ProofGate flags it as one part of the path. A reviewer who follows cdk-nag and narrows the account to a literal account ID would clear that cdk-nag finding and keep the path; ProofGate would still report it. This was not run; it follows from the two rules, and it is marked here as a deduction, not a result.
- The tools answer different questions: cdk-nag checks each resource against a rule pack of best practices, and ProofGate checks one application rule (no path from a principal to the protected bucket). They can run together; both are CDK validation plugins.
- One stack, one rule pack, default settings. Nothing here says how the tools compare on other stacks, with other rule packs (for example `NIST80053R5Checks`), or with suppressions. IAM Access Analyzer was not run, because it needs AWS credentials.

Raw outputs: `comparison/cdk-nag/results/<input>-<run>/` (`terminal.txt`, `exit-code.txt`, `validation-report.json`), unchanged.
