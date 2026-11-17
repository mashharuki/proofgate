# ProofGate

ProofGate is a Lean-powered deployment gate for AWS CDK. The first vertical slice detects this privilege-escalation path in synthesized CloudFormation:

1. an IAM principal can `iam:PassRole` a target role;
2. the same principal can create a Lambda function, or update both its role configuration and code; and
3. the target role trusts the Lambda service; and
4. the target role can access a configured protected S3 bucket.

The repository is independent of Kiro. It uses TypeScript, Lean 4, pnpm, and the stable AWS CDK `IPolicyValidationPlugin` API.

## Requirements

- Node.js 22 or newer
- pnpm 11
- Lean 4 / Lake through `elan` (the exact version is pinned in `lean/lean-toolchain`)

## Run the demo

```bash
pnpm install
pnpm build
pnpm lean:build

# Both ordinary syntheses succeed.
pnpm --filter @proofgate/safe-app synth
pnpm --filter @proofgate/vulnerable-app synth

# ProofGate allows the safe app.
pnpm --filter @proofgate/safe-app synth:proofgate

# ProofGate rejects this with PG-IAM-004 and exit status 1.
pnpm --filter @proofgate/vulnerable-app synth:proofgate
```

Run the complete automated suite with `pnpm test`.

## CDK integration

```ts
import { App, Validations } from "aws-cdk-lib";
import { ProofGateValidator } from "@proofgate/cdk-plugin";

const app = new App();
Validations.of(app).addPlugins(
  new ProofGateValidator({
    protectedBucketArns: ["arn:aws:s3:::production-data"],
  }),
);
```

The plugin reads `IPolicyValidationContext.templatePaths`, extracts a deliberately limited IAM model, generates a concrete Lean module, and asks the Lean kernel to decide that no complete escalation path exists. Unsupported policy syntax is reported as `PG-IAM-003` and fails closed.

## Current scope

This is the first end-to-end slice, not a complete IAM evaluator. It supports local IAM roles and inline policies with literal `Effect`, `Action`, and `Resource` values. See [supported IAM](docs/SUPPORTED_IAM.md) and [trust boundaries](docs/ASSUMPTIONS.md) before using it as a deployment control.
