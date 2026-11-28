# Getting started with ProofGate (English)

ProofGate is a check that runs inside `cdk synth`. It reads the CloudFormation that AWS CDK produces and stops the synthesis when a principal can reach a protected S3 bucket through another role, for example by passing a role to a new Lambda function. A finite model of the IAM facts is checked with Lean 4 before the stack is accepted.

This page lets you see it on one stack: the stack synthesizes normally, ProofGate rejects it, you remove one permission, and ProofGate accepts the same stack.

**Version.** `@proofgate-cdk/cdk-plugin` 1.2.1 from npm (published 2026-11-28). The repository's `main` has the same code, and the CDK report shows `pluginVersion: "1.2.1"`. 1.2.1 fixes a missed path in 1.2.0: an `iam:PassRole` Resource without the literal `:role/`, such as `arn:aws:iam::123456789012:*`, was never counted (see the CHANGELOG).

**Three ways to try it.**

1. In your browser, in a GitHub Codespace (section 0). Nothing to install.
2. On your machine (sections 1 to 5).
3. Without running anything: every CI run of this repository runs the four steps; open the latest run of the "CI" workflow under the Actions tab, job "Demo with the published npm version" (on `main`) or step "Demo on one stack" of "Validate and package".

**No AWS account is used.** Nothing is deployed, and no credentials are read. Everything below is local `cdk synth`.

## 0. In a GitHub Codespace

1. Sign in to GitHub, open https://github.com/mashharuki/proofgate, choose **Code**, then **Codespaces**, then **Create codespace on main**.
2. Wait for the setup to finish (the setup script took about 3.5 minutes in our measurement, after GitHub had created the container). It installs Node.js, pnpm, and elan, builds the repository and the Lean project, and prepares `~/proofgate-npm-demo`, a copy of the demo stack that uses 1.2.1 from npm. It prints `Ready.` and the time of each phase (also in `/tmp/proofgate-setup-times.txt`).
3. In the terminal, run the four steps on the published version:

   ```bash
   node scripts/demo-fix.mjs --app-dir ~/proofgate-npm-demo
   ```

   or follow section 4 by hand in the repository (it uses the same code from the workspace).

Cost: GitHub Free personal accounts include 120 core-hours of Codespaces compute and 15 GB-month of storage per month; this codespace uses the 2-core machine (2 core-hours per hour). Usage counts against the account that creates the codespace, and without a payment method GitHub blocks use when the quota runs out instead of charging (GitHub Docs, "GitHub Codespaces billing", read 2026-11-23). Delete the codespace when you are done.

## 1. Tools

| Tool                            | Version                                                                 | How to check     |
| ------------------------------- | ----------------------------------------------------------------------- | ---------------- |
| Node.js                         | 26 or later (the repository pins 26.13.1 in `.nvmrc`)                   | `node --version` |
| pnpm                            | 11.24.0 (the `packageManager` field)                                    | `pnpm --version` |
| elan (installs Lean 4 and Lake) | any; it installs the pinned toolchain `leanprover/lean4:v4.31.0` itself | `elan --version` |
| git                             | any                                                                     | `git --version`  |

Node.js 26 does not include Corepack, so install pnpm with npm:

```bash
npm install -g pnpm@11.24.0
```

Install elan from https://github.com/leanprover/elan (on macOS and Linux: `curl https://elan.lean-lang.org/elan-init.sh -sSf | sh -s -- -y --default-toolchain none`, then open a new shell).

## 2. Set up

```bash
git clone https://github.com/mashharuki/proofgate.git
cd proofgate
pnpm install
pnpm build
pnpm lean:build
```

Each command should end with exit code 0. `pnpm lean:build` downloads the Lean toolchain the first time, which takes longer than the other steps.

## 3. The stack

`examples/vulnerable-app/src/app.ts` is an ordinary CDK app with two roles:

