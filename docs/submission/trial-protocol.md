# Trial protocol: can a CDK user fix the stack alone?

Spec `proofgate-kiroween-submission`, R6. The user (the author of ProofGate) runs the trials. Kiro wrote this protocol and the sheet, and records only results that the user sends.

## Participants

- Two people who have written or reviewed AWS CDK code before. They have not worked on ProofGate and have not seen a ProofGate demo.
- Each participant uses their own machine, or a GitHub Codespace once that entry exists.

## What the participant gets

1. A link to `docs/GETTING_STARTED.en.md` in the repository.
2. This task, read out or sent as text, word for word:

   > This repository has a CDK app that ProofGate rejects. Using only `docs/GETTING_STARTED.en.md`, find out why the app is rejected. Then change the CDK code so that ProofGate accepts the app **without an exception**, and tell us when you are done. Please think aloud while you work.

3. The sheet (`trial-sheet.md`) for the observer.

Nothing else: no slides, no explanation of IAM or of Lean, no hint about which lines to change.

## What the observer may say

- Before the start: the task text above, and "I can't answer questions about ProofGate during the task; please use the guide."
- During the task: only "Please use the guide" when asked about ProofGate, CDK, or the fix. Questions and requests for help are written on the sheet, word for word.
- The observer may help with problems of the machine that the guide does not cover (no network, a full disk). Such help is written on the sheet.
- The participant may stop at any time. The time and the reason are written down.

## Two times, measured separately

- **Setup time:** from opening the guide to the end of `pnpm lean:build` (guide section 2). If the participant's machine already has the tools, the time of the missing parts is measured, and the sheet says which were already there.
- **Task time:** from the start of guide section 4 to the participant saying "done" or stopping.

## What is recorded

See `trial-sheet.md`. In short:

- where the participant looked first in the rejection output;
- whether they could say, from the terminal alone, who can reach the data, which data, and what to change;
- what they changed, as a diff, and whether the gate then accepted the stack;
- whether they used an acknowledgement or an allow list instead of a fix;
- text they misread or asked about;
- their own words at the end: who would use this, what it stopped, how they fixed it.

## Version

Write the commit (`git log --oneline -1`) or the npm version that the participant used on the sheet. The planned version is 1.2.0 after its release; a trial before the release uses `main`.

## After the trial

- The user sends the filled sheet (text or a photo) to Kiro.
- Kiro copies it into `trial-results.md` without rewording (a sheet in another language is kept as written, with an English translation marked as a translation), and maps each confusion to the output candidates C1 to C4 (`.kiro/specs/proofgate-kiroween-submission/output-checklist.md`) or to a new one.
- Results are cited in the submission only as recorded, with the number of participants. Until the sheets arrive, `trial-results.md` says "not verified".
- Participants are named only with their consent; otherwise as "participant 1" and "participant 2".
