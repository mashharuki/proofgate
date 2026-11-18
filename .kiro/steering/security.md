# Security rules

## Fail Closed

Any doubt means rejection. Never turn an unknown into "safe".

- Unsupported syntax (`Condition`, `NotAction`, `NotResource`, intrinsic functions, managed policies, unknown IAM resource types) reports `PG-IAM-003`.
- An empty `protectedBucketArns` is rejected, because the proof would be vacuous.
- A template with no roles or no supported statements is rejected before proof generation.
- An unreadable template, or a Lean or Lake execution failure, reports `PG-IAM-003`.
- A Lean failure to run is not the same as Lean rejecting the theorem. Only the explicit markers `PROOFGATE_SAFE` and `PROOFGATE_UNSAFE` count as decisions.
- Do not add a code path that skips verification or downgrades an error to a warning.

## TypeScript and Lean must agree

`evaluate` in `core` and the Lean theorem must give the same verdict for every model. If they disagree, `ProofGateValidator` fails closed with `PG-IAM-003`. Changes to the evaluator, the generator, or the Lean core need tests that exercise both sides.

## Trust boundary

Trusted: the extractor, the action and resource matcher, the Lean generator, the pinned Lean toolchain, and the assumption that the synthesized template matches what is deployed.

Not modeled: SCPs, permissions boundaries, session policies, resource policies, explicit-deny interplay, transitive role assumption, cross-stack and cross-account references, `iam:PassedToService` and other conditions, drift after deploy.

The Lean theorem proves a property of the generated finite model only. Do not claim it proves the extractor, the generator, or AWS IAM semantics. Docs and demo text must keep that wording accurate.

## Hygiene

- Generated Lean is written to a temp directory and removed afterward.
- Shell calls use argument arrays, never string interpolation of template content.
- No credentials, tokens, or credit codes in files, logs, or fixtures. MCP settings must not hold secrets.
