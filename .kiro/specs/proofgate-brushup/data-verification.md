# Data verification with the AWS MCP Server (2026-11-21)

Spec: `proofgate-brushup`. Branch: `brushup/data-verification`.

## 1. Why

At the end of Step 2 I wrote down a weakness: the independent oracle and the evaluator now read the **same** AWS data (the tables generated from the AWS Service Reference), so an error in that data would not show up when the two are compared. The only protection was a test with a few spot values that I had read from AWS pages. The user connected the AWS MCP Server and asked for a thorough investigation of this part. This document records what was checked, with which source, and what was found.

## 2. Tools and limits

| Tool | Use | Side effects |
| --- | --- | --- |
| `search_documentation`, `read_documentation` | Official AWS documentation (verbatim page text) | none |
| `run_script` with `accessanalyzer:ValidatePolicy` | Does an IAM action name exist? (`INVALID_ACTION`) | none |
| `run_script` with `iam:SimulateCustomPolicy` | The real IAM engine's decision for a statement and a request | none (no resource is created) |

Limits found on the way:

- `ValidatePolicy` reports only that an action does not exist. It does **not** check whether a resource ARN fits an action (no finding for `s3:GetObject` on a bucket ARN, or `s3:PutBucketPolicy` on an object ARN).
- `SimulateCustomPolicy` does not know S3 resource types either: every combination of S3 action and bucket or object ARN was "allowed" when the statement allowed it. It does know actions that take no resource (`s3:ListAllMyBuckets` is denied for any ARN).
- So **no AWS API tells which resource type an action takes.** The classification of S3 actions into object actions and bucket actions can only be checked against documentation. Three sources were used: the Service Reference JSON (source of the tables), the Service Authorization Reference (pages for S3 and ECS), and the Amazon S3 User Guide page "Required permissions for Amazon S3 API operations" (written by the S3 team).

## 3. Results

### 3.1 Do the actions exist? (`ValidatePolicy`)

90 names were checked: the 44 object actions, the 7 bucket actions, and 39 launch actions of Lambda, ECS, EC2, IAM, CodeBuild, CloudFormation, Step Functions, Glue, SageMaker, Batch, EventBridge, Scheduler, S3, and others. **No name was reported as invalid.** The tool does report a made-up name (`s3:NotARealAction`), so the check can fail.

### 3.2 The 44 S3 object actions against the S3 User Guide

- The guide lists 25 object operations. 24 are in the 44. The 25th, `ListBucketMultipartUploads`, is listed by the guide under object operations but takes the **bucket** resource in the Service Reference (it lists uploads). It is correctly not in the 44.
- 20 of the 44 are not on the guide page: the replication family (`ReplicateObject`, `ReplicateDelete`, `ReplicateTags`, `ObjectOwnerOverrideToBucketOwner`, `GetObjectVersionForReplication`, `InitiateReplication`), annotations (10 actions), attributes, and torrent. The replication ones are corroborated by AWS replication policies that put `s3:ReplicateObject` on `destination-bucket/*` (object ARN). The 44 all take the `object` resource, and 34 also take `accesspointobject`.
- The guide says that for object operations the `Resource` must be the object ARN, and for bucket operations the bucket ARN. This is the rule of decision D1.
- **Result:** no object action of the guide is missing from the 44. Nothing in the 44 contradicts the guide.

### 3.3 The 7 bucket actions

All 7 are listed by the guide as bucket operations: `PutBucketPolicy`, `DeleteBucketPolicy`, `PutBucketAcl`, `PutBucketOwnershipControls`, `PutBucketPublicAccessBlock` (the five "Permissions management" bucket actions), `PutReplicationConfiguration`, `PutLifecycleConfiguration` (a judgment of mine: they are not "Permissions management").

Not counted, on purpose, among the write actions on the bucket resource: notifications, inventory and analytics (they write the list of object **keys and metadata**, not the content, to another bucket), logging, versioning, encryption, CORS, website, tagging, object lock, accelerate, `DeleteBucket` (only for an empty bucket). A test now pins this list (`tests/aws-tables.test.ts`).

