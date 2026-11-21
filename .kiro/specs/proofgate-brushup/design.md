# Design: proofgate-brushup

Status: DRAFT, awaiting approval. `tasks.md` is not written yet. No production code has been changed for this spec.
Requirements: [requirements.md](./requirements.md) (approved 2026-11-21, with the answers at its end).

## 1. Summary

The main idea is to stop hand-writing AWS facts. Two of the requirements (S3 access and launch services) need a list of AWS actions. Writing those lists by hand is how the gaps of 1.1.x happened: the S3 list had 3 actions, and the Lambda rule missed `UpdateFunctionConfiguration` until PR #10. AWS publishes the same facts in a machine-readable form, the **Service Reference** (the data behind the Service Authorization Reference). This design builds both tables from that data, with a dev-time script, and commits the result as generated source. The evaluator, the oracle, and the tests read the committed tables. Nothing goes to the network at run time or in CI.

| Requirement | Rule | Direction |
| --- | --- | --- |
| 1 S3 access | B1: 44 object actions on the object set, 7 bucket actions on the bucket | adds findings |
| 2 Launch services | B2: any action that passes a role to service S, with a target that trusts S; unknown trusted service is `PG-IAM-003` | adds findings and rejections |
| 3 Role-less templates | B3: a template with no `AWS::IAM::*` resource is accepted without a proof | accepts more (approved) |
| 4 `Fn::Sub` | B4: the string form with known variables | accepts more |
| 5 Managed policies | B5: two more entries in the table of 1.1.0 | accepts more |
| 6 Adoption guide | documents only | none |

## 2. Evidence and sources (read on 2026-11-21)

- Service Reference index: `https://servicereference.us-east-1.amazonaws.com/` lists 464 services, each with a JSON file (`.../v1/<service>/<service>.json`). The whole set is 18 MB.
- Each JSON has `Actions` (with `Resources` and `Annotations.Properties` such as `IsTaggingOnly`, `IsPermissionManagement`) and `Operations` (each API operation with its `AuthorizedActions`). When an operation passes a role, its `AuthorizedActions` contain `iam:PassRole`, usually with `Context."iam:PassedToService"` (the service principals the role may be passed to). Example, `ecs` operation `RunTask`: `iam:PassRole` with `ecs-tasks.amazonaws.com` and `ecs.amazonaws.com`, plus `ecs:RunTask` and `ecs:TagResource`.
- The human-readable pages say the same, for example `list_amazonelasticcontainerservice.html` (RunTask, StartTask, CreateService, RegisterTaskDefinition with `iam:PassRole`) and `list_amazons3.html` (PutBucketPolicy and PutBucketAcl on the `bucket` resource, access level "Permissions management").
- A trial extraction (temporary, under `/tmp`, not committed) gave: 1143 actions that come with `iam:PassRole` in some operation, 183 distinct passed-to service principals, 31 actions whose operation has no `PassedToService` value, and 138 tagging actions (`TagResource` and similar) that only appear because an operation also tags. For Lambda it gives `lambda:CreateFunction` and `lambda:UpdateFunctionConfiguration` (to `lambda.amazonaws.com`) and not `lambda:UpdateFunctionCode`, which is exactly the rule of PR #10, reached there by hand.
- For S3 (`s3.json`): 44 actions take the `object` resource type, and 5 actions are "Permissions management" on the `bucket` resource (`PutBucketPolicy`, `DeleteBucketPolicy`, `PutBucketAcl`, `PutBucketOwnershipControls`, `PutBucketPublicAccessBlock`).

## 3. Generated tables

- `scripts/sync-service-reference.mjs` (new, dev-time only, needs the network): downloads the index and the service files into a temporary directory, extracts the two tables below, writes `packages/core/src/aws-tables.generated.ts`, and deletes the downloads. It prints the counts and the `modified` time of each file used. It is not run by `pnpm test` or CI.
- The generated module exports plain constants, a header with the source URL, the date, and the counts, and a note "generated, do not edit". It is formatted so that Biome accepts it. It ships in `dist/` like the rest of `core`.
- A test checks spot values against facts read on the HTML pages (section 2), so that a broken extraction cannot pass unnoticed: Lambda's two actions, `ecs:RunTask`, `ec2:RunInstances`, `codebuild:CreateProject`, `cloudformation:CreateStack`, `states:CreateStateMachine`, `glue:CreateJob`, no tagging action, the 44 and 5 S3 actions.
- Trust assumption (documented): the Service Reference is accurate and complete on the date of the snapshot. New AWS actions after that date are unknown; section 5.4 keeps that from hiding a path where the trust side is unknown.

## 4. B1: complete S3 access

A statement gives access to a protected bucket if it allows an S3 action and a Resource such that:

1. the action is one of the **44 object actions** and the Resource intersects the object set of the bucket (the decided rule D1, unchanged), or
2. the action is one of the **bucket grant actions**, and the Resource intersects the bucket ARN itself (`arn:aws:s3:::<name>`, no `/`). The bucket grant actions are the 5 "Permissions management" bucket actions, plus `s3:PutReplicationConfiguration` (copies every new object to another bucket) and `s3:PutLifecycleConfiguration` (can expire every object).

