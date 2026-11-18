# Structure

## Packages (`packages/`, all published to npm)

| Package      | Responsibility                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------- |
| `model`      | CDK-independent types: `StackModel`, `RoleModel`, `ProofGateConfig`, `Violation`, rule ID             |
| `extractor`  | CloudFormation JSON to `StackModel`. Reports unsupported syntax with the source JSON path             |
| `core`       | TypeScript reference evaluator (`evaluate`) and Lean module generator (`generateLean`)                |
| `cdk-plugin` | `ProofGateValidator` for the CDK plugin API. Runs Lean, compares results, maps them to CDK violations |

Dependencies: `cdk-plugin` depends on `core`, `extractor`, and `model`. `core` and `extractor` depend on `model`. `model` has no dependencies.

## Lean project (`packages/cdk-plugin/lean/`)

- `ProofGate/Model.lean`: `EscalationPath` with four Boolean facts.
- `ProofGate/Security.lean`: `isEscalation`, `safe`, and the supporting theorems.
- `lean-toolchain`, `lakefile.toml`, `lake-manifest.json`: pinned build definition, shipped in the npm tarball.
- `.lake/` is generated. Do not edit it.

## Other directories

- `examples/safe-app`, `examples/vulnerable-app`: CDK apps with the same shape. The vulnerable one adds `iam:PassRole` plus extra Lambda and S3 write actions. `PROOFGATE=1` registers the plugin.
- `tests/`: Vitest suite covering the evaluator, extractor, fail-closed paths, and CDK integration.
- `docs/`: `architecture.md`, `ASSUMPTIONS.md`, `PROOFS.md`, `SUPPORTED_IAM.md` (Japanese).
- `scripts/`: `run-lean.mjs` (runs Lake in the Lean dir) and `check-packages.mjs` (inspects packed tarballs).
- `.kiro/`: steering, specs, hooks, and MCP settings. Must stay committed and not git-ignored.

## Generated output (never edit by hand)

`dist/`, `cdk.out/`, `.lake/`, `Generated.lean`, `.pack/`, `*.tsbuildinfo`, `node_modules/`.
