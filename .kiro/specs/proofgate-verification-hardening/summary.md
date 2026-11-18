# proofgate-verification-hardening: summary for the submission write-up

This summary is written from the repository and from the usage log in `.kiro/steering/kiroween.md`. Numbers come from runs recorded there.

## Problem

ProofGate decides whether a CloudFormation stack contains a privilege-escalation path (`PG-IAM-004`). Two components decide: a TypeScript evaluator and a Lean theorem generated from the evaluator's facts. Before this spec the tests were fixed examples.

Comparing TypeScript with Lean is weak. Lean receives four Booleans per candidate path that TypeScript computed, and it checks their conjunction. If the wildcard matching in TypeScript is wrong, both sides receive the same wrong facts and they agree. Using the evaluator as the expected answer would be circular.

## What was built

- **An independent oracle.** Expected verdicts come from how each Case was constructed (label) and from a second, separately written matcher that follows the AWS rules read from the AWS documentation. The two must agree on every Case, otherwise the run reports a harness error instead of a product defect.
- **Four kinds of Case.** Safe, unsafe, and boundary Cases use only forms that AWS treats as valid. A separate `conservative` kind carries forms that ProofGate over-approximates on purpose. ProofGate may report them as unsafe only when a tagged statement explains the finding.
- **One Lean process for all Cases.** About 10 ms per Case, with a strict reading of the result: a Lean error that maps to no Case, a missing marker, or 100 or more errors is an infrastructure failure, never a pass.
- **Shrinking.** A failing Case is reduced to a smaller valid Case that still fails, and confirmed again before it is reported.
- **A second layer** reads generated CloudFormation fragments back through the extractor (24 kinds of unsupported construct, 3 kinds of empty input). It never starts Lean.
- **A self-check** feeds deliberately broken evaluators, oracles, and Lean output through the same runner and requires each to be detected.
- **A tarball rule** that rejects test-only files in the published packages.

## What it found

Run against the unfixed code first (red first), with the default seed and 2,000 Cases:

- 532 failures where the evaluator missed a path that AWS allows. The cause was two defects: `?` was not treated as a single-character wildcard, and access to only a part of the protected bucket (a prefix, one object) was not counted as access. After the first fix 178 failures remained; after the second, 0.
- A third defect, IAM policy variables such as `${aws:username}` in a `Resource`, was found by the extractor-level tests (8 of 13 new tests failed before the fix).

All three fixes only add findings or rejections. A differential run of the old and new evaluator over 18,014 inputs found no input that lost a finding, and the demo outputs are identical to `main`. One of the fixes rejects more input than before (policy variables), which can affect users of those variables.

After the fixes, 5 extra seeds of 5,000 Cases found no counterexample at the model level, and 5 extra seeds of 5,000 fragments found none at the extractor level. The self-check detected every broken component.

Cost: 198 tests in 15 files. On the GitHub Actions runner the test step took 25 to 44 s (15 s before), and the whole job 72 to 102 s (61 s before).

## What this does and does not show

- Passing generated tests is evidence, not proof.
- Lean checks that the four facts agree with its logic. It does not verify the CloudFormation template, the IAM statements, the extractor, the generator, or AWS IAM behavior.
- The oracle is an independent implementation of rules taken from the AWS documentation. Explicit Deny, SCPs, permissions boundaries, conditions, cross-account effects, and S3 actions beyond object read, write, and delete are outside it.
- Some over-approximations are kept on purpose and are visible in the tests: Resource matching ignores letter case, a `*` may cross a colon, a trust principal `*` counts as Lambda-assumable.

## How Kiro was used

All of the work recorded in the log was done in Kiro IDE.

| Kiro feature | Use | Evidence |
| --- | --- | --- |
| Steering | Six steering files and `AGENTS.md`; they were injected into the agent's context during the work | `.kiro/steering/`, `AGENTS.md` |
| Specs | `requirements.md`, `design.md`, `tasks.md`, each approved by the user, revised after reviews, then executed task by task with checkpoints. One task (9.6) was run by the user from Kiro's task list | `.kiro/specs/proofgate-verification-hardening/`, `tasks.meta.json` |
| Hooks | One `PostTaskExec` hook runs the four quality gates. The script was verified by running it directly. Whether Kiro fired it after a task is not confirmed | `.kiro/hooks/`, `.kiro/scripts/` |
| MCP | The AWS Documentation MCP server was used to read the IAM, PassRole, S3, and trust documentation for the oracle rules. The Serena MCP server was used for project memories. Other configured servers (context7, codegraph) were not used | design section 8; usage log |
| Property-based testing feature | **Not used.** The properties are written in the Kiro format in design section 14, linked to requirement IDs, but the tests are an in-repo harness. A per-value property runner does not fit one batched Lean process and the shrinking rules, so `fast-check` was evaluated and rejected | design sections 7 and 14 |
| Custom agents, Powers, Kiro Crew, CLI, Web | Not used | |

ProofGate development before the handover to Kiro (the packages, the Lean project, the demo apps, the first tests) was not done in Kiro and is not counted as such.

## Process notes

The log records mistakes as well as results: a wrongly counted number of tasks, two wrong expectations in my first policy-variable tests, a harness limit that my first self-check hit, a checkpoint passed before its approval, and a Markdown formatter that broke a steering file's front matter. They are part of the record on purpose.
