# Output checklist: what a reviewer can read from the rejection (R3)

Source: step 2 of `pnpm demo:fix` on branch `submission/step-1-demo`, 2026-11-23 (workspace packages, which report `pluginVersion` 1.1.2). The terminal text below is copied unchanged.

```
ProofGate is on: protected bucket arn:aws:s3:::proofgate-protected-data
file:/…/examples/vulnerable-app/dist/app.js:23:1
ERROR DeveloperRole58EC5A58 can pass role ProtectedDataRoleCDFF69BA to lambda.amazonaws.com and launch it (lambda:CreateFunction); ProtectedDataRoleCDFF69BA trusts lambda.amazonaws.com and can access protected bucket arn:aws:s3:::proofgate-protected-data. (ProofGate)
   VulnerableAppStack/DeveloperRole/Resource (DeveloperRole58EC5A58) aws-cdk-lib.aws_iam.CfnRole
   Suggested fix: Remove iam:PassRole or the launch action from DeveloperRole58EC5A58, remove the service from the trust policy of ProtectedDataRoleCDFF69BA, or prevent that role from accessing the protected bucket.
   Acknowledge with 'ProofGate::PG-IAM-004'
Synthesis finished with errors
```

The first line comes from the example app (added in this step), not from the plugin.

## The three questions

| Question | In the terminal | Only in `cdk.out/validation-report.json` | Not anywhere |
| --- | --- | --- | --- |
| Who can do it? | the logical ID `DeveloperRole58EC5A58` and the construct path `VulnerableAppStack/DeveloperRole/Resource` | `constructPath`, `logicalId` | the role name `proofgate-vulnerable-developer` |
| Which data does it reach, and how? | the bucket ARN; the passed role as a logical ID `ProtectedDataRoleCDFF69BA`; the service `lambda.amazonaws.com`; the launch action `lambda:CreateFunction` | `ruleName: PG-IAM-004` | the construct path of the passed role (`VulnerableAppStack/ProtectedDataRole`) |
| What do I change next? | three alternatives in "Suggested fix"; a location `dist/app.js:23:1`, which is the compiled JavaScript at the `Role` constructor of the principal | `propertyPaths`: the two statements of `DeveloperRoleDefaultPolicy6E63DC77` and the one of `ProtectedDataRoleDefaultPolicyAAE05E68` | which alternative is the smallest change; the TypeScript line of the `iam:PassRole` statement |

Other observations:

- The rule ID `PG-IAM-004` appears in the terminal only in the line `Acknowledge with 'ProofGate::PG-IAM-004'`, right after the suggested fix. A reader could take the acknowledgement for the way to fix it.
- The terminal does not say why the path matters (that the developer role can run code as the data role). The words "can pass role … and launch it" say it only to a reader who knows `iam:PassRole`.

## Candidates (from design section 4; not done until a trial shows the need)

| ID | Change | Where | Answers |
| --- | --- | --- | --- |
| C1 | Name the statements to change and put the smallest fix first | plugin message (product) | "What do I change next?" |
| C2 | Print the construct path of the passed role | plugin message (product) | "Which data, and how?" |
| C3 | Run the example with `node --enable-source-maps`, so the location points at `src/app.ts` | `examples/*/cdk.json` (not product) | "What do I change next?" |
| C4 | Explain in the guide that the acknowledgement records an exception and fixes nothing | guide (not product) | the acknowledgement line |

Each trial observation (R6) is mapped to one of these, or to a new candidate, in `docs/submission/trial-results.md`.
