# How Kiro was used to build ProofGate

Every claim below links a file or a commit in this repository. The source is the Kiro usage log, [`.kiro/steering/kiroween.md`](../../.kiro/steering/kiroween.md): one row per real session, failures included, 108 rows from 2026-11-18 to 2026-11-23 at the time of writing.

## Kiro app

All the work described here was done in **Kiro IDE**, from 2026-11-18 on. Kiro CLI, Web, and Crew were not used.

## Spec-driven development

Seven specs live under [`.kiro/specs/`](../../.kiro/specs/), each with `requirements.md`, `design.md`, and `tasks.md`, next to one research folder. The workflow was the same every time:

- The user approves each document before the next one is written.
- `tasks.md` has checkpoints where Kiro stops and reports.
- Each step goes on its own branch and becomes its own pull request. The user approves every merge: 48 merge commits so far.
- Rules that every spec repeats: tests first, with the failing run recorded; predictions committed before the run; changes may only add findings, unless the user approves otherwise.

| Spec                                                                                      | What it produced                                                                                                                     |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| [`proofgate-verification-hardening`](../../.kiro/specs/proofgate-verification-hardening/) | an independent oracle and generated tests that compare the oracle, the TypeScript evaluator, and Lean; three defects found and fixed |
| [`proofgate-real-stack-validation`](../../.kiro/specs/proofgate-real-stack-validation/)   | 14 realistic CDK Patterns with an expected table and a runner (`pnpm real-stacks`)                                                   |
| [`proofgate-cdk-construct-support`](../../.kiro/specs/proofgate-cdk-construct-support/)   | reading `Fn::Join`, `Ref`, `GetAtt`, managed policies, and unnamed roles, which ordinary CDK code produces                           |
| [`proofgate-brushup`](../../.kiro/specs/proofgate-brushup/)                               | AWS tables generated from the AWS Service Reference (879 launch actions); launch services beyond Lambda; 44 S3 object actions        |
| [`proofgate-direction-research`](../../.kiro/specs/proofgate-direction-research/)         | the raw notes of three research sub-agents; the analysis is [`direction-research.md`](../../.kiro/steering/direction-research.md)    |
| [`proofgate-implicit-role-paths`](../../.kiro/specs/proofgate-implicit-role-paths/)       | paths without `iam:PassRole` (changing an existing Lambda function, CodeBuild project, or state machine)                             |
| [`proofgate-self-escalation`](../../.kiro/specs/proofgate-self-escalation/)               | the rule `PG-IAM-005` (a role that can change IAM itself) and a third Lean structure                                                 |
| [`proofgate-kiroween-submission`](../../.kiro/specs/proofgate-kiroween-submission/)       | this submission: the demo on one stack, the guide, the release, Codespaces, the comparison                                           |

Compared with prompting without a spec: the checkpoints made Kiro stop where its own plan was wrong. Two examples: the submission spec's requirements contradicted the trial dates, so Kiro offered two options instead of picking one; and the self-escalation prediction for RS-70 failed, described below.

## One example end to end: the missed partial-bucket access (D1)

