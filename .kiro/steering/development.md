# Development workflow

Prerequisites: Node.js 26+, pnpm 11, and `elan` (Lean and Lake).

```bash
pnpm install
pnpm build            # tsc in every package
pnpm lean:build       # lake build in packages/cdk-plugin/lean
```

## Checks (run before reporting work as done)

```bash
pnpm quality          # biome check, knip, jscpd
pnpm typecheck        # builds, then tsc --noEmit in every workspace
pnpm test             # builds, then vitest run (includes CDK integration)
pnpm pack:check       # packs the four packages and inspects tarball contents
```

CI runs the same steps and also greps the Lean sources for `sorry` and `axiom`:

```bash
grep -REn '(^|[^[:alnum:]_])sorry([^[:alnum:]_]|$)|^[[:space:]]*axiom[[:space:]]' \
  packages/cdk-plugin/lean --include='*.lean'   # must print nothing
```

Use `pnpm biome:fix` for auto-fixable Biome findings.

## Demo synth

```bash
pnpm synth            # plain synth: both apps succeed
pnpm verify:demo      # PROOFGATE=1: safe-app passes, vulnerable-app is rejected
```

Expected: `safe-app` succeeds. `vulnerable-app` exits 1 with `PG-IAM-004`.

## Rules for changes

- Do not edit generated output (`dist/`, `cdk.out/`, `.lake/`).
- Do not update dependencies, commit, or push unless asked.
- A new rule or supported syntax needs: extractor support or an explicit rejection, evaluator logic, Lean generation, tests for both verdicts, and updates to `docs/SUPPORTED_IAM.md` and `docs/ASSUMPTIONS.md`.
- Keep public package contents in sync with `files` in each `package.json`, and verify with `pnpm pack:check`.

## Generated tests (`tests/pbt/`)

Part of `pnpm test`. They compare an independent oracle, the TypeScript evaluator, and Lean (Model level, one Lean process for all Cases), and read generated CloudFormation fragments back through the extractor (Extractor level, no Lean).

| Variable | Default | Meaning |
| --- | --- | --- |
| `PROOFGATE_PBT_SEED` | fixed in `config.ts` | Base seed. CI always uses the default. |
| `PROOFGATE_PBT_CASES` | 2000 | Model-level Cases |
| `PROOFGATE_PBT_LEAN_CASES` | 2000 | Cases also checked by Lean (boundary and conservative Cases are always included) |
| `PROOFGATE_PBT_EXTRACTOR_CASES` | 1000 | Extractor-level fragments |
| `PROOFGATE_PBT_ONLY` | unset | Run only the Case with this index |

- Replay one failure: `PROOFGATE_PBT_SEED=<seed> PROOFGATE_PBT_ONLY=<case> pnpm exec vitest run tests/pbt/model-agreement.test.ts` (or `extractor.test.ts`). A failure report prints the seed, the case index, the reduced Case as JSON, and this command.
- Routine extra seeds: at most `PROOFGATE_PBT_CASES=5000` with `PROOFGATE_PBT_LEAN_CASES=2000`. 20,000 Cases is a manual deep profile only (one Lean launch per 4,000 Cases).
- Add a regression: save the reduced Case as `tests/pbt/regressions/<name>.json` (`name`, `note`, `label`, `expectedTs`, `config`, `model`).
- A harness error (oracle label differs from the independent oracle, `generateLean` output shape changed) is a defect of the tests, not of the product. A Lean error that maps to no Case is an infrastructure failure, never a pass.
- These tests are not covered by `pnpm typecheck`. Check them with a temporary tsconfig.

## Branches

The spec `proofgate-verification-hardening` is built on stacked branches, one per phase: `hardening/phase-0-baseline` to `hardening/phase-5-extractor`, and later phases on the same pattern. Committing on these branches is allowed. Push and merge need the user's approval. Stop at each checkpoint listed in `tasks.md`.

## Spec task quality gate (Kiro hook)

`.kiro/hooks/proofgate-quality-gate.json` runs after each spec task finishes (trigger `PostTaskExec`). It runs `.kiro/scripts/proofgate-quality-gate.sh` from the project root.

- Purpose: run the existing quality gates automatically so that a failing task is not treated as complete.
- Commands, in order, stopping at the first failure: `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check`.
- Requires Node.js 26 or later. Otherwise it stops with an error that names the Node.js version Kiro's shell uses and suggests `nvm use` (`.nvmrc` pins the version). It also checks that `pnpm` is on `PATH`.
- It never fixes files, commits, or pushes. It writes only a log file under the system temporary directory (`proofgate-quality-gate.log`).
- It does not run on file save. Only a finished spec task triggers it.
- Timeout: 900 seconds. The four commands took about 20 seconds in total when measured. The limit leaves room for the generated test suite planned in `proofgate-verification-hardening` and slower machines.
- Limit of the hook: `PostTaskExec` cannot block the task from finishing. On failure the script exits with code 1 and prints the failing command and the last lines of its output to stderr, which Kiro passes to the agent.
- Rule for the agent: if this hook reports a failure, do not mark the spec task as complete. Fix the cause and rerun the failed command. Do not use auto-fix commands (`pnpm biome:fix`) to make the gate pass without review.
- Note: the demo commands are not part of this gate. Run `pnpm synth` and `pnpm verify:demo` separately. `pnpm verify:demo` exits with code 1 and prints `PG-IAM-004` by design.
- `.kiro` is excluded from Biome (`biome.json`). Biome's Markdown formatter turns the front matter of steering files into a heading and would disable manual inclusion. Format `.kiro` files by hand.
