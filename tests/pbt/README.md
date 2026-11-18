# Generated tests (`tests/pbt/`)

These tests are part of `pnpm test`. They are not published with any package.

## What they check

- **Model level** (`model-agreement.test.ts`): a seeded generator makes IAM models whose safety under AWS semantics is known by construction. An independent oracle, the TypeScript evaluator, and Lean are compared. All Lean checks run in one process.
- **Extractor level** (`extractor.test.ts`): generated CloudFormation fragments are read back through the extractor. A supported fragment must give exactly the expected model. A fragment with one unsupported construct must give no model and a finding at the right location. This level never starts Lean (`architecture.test.ts` checks the imports).
- **Self-check** (`selfcheck.test.ts`): deliberately broken evaluators, oracles, and Lean output are fed through the same runner. The runner must detect each of them.
- **Regressions** (`regressions.test.ts`): fixed and reduced Cases in `regressions/*.json`.

What the checks prove is limited. Lean receives four Booleans per candidate path from TypeScript and checks that they agree with its logic. Lean does not verify the CloudFormation template or the IAM statements. The oracle is an independent implementation of the AWS rules recorded in the design, not a proof.

## Variables

| Variable                        | Default                      | Meaning                                                                          |
| ------------------------------- | ---------------------------- | -------------------------------------------------------------------------------- |
| `PROOFGATE_PBT_SEED`            | fixed in `support/config.ts` | Base seed. CI always uses the default.                                           |
| `PROOFGATE_PBT_CASES`           | 2000                         | Model-level Cases                                                                |
| `PROOFGATE_PBT_LEAN_CASES`      | 2000                         | Cases also checked by Lean (boundary and conservative Cases are always included) |
| `PROOFGATE_PBT_EXTRACTOR_CASES` | 1000                         | Extractor-level fragments                                                        |
| `PROOFGATE_PBT_ONLY`            | unset                        | Run only the Case with this index                                                |

An invalid value fails the run. It is never replaced by a default.

## Common commands

```bash
# everything, as in CI
pnpm test

# only the generated tests
pnpm exec vitest run tests/pbt

# replay one failure printed in a report
PROOFGATE_PBT_SEED=<seed> PROOFGATE_PBT_ONLY=<case> pnpm exec vitest run tests/pbt/model-agreement.test.ts

# more seeds (routine upper limit)
PROOFGATE_PBT_SEED=7 PROOFGATE_PBT_CASES=5000 PROOFGATE_PBT_LEAN_CASES=2000 pnpm exec vitest run tests/pbt
```

## Deep profile (manual only)

`PROOFGATE_PBT_CASES=20000 PROOFGATE_PBT_LEAN_CASES=20000` runs a larger profile. Lean needs one launch per 4,000 Cases, so this uses 5 launches and takes minutes. It is not part of CI.

## Reading a failure

- `COUNTEREXAMPLE`: a defect candidate in the product. The report prints the seed, the case index, the mismatch kind, the verdicts, a replay command, and the Case reduced to a smaller one that still fails, as JSON. Save the JSON to `regressions/<name>.json` (`name`, `note`, `label`, `expectedTs`, `config`, `model`) to keep it.
- `HARNESS ERROR`: a defect in the tests themselves (the generator's label differs from the independent oracle, or the output of `generateLean` has a new shape). It is not a product defect.
- A Lean error that maps to no Case, a missing verdict marker, or 100 or more Lean errors is an infrastructure failure. It is never counted as a pass.

## Time

About 14 s for the Model-level test and 17 s for the whole `pnpm test` on a development machine; 38.5 s for the test run on the GitHub Actions runner (`ubuntu-latest`) in CI.

## Type checking

`pnpm typecheck` does not cover `tests/`. Check new test code with a temporary tsconfig that extends `tsconfig.base.json`.