1. **Found.** While writing the design of the first spec, Kiro read the IAM and S3 pages through the AWS Documentation MCP server and probed the evaluator. The probe showed that a grant on part of the protected bucket (`bucket/reports/*`) was judged safe ([design, section 3](../../.kiro/specs/proofgate-verification-hardening/design.md); log row of 2026-11-18, "Spec, AWS Documentation MCP").
2. **Specified.** It was added to the requirements as defect D1, "S3 access by intersection", after the user approved the scope clarification (commit [`af9fcdf`](https://github.com/mashharuki/proofgate/commit/af9fcdf)).
3. **Red first.** The generated suite ran against the unfixed code: 532 soundness failures, 178 of them with a prefix-scoped grant (commit [`83a357a`](https://github.com/mashharuki/proofgate/commit/83a357a)).
4. **Fixed.** S3 access is now decided by intersecting the Resource with the bucket's objects, and the failures went from 178 to 0 (commit [`e11b4b2`](https://github.com/mashharuki/proofgate/commit/e11b4b2)).
5. **Checked.** A differential over 18,014 inputs removed no finding, and the demo outputs were byte-identical (commit [`09226c8`](https://github.com/mashharuki/proofgate/commit/09226c8)).

## A failure that the process caught: RS-70

Before writing the `PG-IAM-005` code, Kiro committed predictions for ten new Patterns. One of them predicted that `iam:CreateRole` on `role/ci-*` with `iam:AttachRolePolicy` on `role/data-*` (account `*`) is safe. The implementation reported it. Kiro first took this for a false positive and started to change the oracle. Before touching the product, it read the IAM API Reference and found that a role's `Path` may contain a colon, so one created role can match both patterns. The prediction was wrong, not the rule. Kiro reverted the oracle change, and the user approved correcting the ground truth (commit [`596a155`](https://github.com/mashharuki/proofgate/commit/596a155)). The prediction file was never edited.

## Property-based testing

ProofGate's generated tests are an **in-repository** property-based harness, not Kiro's built-in PBT feature, which was not used. The harness has a seeded generator, an independent oracle that may not import the product's matchers, a shrinker, and one Lean process for thousands of cases ([`tests/pbt/`](../../tests/pbt/)). `fast-check` was evaluated and rejected, because per-value shrinking conflicts with batched Lean runs. What it caught:

- D1 above;
- `?` not treated as a one-character wildcard (430 of the 532 failing cases contained a `?`; a count of features present, not a proof of cause);
- an IAM policy variable that made the plugin return success;
- later, a mistake in the oracle itself: it read `*` in an ARN differently from AWS. This was found by checking against 44 decisions of the real IAM engine (`SimulateCustomPolicy`, through the AWS MCP Server) and corrected in commit [`527a92a`](https://github.com/mashharuki/proofgate/commit/527a92a).

## Steering

[`.kiro/steering/`](../../.kiro/steering/) holds `product.md`, `tech.md`, `structure.md`, `security.md`, `development.md`, `direction-research.md`, and the manually included `kiroween.md`. The strategy that mattered most was writing the security invariants as rules Kiro must not break:

- Fail Closed;
- TypeScript and Lean must agree;
- never describe Lean as proving IAM itself;
- corrections may only add findings.

[`security.md`](../../.kiro/steering/security.md) lists every matching rule that has been decided, with its date and evidence, so a later session cannot quietly reverse one. [`AGENTS.md`](../../AGENTS.md) only points to steering and does not repeat it.

## Agent hooks

[`.kiro/hooks/proofgate-quality-gate.json`](../../.kiro/hooks/proofgate-quality-gate.json) (trigger `PostTaskExec`) runs [`.kiro/scripts/proofgate-quality-gate.sh`](../../.kiro/scripts/proofgate-quality-gate.sh) after a spec task:

- `pnpm quality`, `typecheck`, `test`, and `pack:check`, stopping at the first failure;
- a Node.js version check;
- no auto-fix, no commit, no push.

The rule in steering is that a failing gate means the task is not done. During this work, Kiro ran the same script directly after each task, and it caught real failures, for example a Biome error on a generated copy and an unquoted YAML line in a new CI job. The log does not show whether Kiro fired the hook on its own after a task, so that is not claimed here.

## MCP

- **AWS Documentation MCP server and AWS MCP Server**: IAM, S3, CloudFormation, and Lambda documentation; `ValidatePolicy` and `SimulateCustomPolicy` for real IAM decisions; the AWS Service Reference behind the generated tables. The log also records sessions in which these servers were unavailable and the work waited.
- **Serena**: project memories and symbol-level code navigation.
- Context7 and Codegraph are configured in [`.kiro/settings/mcp.json`](../../.kiro/settings/mcp.json), but the log does not record their use.

## Sub-agents, custom agents, powers

- Three research sub-agents ran in parallel once (incidents, privilege-escalation catalogues, maturity model). They led to the two new path classes and the pathfinding.cloud benchmark (log row of 2026-11-22, "Research and verification").
- No custom agent was created, and no Kiro power was used.

## Trust boundary (what Lean does and does not prove)

TypeScript reads the synthesized CloudFormation and computes a few Boolean facts per candidate path. Lean decides that no candidate has all its facts true. This is a proof about that finite model.

- The extractor, the evaluator, the generated AWS tables, and the assumption that the synthesized template is what gets deployed are trusted, and they are tested against the independent oracle.
- If TypeScript and Lean disagree, or Lean cannot run, the stack is rejected.
- Lean does not prove CloudFormation or IAM semantics ([`docs/PROOFS.md`](../PROOFS.md)).
