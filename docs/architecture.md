# Architecture

The CDK app synthesizes CloudFormation and invokes `ProofGateValidator` through the stable policy-validation plugin API. The validator processes every template path as follows:

1. `@proofgate/extractor` converts supported IAM roles and inline policies into a deterministic intermediate model.
2. `@proofgate/core` resolves four finite graph facts: `canPassRole`, `canControlLambda`, `targetIsLambdaAssumable`, and `targetCanAccess`.
3. The generator serializes every candidate path into a concrete Lean `EscalationPath` value.
4. `ProofGate.Security.safe` requires that no path has all three edges.
5. `lake env lean` checks a generated `generatedStackIsSafe` theorem using `native_decide`.
6. The plugin compares the TypeScript reference result with the Lean result. Any disagreement fails closed. A Lean execution/toolchain error is distinct from a theorem rejection and is reported as `PG-IAM-003`.

The first slice runs Lean as a local subprocess. A later packaging phase can replace this with a pinned prebuilt verifier without changing the intermediate model.