Nuance on `PutReplicationConfiguration`: the guide and the replication articles show that the call also needs `iam:PassRole` for a replication role that trusts `s3.amazonaws.com`. Alone it does not start a replication. Counting it as access to the bucket is therefore a conservative, transitive reading, and it is documented as such. The path "pass a role to S3 and set a replication" is also covered by the launch table (`s3:putreplicationconfiguration` to `s3.amazonaws.com`).

### 3.4 S3 permissions that are not counted (14)

"Permissions management" actions on other resource types: access point policies (`PutAccessPointPolicy`, `DeleteAccessPointPolicy`, and the Object Lambda versions), the Multi-Region Access Point policy, S3 Access Grants (`CreateAccessGrant`, `CreateAccessGrantsLocation`, instance policy, and others), and the account-level `PutAccountPublicAccessBlock` / `PutAccessPointPublicAccessBlock`. They act on resources that are not the bucket ARN, so the model cannot tie them to a protected bucket. The S3 guide states that access point permissions "are effective only if the underlying bucket allows the same permissions" (the bucket must delegate), which is why they are documented as outside the model. `s3:CreateAccessGrantsLocation` is in the launch table (it needs `iam:PassRole`, passed-to service not given in the data). `PutBucketAbac` (attribute-based access control by tags) is not modeled because ProofGate does not evaluate conditions.

### 3.5 Matching rules against the real IAM engine (`SimulateCustomPolicy`, 44 observations)

Saved as `tests/pbt/aws-observations.json`, compared in `tests/pbt/aws-observations.test.ts`.

| Rule | AWS | Oracle (`glob.ts`) | Evaluator (`matches`) |
| --- | --- | --- | --- |
| Action names are case-insensitive; `*` and `?` | yes (13 of 13) | same | same |
| Resource ARNs are **case-sensitive** (bucket, key, role name, `ARN:AWS:...`) | yes | same | **no** (matches ignoring case): rows R05, R06, R17, P07 |
| A `*` crosses a colon **anywhere** (`arn:aws:s3:*b/k` matches `arn:aws:s3:::b/k`; `arn:aws:iam:*role/x` matches a role ARN); a `?` may stand for a colon (`arn:aws:s3:?:b/k` matches `arn:aws:s3:::b/k`) | yes | **no** before the fix (rows R13, P11, Q03, Q04, Q05, Q09, Q10, Q11, Q14; fixed, see section 7) | yes |
| `?` is one character; `b/*` does not match the bucket ARN `b` | yes | same | same |
| A wildcard partition (`arn:*:iam::*:role/x`) matches `aws` and `aws-cn` | yes | same | same |

Consequences:

- The evaluator is **never narrower** than AWS in the 44 observations. Where it differs, it matches more (case): an over-approximation, as documented.
- The oracle is **narrower** than AWS for a `*` inside a segment. It labels such cases "safe" (the tag `ARN_STAR_SPAN`, category `conservative`) although AWS matches them. The product is not affected (the evaluator already reads them as AWS does), but the label is wrong and the old statement "a `*` crossing a colon is a conservative over-approximation" was inaccurate: it is **exact**. Corrected in `.kiro/steering/security.md`. Fixing the oracle means changing the generator's categories and tags; it is a follow-up (section 5).

### 3.6 The launch table

