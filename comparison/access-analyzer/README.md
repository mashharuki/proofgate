# IAM Access Analyzer on the demo stack (before and after the fix)

Run on 2026-11-27 with AWS CLI 2.36.29, region ap-northeast-1. No analyzer resource is needed; both commands only read the policy document.
The input is the inline policy of `DeveloperRole` taken from the synthesized template of `examples/vulnerable-app` (**before**: `src/app.ts` unchanged; **after**: with `fix.patch`, the `iam:PassRole` statement removed), wrapped as `{"Version": "2012-10-17", "Statement": [...]}`.

```bash
aws accessanalyzer validate-policy --policy-type IDENTITY_POLICY --policy-document file://<policy>.json
aws accessanalyzer check-access-not-granted --policy-type IDENTITY_POLICY --policy-document file://<policy>.json --access actions=iam:PassRole
```

The raw outputs are in `results/`.

## Result

| Command                                        | before     | after      |
| ---------------------------------------------- | ---------- | ---------- |
| `validate-policy`                              | 0 findings | 0 findings |
| `check-access-not-granted` with `iam:PassRole` | FAIL       | PASS       |

- `validate-policy` reports nothing for either policy.
- `check-access-not-granted` detects the removal of `iam:PassRole`, but only because the action was named in the call. It looks at one policy document. It does not take the target role, the service that runs it, or the protected bucket as input, so it cannot say that a path to a bucket exists.

Limits of this comparison: one stack, one policy document, the two commands above. Other Access Analyzer checks (external access findings, unused access, `check-no-new-access`) were not run.