- `ProtectedDataRole` can be used by Lambda and can read and write objects in the protected bucket `proofgate-protected-data`.
- `DeveloperRole` may pass `ProtectedDataRole` to a service (`iam:PassRole`) and may create Lambda functions (`lambda:CreateFunction`, on `*`).

Each statement looks reasonable on its own. Together, they let the developer role create a function that runs as the data role, and so read the customer data.

## 4. Run it: synth, rejection, fix, pass

### Step 1. Plain synth

```bash
pnpm --filter @proofgate-cdk/vulnerable-app synth
```

Expected: exit code 0. CDK sees nothing wrong. (CDK may also print `85 feature flags are not configured`; that is CDK's own notice.)

### Step 2. Synth with ProofGate

```bash
pnpm --filter @proofgate-cdk/vulnerable-app synth:proofgate
```

Expected: exit code 1, and this output (pnpm adds a first line with the command and a last line `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL ... Exit status 1`):

```
ProofGate is on: protected bucket arn:aws:s3:::proofgate-protected-data
file:/.../proofgate/examples/vulnerable-app/dist/app.js:23:1
ERROR DeveloperRole58EC5A58 can pass role ProtectedDataRoleCDFF69BA to lambda.amazonaws.com and launch it (lambda:CreateFunction); ProtectedDataRoleCDFF69BA trusts lambda.amazonaws.com and can access protected bucket arn:aws:s3:::proofgate-protected-data. (ProofGate)
   VulnerableAppStack/DeveloperRole/Resource (DeveloperRole58EC5A58) aws-cdk-lib.aws_iam.CfnRole
   Suggested fix: Remove iam:PassRole or the launch action from DeveloperRole58EC5A58, remove the service from the trust policy of ProtectedDataRoleCDFF69BA, or prevent that role from accessing the protected bucket.
   Acknowledge with 'ProofGate::PG-IAM-004'
Synthesis finished with errors
```

How to read it:

- **Who:** `DeveloperRole` (the logical ID adds a hash, `DeveloperRole58EC5A58`).
- **Which data, and how:** it can pass `ProtectedDataRole` to Lambda and create a function; that role can access `arn:aws:s3:::proofgate-protected-data`.
- **What to change:** one of the three changes in "Suggested fix". The rule is `PG-IAM-004`.
- The `file:` line points at the compiled JavaScript where `DeveloperRole` is created, not at the TypeScript line to change.
- The full report, with the policy statements involved, is in `examples/vulnerable-app/cdk.out/validation-report.json`.
- The first line comes from the example app, so that you can see the check is on even when it passes. CDK itself prints nothing for a check that passes.

### Step 3. Fix the stack

Open `examples/vulnerable-app/src/app.ts` and delete the `iam:PassRole` statement (the comment and the 7 lines after it):

```diff
-// 条件1: 保護データ用ロールをLambdaへ渡せます。
-developer.addToPolicy(
-  new PolicyStatement({
-    effect: Effect.ALLOW,
-    actions: ["iam:PassRole"],
-    resources: ["arn:aws:iam::*:role/proofgate-protected-data-role"],
-  }),
-);
```

The same diff is stored in `examples/vulnerable-app/fix.patch`.

### Step 4. Synth with ProofGate again

```bash
pnpm --filter @proofgate-cdk/vulnerable-app build
pnpm --filter @proofgate-cdk/vulnerable-app synth:proofgate
```

Expected: exit code 0, with the line `ProofGate is on: protected bucket arn:aws:s3:::proofgate-protected-data` and no error. The developer role can still create Lambda functions. ProofGate does not reject wide permissions by themselves; it rejects the path to the protected bucket.

Restore the file when you are done:

```bash
git checkout examples/vulnerable-app/src/app.ts
pnpm --filter @proofgate-cdk/vulnerable-app build
```

### All four steps in one command

```bash
pnpm demo:fix
```

It runs steps 1 to 4 on the same stack, applies `fix.patch` to a copy in a temporary directory, and checks each exit code. It changes no file of the repository. The same command runs in every CI build of this repository; its log shows the four steps.

### The same four steps with the npm package on your machine

```bash
node scripts/prepare-npm-demo.mjs /tmp/proofgate-npm-demo 1.2.1
cd /tmp/proofgate-npm-demo && npm install && npx tsc -p tsconfig.json && cd -
node scripts/demo-fix.mjs --app-dir /tmp/proofgate-npm-demo
```

## 5. An exception is not a fix

CDK lets the author acknowledge a finding:

```ts
Validations.of(app).acknowledge({ id: "ProofGate::PG-IAM-004", reason: "..." });
```

Then the synthesis succeeds **silently**, and the path still exists. Try it with the trial app:

```bash
cd examples/trial-app
PROOFGATE=1 pnpm exec cdk synth --quiet -c variant=acknowledged
```

Expected: exit code 0 and no ProofGate output. Use an acknowledgement only for an exception that your team has accepted, and review it like code.

## 6. What ProofGate checks, and what it does not

ProofGate reports three kinds of finding:

- `PG-IAM-004`: a path to a protected bucket, through `iam:PassRole` and a service that runs the passed role (879 launch actions from the AWS Service Reference, for Lambda, ECS, EC2, CodeBuild, Step Functions, and others), or through a change of an existing Lambda function, CodeBuild project, or state machine that already runs as such a role.
- `PG-IAM-005`: a role that can change IAM itself (attach a policy to its own role, rewrite another role's trust policy, or create a role and attach a policy to it).
- `PG-IAM-003`: anything ProofGate cannot read (unsupported syntax, an unknown managed policy, a parameter in a `Resource`). It is rejected, never assumed safe.

Not modeled: service control policies, permissions boundaries, session policies, resource policies, explicit deny, conditions such as `iam:PassedToService`, role chains through `sts:AssumeRole`, IAM users and groups, cross-stack and cross-account references, and changes after deployment. The details (in Japanese, with English paragraphs) are in [docs/ASSUMPTIONS.md](ASSUMPTIONS.md) and [docs/SUPPORTED_IAM.md](SUPPORTED_IAM.md).

## 7. What Lean checks

TypeScript reads the template and computes, for each candidate path, a few Boolean facts (for the path above: the principal can pass the role, can launch the service, the role trusts the service, the role can access the bucket). ProofGate writes these facts as a Lean module, and Lean decides the theorem "no candidate path has all its facts true". If TypeScript and Lean disagree, or Lean cannot run, the stack is rejected with `PG-IAM-003`.

So Lean proves a property of that finite model. It does not prove anything about CloudFormation or IAM themselves. The extractor, the evaluator, the generated AWS tables, and the assumption that the synthesized template is what gets deployed are trusted. They are tested against an independent oracle (`tests/pbt/`). See [docs/PROOFS.md](PROOFS.md).

## 8. Time

Measured on 2026-11-23 on the author's macOS machine (Apple silicon), in a fresh clone, but with the pnpm store and the Lean toolchain already downloaded: `pnpm install` 2 s, `pnpm build` 4 s, `pnpm lean:build` 2 s, each synth about 2 s, `pnpm demo:fix` 7 s. A first run without any cache, on a fresh GitHub Actions runner (`ubuntu-latest`, job "Demo with the published npm version", 2026-11-23): Node.js and pnpm set-up 15 s, elan under 1 s, `npm install` of 1.2.0 and the build of the copy 9 s, and the four steps 20 s, which includes the download of the Lean toolchain and the first build of the bundled Lean project; 46 s in total. In a new GitHub Codespace (2-core machine, 2026-11-23), the setup script of the dev container took 3 min 21 s: elan 1 s, `pnpm install` 19 s, `pnpm build` 39 s, `pnpm lean:build` 123 s (most of it the download of the Lean toolchain), and the npm copy of the demo 18 s. Add the time GitHub needs to create the container before that script starts; it was not measured. Then `node scripts/demo-fix.mjs --app-dir ~/proofgate-npm-demo` ran the four steps with the expected results.
