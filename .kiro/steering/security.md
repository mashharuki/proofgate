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

## Matching rules that are decided

- S3 access means: the Resource denotes a set of ARNs that intersects the object set of the protected bucket (`<bucket>/` plus any key). A prefix (`bucket/reports/*`), a single object, a bucket wildcard that can match the bucket, and `arn:aws:s3:::*` count. A bucket-level ARN alone does not, and neither does a different bucket.
- `?` is a single-character wildcard and `*` matches any length, in Actions and Resources.
- An IAM policy variable (`${aws:username}` and similar) in a Resource string is not evaluated. The Statement is rejected as unsupported with `PG-IAM-003`, and no partial model is returned. A Resource that is already an intrinsic keeps its existing findings. This rejects more input than before and has no opt-out.
- Kept on purpose as conservative over-approximations (they only add findings): Resource ARN matching ignores letter case (IAM is case-sensitive: checked with `SimulateCustomPolicy` on 2026-11-21), trust principal `*` counts as Lambda-assumable, a Logical ID or bare role name in `iam:PassRole` Resource counts, and Deny statements are ignored.
- A `*` and a `?` may stand for a colon anywhere in an ARN. This is **not** an over-approximation: IAM does exactly this (observed with `SimulateCustomPolicy`, `tests/pbt/aws-observations*.json`). The independent oracle read it differently until 2026-11-21 and was corrected; it now agrees with all 58 observations.
- Any change to these rules must keep the corrections one-directional: it may add findings or rejections. Turning an unsafe verdict into safe, or accepting what `PG-IAM-003` rejects, needs the user's approval.

## Trust boundary

Trusted: the extractor, the action and resource matcher, the Lean generator, the pinned Lean toolchain, and the assumption that the synthesized template matches what is deployed.

Not modeled: SCPs, permissions boundaries, session policies, resource policies, explicit-deny interplay, transitive role assumption, cross-stack and cross-account references, `iam:PassedToService` and other conditions, drift after deploy.

The Lean theorem proves a property of the generated finite model only. Do not claim it proves the extractor, the generator, or AWS IAM semantics. Docs and demo text must keep that wording accurate.

## Hygiene

- Generated Lean is written to a temp directory and removed afterward.
- Shell calls use argument arrays, never string interpolation of template content.
- No credentials, tokens, or credit codes in files, logs, or fixtures. MCP settings must not hold secrets.
