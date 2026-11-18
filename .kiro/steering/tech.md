# Technology

| Area                | Choice                                                                            |
| ------------------- | --------------------------------------------------------------------------------- |
| Language            | TypeScript 7 (ESM, `"type": "module"`), compiled with `tsc` to `dist/`            |
| Runtime             | Node.js 26 or later (`engines.node >=26`, `.nvmrc` pins 26.13.1)                  |
| Package manager     | pnpm 11 workspaces (`packageManager` field pins the exact version)                |
| Infrastructure      | AWS CDK v2, using the stable `IPolicyValidationPlugin` API (`aws-cdk-lib` ^2.277) |
| Formal verification | Lean 4 with Lake; toolchain pinned in `packages/cdk-plugin/lean/lean-toolchain`   |
| Tests               | Vitest (`tests/proofgate.test.ts`)                                                |
| Quality             | Biome (format, lint, import order), Knip (unused code), jscpd (duplication)       |
| CI                  | GitHub Actions `.github/workflows/ci.yml`                                         |

## Conventions

- Pin exact versions of dev tools. Do not update dependencies without being asked.
- Existing source comments and docs are in Japanese. Keep them. Add English alongside, never replace.
- The Lean project is built on first verification by the published package (`lake build`). Do not commit `.lake`.
- Lean sources must not contain `sorry` or project-defined `axiom`. CI audits this.
- Kiro must never appear in `dependencies`, `peerDependencies`, or runtime code paths.
- Never commit credentials, tokens, or credit codes.