- The first generation rule took every same-service, non-tagging action that a PassRole-bearing operation authorizes. It included read and list actions that the operation only depends on: `lambda:GetLayerVersion`, `glue:GetJob`, `glue:GetJobs`, `cloudformation:GetResource`, `cloudformation:ListResources`, `states:RevealSecrets`, `ecs:CreateCluster`. With Step 5 this would have made a holder of `lambda:GetLayerVersion` a "launcher" of Lambda: false findings.
- The rule is now: write or permission-management actions only, and, if one of them is the operation's own action (same name), only that one. Over all 464 services (908 PassRole-bearing operations): 996 actions before, **879** now. All 26 launch actions that must stay (Lambda `CreateFunction` and `UpdateFunctionConfiguration`, ECS `RunTask`, `StartTask`, `CreateService`, `UpdateService`, `RegisterTaskDefinition`, EC2 `RunInstances`, `AssociateIamInstanceProfile`, `RequestSpotInstances`, CodeBuild, CloudFormation, Step Functions, Glue, S3 replication, SageMaker, Batch, EventBridge, Scheduler) were kept.
- The mapping of `ecs:RegisterTaskDefinition` changed from two services to `ecs-tasks.amazonaws.com` only. The first table was wrong: it took `ecs.amazonaws.com` from a different operation. The Service Authorization Reference for ECS says `ecs-tasks.amazonaws.com`. My own earlier test expectation had copied the wrong value from the first generated file.
- Documentation spot checks (verbatim pages): ECS trust `ecs-tasks.amazonaws.com`, infrastructure role `ecs.amazonaws.com`; EC2 needs `iam:PassRole` for `RunInstances`, `AssociateIamInstanceProfile`, `ReplaceIamInstanceProfileAssociation`; CodeBuild trust `codebuild.amazonaws.com` (an optional `aws:SourceArn` condition, which ProofGate ignores on trust policies); CloudFormation and Step Functions as in 3.8.
- Not decidable from the data: whether the caller controls **what** the service does with the role. For Lambda, ECS, EC2, CodeBuild, CloudFormation, Step Functions, Glue, and SageMaker it runs the caller's code; for others (for example `ec2:CreateFlowLogs`, EventBridge) the service only acts in a fixed way. All of them are read as launches: an over-approximation that the table cannot refine.
- 23 actions have no `iam:PassedToService` value and are read as passing to any service: `aoss`, `codebuild` fleets, `cognito-idp` (8), `cognito-sync`, EMR studio and notebook execution, IoT managed integrations, Machine Learning, `s3:CreateAccessGrantsLocation`, Storage Gateway (3), and Timestream (2). A principal that holds one of them and can pass any role to a service that reaches a protected bucket would be flagged. They are rare in CDK deploy roles; a role with `*` already matches everything.

### 3.7 Lambda facts used by PR #10 (`UpdateFunctionConfiguration`)

- The API reference lists, for `UpdateFunctionConfiguration`, `Role`, `Layers`, `Handler`, `Environment`, `Runtime`, and `ImageConfig` (`EntryPoint`, `Command`, `WorkingDirectory`: "container image configuration values that override the values in the container image Dockerfile").
- The documentation page "Adding layers to Event Functions": to use a layer you must have permission to call `GetLayerVersion`; "for functions in your AWS account, you must have this permission in your user policy"; for another account the owner grants it in a resource-based policy.
- The AWS Security Blog says that to pass a role to Lambda, the principal needs permission to update the function itself.
- **So the rule of PR #10 is justified for container-image functions with a configuration update alone, and for zip functions only together with `lambda:GetLayerVersion`.** For a zip function without `GetLayerVersion` it over-reports. This replaces the earlier sentence "could not be confirmed" in `docs/ASSUMPTIONS.md`.

### 3.8 Facts that change the design of Step 5 and later

1. **Step Functions trust principals have a regional form.** The AWS knowledge center says the trust policy must list `states.<region>.amazonaws.com` or `states.amazonaws.com`. The table has the global form only. A role that trusts the regional form would fall into the "unknown service" rule (`PG-IAM-003`). Step 5 must normalize a trust principal of the form `<service>.<region>.amazonaws.com` to `<service>.amazonaws.com` before the comparison.
2. **CloudFormation can use a role without `iam:PassRole`.** The API reference for `roleArn` says: "CloudFormation uses this role even if the users don't have permission to pass it" (provided the user can operate on the stack, and the stack already has the role). A principal with `cloudformation:UpdateStack` (or `CreateChangeSet` and `ExecuteChangeSet`, `DeleteStack`) on a stack whose service role reaches a protected bucket can act with that role **without PassRole**. The rule of `PG-IAM-004` requires PassRole, so it cannot see this. The same class: `lambda:UpdateFunctionCode` on an existing function, `codebuild:StartBuild` with overrides, `states:StartExecution`, and similar. It is outside the requirements ("paths that need no `iam:PassRole`") and is the best candidate for the next spec.

