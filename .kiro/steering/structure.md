# Structure

## Packages (`packages/`, all published to npm)

| Package      | Responsibility                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `model`      | CDK-independent types: `StackModel`, `RoleModel`, `ProofGateConfig`, `Violation`, rule ID             |
| `extractor`  | CloudFormation JSON to `StackModel`. Reports unsupported syntax with the source JSON path             |
| `core`       | TypeScript reference evaluator (`evaluate`, `unknownTrustFindings`, `unknownRoleFindings`; the hand-written tables `launch-supplements.ts` and `implicit-actions.ts`), Lean module generator (`generateLean`), and the tables generated from the AWS Service Reference (`aws-tables.generated.ts`, by `scripts/sync-service-reference.mjs`) |
| `cdk-plugin` | `ProofGateValidator` for the CDK plugin API. Runs Lean, compares results, maps them to CDK violations |

Dependencies: `cdk-plugin` depends on `core`, `extractor`, and `model`. `core` and `extractor` depend on `model`. `model` has no dependencies.

## Lean project (`packages/cdk-plugin/lean/`)

- `ProofGate/Model.lean`: `EscalationPath` with four Boolean facts (`canPassRole`, `canLaunch`, `targetTrustsService`, `targetCanAccess`) and a `service` string for explanation.
- `ProofGate/Security.lean`: `isEscalation`, `safe`, and the supporting theorems.
- `lean-toolchain`, `lakefile.toml`, `lake-manifest.json`: pinned build definition, shipped in the npm tarball.
- `.lake/` is generated. Do not edit it.

## Other directories

- `examples/safe-app`, `examples/vulnerable-app`: CDK apps with the same shape. The vulnerable one adds `iam:PassRole` plus extra Lambda and S3 write actions. `PROOFGATE=1` registers the plugin.
- `tests/`: `proofgate.test.ts` (evaluator, extractor, fail-closed paths, CDK integration) and `core-matching.test.ts` (`?` wildcard and S3 intersection).
- `examples/real-stacks`: one CDK app with realistic Patterns selected by `-c pattern=RS-xx` (`src/patterns/` acceptance set, `src/holdout/` hold-out set), the runner, and the reviewed tables in `data/`. Private, never published.
- Extractor sources: `index.ts` (roles, policies, trust), `resolve.ts` (value resolver for `Resource`), `managed-policies.ts` (checked managed policies, one entry).
- `tests/pbt/`: generated tests, never part of a published package. `support/` holds the generator, the independent oracle (`glob.ts`, `oracle.ts`, type-only imports), the Lean batch runner, the comparison rules, and the shrinker. `regressions/` holds fixed and reduced Cases as JSON. The Extractor-level tests must not import the Lean runner, `@proofgate-cdk/core`, `@proofgate-cdk/cdk-plugin`, or `child_process` (`architecture.test.ts` checks this).
- `docs/`: `architecture.md`, `ASSUMPTIONS.md`, `PROOFS.md`, `SUPPORTED_IAM.md` (Japanese).
- `scripts/`: `run-lean.mjs` (runs Lake in the Lean dir), `check-packages.mjs` (inspects packed tarballs), `pack-rules.mjs`, and `differential.mjs` (compares 1.0.1 with the current extractor and evaluator).
- `.kiro/`: steering, specs (`specs/<name>/` with `requirements.md`, `design.md`, `tasks.md`, and Kiro's `tasks.meta.json`), hooks (`hooks/`), the hook script (`scripts/`), and MCP settings. Must stay committed and not git-ignored. Excluded from Biome.

## Generated output (never edit by hand)

`dist/`, `cdk.out/`, `.lake/`, `Generated.lean`, `.pack/`, `*.tsbuildinfo`, `node_modules/`.
