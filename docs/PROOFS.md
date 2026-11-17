# Proofs

`ProofGate.Security` defines an `EscalationPath` with four Boolean facts:

- `canPassRole`
- `canControlLambda`
- `targetIsLambdaAssumable`
- `targetCanAccess`

`isEscalation` is their conjunction. `safe` checks every candidate path and returns true only when every `isEscalation` result is false. The generated theorem has this shape:

```lean
theorem generatedStackIsSafe : ProofGate.safe generatedPaths = true := by
  native_decide
```

For a vulnerable stack, the proposition reduces to `false = true`, so Lean refuses to build the theorem. The checked-in core contains no `sorry` or project-defined axioms. Non-vacuity is enforced by the extractor: a template with no IAM roles or no supported policy statements is rejected before proof generation.

This theorem proves a property of the generated finite model. It does not prove the extractor or generator correct, nor does it model all AWS IAM semantics.
