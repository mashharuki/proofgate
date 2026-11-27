# Checkov on the demo stack (before and after the fix)

Run on 2026-11-27. Checkov 3.4.11 (`uv venv --python 3.12`, `uv pip install checkov`), CloudFormation framework only.
The two inputs are the synthesized templates of `examples/vulnerable-app`: **before** is `src/app.ts` unchanged, **after** is the same file with `fix.patch` applied (the `iam:PassRole` statement removed). `aws-cdk-lib` 2.277.0, `aws-cdk` 2.1148.1, Node.js 26.13.1.

```bash
checkov -f <before|after>/cdk.out/VulnerableAppStack.template.json --framework cloudformation --compact -o cli
```

The raw outputs are in `results/`. The synthesized templates are not stored (`cdk.out` is git-ignored); regenerate them with `cdk synth`.

## Result

| Input  | Passed | Failed | Failed checks (resource `DeveloperRoleDefaultPolicy…`)                             |
| ------ | ------ | ------ | ---------------------------------------------------------------------------------- |
| before | 28     | 2      | CKV_AWS_110 (privilege escalation), CKV_AWS_111 (write access without constraints) |
| after  | 28     | 2      | the same two                                                                       |

Checkov reports the same two findings before and after the fix. Both name the policy of `DeveloperRole`. Neither names the role that would be passed, the service, or the protected bucket, and neither changes when the `iam:PassRole` statement is removed (`lambda:CreateFunction` on `*` is still in the policy). ProofGate reports one path before the fix and nothing after (see `docs/submission/comparison.md`).

Limits of this comparison: one stack, default Checkov rules, no custom policies. It says what Checkov reports for this stack, not that Checkov cannot be configured to do more.