An action pattern counts if it matches at least one of these action names (so `s3:*`, `s3:Get*`, `s3:*Object` work as before). The old list (`GetObject`, `PutObject`, `DeleteObject`) is a subset, so no finding disappears.

Soundness: under IAM, an action applies to a Resource only if the action supports that resource type. All object-level data operations take the `object` type, so 1 covers them. The bucket grant actions let the role give someone else access, which is the same harm. Over-approximation: a few object actions only touch metadata (for example `GetObjectTagging`); they count too. This can add a false alarm only for a role that the principal can pass to a launch service and that has nothing but such an action on the protected bucket. Not modeled, documented: access points and Multi-Region Access Points (a Resource on an access point ARN does not intersect the bucket ARN).

The independent oracle keeps its own matcher (`glob.ts`) and reads the same generated table, which is an AWS fact, not evaluator code. Its change is committed first. The model generator gets the new actions on a separate random stream (new tag for bucket grants).

## 5. B2: launch services

### 5.1 The table

`LAUNCH_ACTIONS`: action name (lower case) to the set of service principals that the role may be passed to. Built from every operation whose `AuthorizedActions` contain `iam:PassRole`: each other authorized action of that operation that is **not** marked `IsTaggingOnly` maps to the operation's `PassedToService` values; with no value, it maps to `*` (any service). Including every non-tagging action of the operation is an over-approximation (some of them are side actions); dropping tagging-only actions only removes the artifact found in section 2.

### 5.2 The path

For a principal P, a target role T, a protected bucket B, and a service principal S:

- `canPassRole`: P may `iam:PassRole` T (unchanged, including R0).
- `canLaunch` (was `canControlLambda`): P allows some action A with `S ∈ LAUNCH_ACTIONS[A]` or `* ∈ LAUNCH_ACTIONS[A]`. Action patterns match as today (`*`, `?`, case-insensitive).
- `targetTrustsService` (was `targetIsLambdaAssumable`): T trusts S, or trusts `*`.
- `targetCanAccess`: B1.

Candidates are built for each S in T's trust services, and for `*` trust, for each S that P can launch. The violation names S: "`P` can pass `T` to `S` (with `<action>`) ... `T` can access protected bucket `B`." The rule ID stays `PG-IAM-004`. The Lambda-specific code of `core` is removed; a regression test checks that every existing Lambda case gives the same verdict.

### 5.3 EC2 instance profiles

`ec2:RunInstances` passes the role inside an instance profile. The extractor now **reads** `AWS::IAM::InstanceProfile` (its `Roles` must be local `Ref`s or a literal list; otherwise `PG-IAM-003`) and does not reject it. The profile adds no permission, so it does not enter the model. Whether a profile exists is not checked: a principal who can pass the role and run instances counts even without one (over-approximation; `iam:CreateInstanceProfile` would give one).

### 5.4 A trusted service that is not in the table (answer 2)

IF P can pass T, T can access a protected bucket, and T trusts a service principal that appears in no value of `LAUNCH_ACTIONS` (and is not `*`), THEN the validator reports `PG-IAM-003` at T's trust policy: "Role trusts <service>, which ProofGate cannot tell runs code with a passed role". This keeps the table from hiding a path when AWS adds a service. It applies only to roles that are both passable and bucket-reaching, so it does not fire on ordinary stacks (none of the 38 Patterns has such a role; checked in the predictions).

### 5.5 Lean

`EscalationPath` keeps four Booleans and gains a string field `service`. The fields are renamed `canLaunch` and `targetTrustsService`; `isEscalation` and `safe` keep their shape, and the theorems in `Security.lean` are restated with the new names. No `sorry`, no project `axiom`. `generateLean`, the batch runner's strict shape check, and `docs/PROOFS.md` change accordingly. The statement "Lean checks four facts that TypeScript computes" stays.

### 5.6 Soundness and false alarms

Every change in B2 enlarges the set of reported paths compared with 1.1.2, or adds `PG-IAM-003`. A false alarm needs a role that a principal can pass, that trusts a service, and that reaches a protected bucket; the principal must also hold an action that passes roles to that service. That is the shape of a real escalation, so false alarms are expected only where the service cannot really be made to touch S3 (for example an ECS infrastructure role passed to `ecs:CreateCapacityProvider`).

## 6. B3: templates without IAM resources

- The extractor no longer reports "No IAM roles were found" when the template has **no resource whose type starts with `AWS::IAM::`**. It returns an empty model with no finding.
- The validator does not run Lean for an empty model and reports nothing for that template. A Lean proof over an empty list would be vacuous, so none is claimed; the documents say "no IAM principal in this template", not "proved safe".
- Unchanged: an empty `protectedBucketArns`; an unreadable template; a template with roles but no readable statement (answer 1); an unsupported IAM resource; an `AWS::IAM::Policy` that points outside the template.
- Approved change of existing assertions (to list at the checkpoint): the extractor-level generator's empty kind `no-iam` now expects an empty model; any fixed test that asserts "No IAM roles were found" for a template with no IAM resource.

## 7. B4: `Fn::Sub`

