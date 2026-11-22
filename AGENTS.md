# AGENTS.md

ProofGate is a pre-deployment gate for AWS CDK. It extracts IAM information from synthesized CloudFormation and uses Lean 4 to check an application-specific safety rule (`PG-IAM-004`: a path to a protected S3 bucket from `iam:PassRole` plus a launch action of a service such as Lambda, ECS, or EC2, or from a change of an existing Lambda function, CodeBuild project, or state machine that already runs as a role; and `PG-IAM-005`: a role that can change IAM itself). TypeScript, Lean 4, pnpm workspaces, Node.js 26 or later.

## Where the details are

This file lists only what an agent must not get wrong. The details are in these places and are not repeated here.

- `.kiro/steering/`: product, tech, structure, security, development. `kiroween.md` is included manually.
- `.kiro/specs/proofgate-brushup/`: the active spec (`requirements.md`, `design.md`, `tasks.md`, `data-verification.md`). Follow the task order and stop at each checkpoint in `tasks.md`. Do not start a task that is not approved.
- `.kiro/specs/proofgate-implicit-role-paths/`: paths without `iam:PassRole` (requirements, design, tasks, `data-verification.md`). All four steps are merged.
- `.kiro/specs/proofgate-self-escalation/`: `PG-IAM-005`, roles that change IAM themselves (requirements, design, tasks, `data-verification.md`). Steps 1 and 2 are merged; Step 3 is documentation and release preparation. After it: `.kiro/steering/direction-research.md` lists the next directions (data perimeter, role chains), in the order the user approved.
- `.kiro/specs/proofgate-cdk-construct-support/`: finished and merged.
- `.kiro/specs/proofgate-real-stack-validation/`: the 14 realistic CDK Patterns and `pnpm real-stacks`. Its Phase 4 is done; results are in `docs/REAL_STACKS.md`.
- `.kiro/specs/proofgate-verification-hardening/`: finished and merged.
- `tests/pbt/`: generated tests (seeded generator, independent oracle, batched Lean runner, shrinker). How to run and replay them is in `.kiro/steering/development.md`.
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
- Do not push, merge, or update dependencies unless the user asks. Committing is allowed on the stacked phase branches `hardening/phase-*` (finished spec) and `realstacks/phase-*` (spec `proofgate-real-stack-validation`), `support/phase-*` (spec `proofgate-cdk-construct-support`), and `brushup/*` (active spec `proofgate-brushup`); elsewhere, commit only when asked.
- Stop at every checkpoint in `tasks.md` and wait for the user.
- A change to a matching rule may only add findings or rejections. Turning unsafe into safe needs the user's approval.
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
