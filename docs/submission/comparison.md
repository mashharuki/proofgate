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

| Tool | Version | Mode |
| --- | --- | --- |
| AWS CDK (`aws-cdk-lib`) | 2.277.0 | `cdk synth` with CLI `aws-cdk` 2.1148.1, `constructs` 10.8.1 |
| cdk-nag | 3.1.0 (npm `latest` on 2026-11-23, Apache-2.0) | rule pack `AwsSolutionsChecks`, `verbose: true`, no suppressions |
| ProofGate | `@proofgate-cdk/cdk-plugin` 1.2.0 from npm | protected bucket `arn:aws:s3:::proofgate-protected-data` |

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