- Read in `Resource` and in `ManagedPolicyArns`: the string form `{"Fn::Sub": "<text>"}`. Each `${Name}` is resolved as the 1.1.0 resolver resolves `Ref Name` (pseudo-parameters, in-template resources) and each `${Id.Attr}` as `Fn::GetAtt [Id, Attr]`. The result is the set of alternatives as today.
- `${!...}` is the literal `${...}` (to be confirmed on the CloudFormation `Fn::Sub` page in the task, before coding). A literal that then contains an IAM policy variable is rejected with the policy-variable reason.
- `PG-IAM-003` for: the two-element form with a variable map, any unknown name, a parameter, an attribute the resolver rejects.

## 8. B5: managed policies

Add `AWSLambdaVPCAccessExecutionRole` and `AmazonAPIGatewayPushToCloudWatchLogs` to `managed-policies.ts`, each with the statements, version, and date read on the AWS managed policy reference in the task. Their actions (EC2 network interfaces, CloudWatch Logs) do not touch S3 or pass roles, so they cannot create a path; they only make the role readable.

## 9. Adoption guide (Requirement 6)

A section in `README.md` (Japanese, added) and `packages/cdk-plugin/README.md`: every stack is checked; protected bucket with a fixed name and literal ARN; `PROOFGATE=1` pattern; `elan`; common `PG-IAM-003` causes and fixes (`cloudWatchRole: false`, unlisted managed policy, parameter in a Resource); what is outside the model; what "accepted" means for a template without IAM resources. Checked against the trial app.

## 10. Tests and evidence

1. Red first for every rule; the failing output is recorded in `tasks.md`.
2. Oracle first for B1 and B2, in its own commit.
3. New Patterns, with ground truth and predictions committed **before** B1 and B2 are implemented (proposal, Phase 0 of the tasks):

   | ID | Content | Ground truth | Predicted after |
   | --- | --- | --- | --- |
   | RS-39 | deploy role: `iam:PassRole` + `ecs:RunTask`; Fargate task role reads the protected bucket | unsafe | `PG-IAM-004` |
   | RS-40 | deploy role: `iam:PassRole` + `ec2:RunInstances`; instance role (with instance profile) reads the bucket | unsafe | `PG-IAM-004` |
   | RS-41 | deploy role: `iam:PassRole` + `codebuild:CreateProject`; project role reads the bucket | unsafe | `PG-IAM-004` |
   | RS-42 | deploy role: `iam:PassRole` + `cloudformation:CreateStack`; CloudFormation service role reads the bucket | unsafe | `PG-IAM-004` |
   | RS-43 | deploy role: `iam:PassRole` + `states:CreateStateMachine`; state machine role reads the bucket | unsafe | `PG-IAM-004` |
   | RS-44 | Lambda path where the data role has only `s3:GetObjectVersion` | unsafe | `PG-IAM-004` |
   | RS-45 | Lambda path where the data role has only `s3:PutBucketPolicy` on the bucket | unsafe | `PG-IAM-004` |
   | RS-46 | RS-39 without `ecs:RunTask` (only `ecs:DescribeTasks`) | safe | accepted |
   | RS-47 | a passable bucket-reaching role that trusts a made-up service principal | unsafe or unknown | `PG-IAM-003` |

4. Differential against 1.1.2 (`scripts/differential.mjs --old`): no finding lost; the inputs that become accepted are only those of B3, B4, B5, listed.
5. The 14 acceptance Patterns, the 8 hold-out Patterns, and RS-23 to RS-38 are run; their expected tables change one reviewed row at a time.
6. The trial app is run again at the end (Requirement 7.6).

## 11. Plan and time (last day for code: 2026-11-29)

| Step | Content | Planned day | Can be merged alone |
| --- | --- | --- | --- |
| 0 | Patterns RS-39 to RS-47 and predictions | 11-21 | yes |
| 1 | Sync script and generated tables (no behavior change) | 11-22 | yes |
| 2 | B1 S3 access (oracle first) | 11-22 | yes |
| 3 | B3 role-less templates | 11-23 | yes |
| 4 | B4 `Fn::Sub`, B5 managed policies | 11-23 | yes |
| 5 | B2 launch services, instance profiles, Lean rename (oracle first) | 11-24 to 11-26 | yes |
| 6 | Verification, adoption guide | 11-27 | yes |
| 7 | More trials with predictions, fixes they show | 11-28 to 11-29 | each fix alone |

Version proposal: 1.2.0. Publish, tags, and releases only on the user's instruction.

## 12. Open points for approval

1. Building the tables from the Service Reference with a committed generated file (section 3), instead of hand-written lists. The cost is a 70 KB generated module in `core` and a trust assumption on AWS's data.
2. The bucket grant actions (section 4.2): the 5 "Permissions management" actions plus replication and lifecycle. Lifecycle and replication are a judgment (data loss and data copy); they can be left out.
3. The made-up service of RS-47 and its ground truth ("unknown" is honest; the Result must be `PG-IAM-003`).
4. Renaming the Lean fields (section 5.5). The alternative, keeping the Lambda names, would make the Lean source say Lambda where it means any service.
