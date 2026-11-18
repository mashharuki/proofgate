# AGENTS.md

ProofGate is a pre-deployment gate for AWS CDK. It extracts IAM information from synthesized CloudFormation and uses Lean 4 to check an application-specific safety rule (`PG-IAM-004`, a PassRole plus Lambda path to a protected S3 bucket). TypeScript, Lean 4, pnpm workspaces, Node.js 26 or later.

## Where the details are

This file lists only what an agent must not get wrong. The details are in these places and are not repeated here.

- `.kiro/steering/`: product, tech, structure, security, development. `kiroween.md` is included manually.
- `.kiro/specs/proofgate-verification-hardening/`: the active spec (`requirements.md`, `design.md`, `tasks.md`). Follow the task order and stop at each checkpoint in `tasks.md`. Do not start a task that is not approved.
- `docs/`: supported IAM syntax, assumptions, and proofs (Japanese).
- `.serena/memories/`: Serena project memory. Activate the project `proofgate`; the entry point is `mem:core`.

## Commands

Run `nvm use` first (`.nvmrc` pins Node.js 26.13.1). A shell with an older Node.js is a common cause of failures.

- `pnpm install`, `pnpm build`, `pnpm lean:build`
- `pnpm quality`, `pnpm typecheck`, `pnpm test`, `pnpm pack:check`
- `pnpm synth`: both example apps succeed.
- `pnpm verify:demo`: exits with code 1 and prints `PG-IAM-004`. This is the expected result, because `vulnerable-app` is rejected on purpose.

## Rules

- Fail Closed. Never turn unsupported or unknown input into a safe result. A failure to run Lean is not the same as Lean rejecting a theorem.
- TypeScript and Lean must give the same verdict. A disagreement stays a rejection (`PG-IAM-003`).
- Do not describe the Lean check as an independent proof of CloudFormation or IAM semantics. It checks four Booleans computed by TypeScript.
- Do not weaken, skip, or delete an existing test or assertion without the user's approval.
- Do not commit, push, or update dependencies unless the user asks.
- Do not edit generated output: `dist/`, `cdk.out/`, `.lake/`, `Generated.lean`, `.pack/`.
- Kiro must never be a runtime or build dependency of any package.
- Keep existing Japanese comments and documents. Add English next to them, never instead of them. Files under `.kiro` are written in English.
- Never write credentials, tokens, or credit codes to any file.
- Do not add `.kiro` to `.gitignore`. The Kiroween submission needs it committed.

## Kiro usage log

`.kiro/steering/kiroween.md` records Kiro work for the Kiroween 2026 submission.

- Record only work that was actually done in Kiro, one row per real session at least.
- Include failures, rejected options, and counterexamples.
- Never present work done before the Kiro handover as Kiro work.

## Quality gate hook

`.kiro/hooks/proofgate-quality-gate.json` runs `pnpm quality`, `pnpm typecheck`, `pnpm test`, and `pnpm pack:check` after a spec task (`PostTaskExec`). The trigger cannot block completion. If the hook reports a failure, do not mark the task complete. Fix the cause. Do not use `pnpm biome:fix` to silence the gate without reviewing what it changes.