## 4. Changes made on this branch

| Change | Files |
| --- | --- |
| Launch table: write and permission-management actions only, own action first (996 to 879), `RegisterTaskDefinition` corrected | `scripts/sync-service-reference.mjs`, `packages/core/src/aws-tables.generated.ts` |
| Tests that pin the exclusions, the corrected mapping, and the S3 User Guide lists (independent of the generated data) | `tests/aws-tables.test.ts` |
| 44 real IAM engine decisions and a test that fixes the known deviations of the oracle (2) and of the evaluator (4, over-approximation only) | `tests/pbt/aws-observations.json`, `tests/pbt/aws-observations.test.ts` |
| Docs: Lambda facts, the replication nuance, the correction of the "colon" statement | `docs/ASSUMPTIONS.md`, `.kiro/steering/security.md` |

No behavior of ProofGate changes: nothing reads the launch table yet.

## 5. Recommended follow-ups (not done; the user decides)

| # | Follow-up | Why | Size |
| --- | --- | --- | --- |
| a | Step 5: normalize regional trust principals; reconsider the 23 any-service entries | 3.6, 3.8 (1) | small, inside Step 5 |
| b | Make the oracle read `*` and `?` as plain wildcards that also stand for a colon; drop the `ARN_STAR_SPAN` conservative category | 3.5 | **done on 2026-11-21 (the user chose b), section 7** |
| c | A spec for paths that need no `iam:PassRole` (CloudFormation stack roles first) | 3.8 (2) | large |
| d | Count the "Permissions management" actions of other S3 resource types when the Resource is `*` | 3.4 | small, needs a decision |
| e | Make resource ARN matching case-sensitive in the evaluator | 3.5 | would turn findings off: needs the user's approval |

## 6. What this does not show

- It does not prove that the Service Reference is complete. It shows that three independent sources agree on the S3 lists and on the launch actions of the checked services, and that no name is unknown to IAM.
- The 44 observations are a sample of matching rules, not a proof that the evaluator or the oracle is right everywhere.
- `SimulateCustomPolicy` evaluates policies as text. It does not check that a request would really be sent with that resource ARN.
- No AWS resource was created, changed, or deleted. The account that the MCP Server uses is not recorded here.

## 7. Follow-up b: the oracle was corrected (2026-11-21)

The user chose follow-up b. 14 more observations of the real IAM engine (`tests/pbt/aws-observations-2.json`) showed that a `?` also stands for a colon, so the oracle's whole colon rule (`colonAware`) was wrong, not only the `*` part. Before the change the old oracle disagreed with AWS on 9 of the 45 resource observations (R13, P11, Q03, Q04, Q05, Q09, Q10, Q11, Q14); the first test run failed on them. Changes:

- `tests/pbt/support/glob.ts` lost the colon rule: `*` is any run of characters, `?` any one character, the colon is an ordinary character. `compileGlob` has no option any more.
- The generator no longer has the tag `ARN_STAR_SPAN` and the access mode `starSpan`. A Resource such as `arn:aws:s3:*<bucket>/*` is now a valid form (`access:star-span`) with the label unsafe. The conservative plans that used `starSpan` were replaced by combinations of the remaining tags. The indices of generated cases shift again (no stored report depends on them).
- Assertions of existing tests that encoded the old rule were changed, with the user's approval ("b"): the test "lets only a segment-final * cross a colon (Decision 8.2)" in `tests/pbt/oracle.test.ts` (now: `*` and `?` stand for a colon anywhere), and the two readings (`arn` and `plain`) of the brute-force intersection test (now one reading; the random patterns of both old runs are kept). The tests of the independent oracle for the S3 and Lambda rules were not touched.
- `tests/pbt/aws-observations.test.ts` now expects **no** deviation of the oracle (45 resource and 13 action observations). The deviations of the evaluator (case only, over-approximation) are unchanged.
- The product is unchanged: the evaluator already read the colon as AWS does.

Checks: 199 generated tests pass; seeds 12345, 987654321, 424242 and 5000 cases with 2000 Lean-checked pass.
