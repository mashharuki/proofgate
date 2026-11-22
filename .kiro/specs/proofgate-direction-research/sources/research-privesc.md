# AWS IAM privilege-escalation catalogue mapped to ProofGate

Verified (fetched): Rhino parts 1 and 2; pathfinding.cloud data (github.com/DataDog/pathfinding.cloud, data/paths/aws, 91 paths); Cloudsplaining constants.py (risk categories); PMapper graphing module file list and edge reason strings; Stratus Red Team AWS technique list (GitHub docs dir).
Not fetched (unverified, from memory): HackTricks pages, CloudGoat scenarios, iam-vulnerable contents, MITRE ATT&CK page text, Pacu method list beyond the pathfinding link to it, PMapper search internals.

Classes: A = PG-IAM-004 today. B = approved implicit-role-paths spec (single hop to an existing resource's role). C = self-escalation or credential/trust change. D = resource-policy exposure. E = not visible at synth time.
"Template?" = decidable from CloudFormation alone: Y, partial (P), N.

## pathfinding.cloud distribution (91 paths)
about 47 new-passrole, 22 existing-passrole, 14 principal-access, 8 self-escalation. Source: https://pathfinding.cloud/ ; raw data https://github.com/DataDog/pathfinding.cloud/tree/main/data/paths/aws

## 1. Class A: PassRole plus a launch action (new-passrole)
| Technique | Actions | Source | Template? | Model change |
|---|---|---|---|---|
| Lambda create + invoke / event source / AddPermission | PassRole, lambda:CreateFunction (+Invoke/CreateEventSourceMapping/AddPermission) | Rhino 1 #15-16; pathfinding lambda-001/002/006 | Y | none (A). Note: the extra trigger action is not required by ProofGate; it over-approximates |
| EC2 RunInstances, spot, launch template | PassRole, ec2:RunInstances / RequestSpotInstances | ec2-001/003; Rhino 1 #3 | Y | none |
| ECS (9 variants), Batch, App Runner, Glue (7), CodeBuild create, CloudFormation create/StackSet, Data Pipeline, SageMaker notebook/training/processing, EMR, EMR Serverless, Step Functions create, Scheduler, SSM automation, Braket, Image Builder, Kinesis Analytics, GameLift, Omics, Bedrock AgentCore, Cognito identity pool roles | PassRole + service create/run action | pathfinding.cloud per-service dirs; Rhino 1 #18-21, Rhino 2 #2 | Y | none. The 879-action table already includes these unless a service's operation does not list iam:PassRole in the Service Reference (check gaps, e.g. Cognito SetIdentityPoolRoles, Scheduler) |
| Multi-action chains (CreateJob + StartJobRun) | two or more actions | e.g. glue-003, codebuild-001 | Y | ProofGate takes any single write action; over-approximates, fail-closed |

## 2. Class B: existing resource that already holds role T (no PassRole)
| Technique | Actions | Source | Template? | Model change |
|---|---|---|---|---|
| Lambda code overwrite | lambda:UpdateFunctionCode (+Invoke or AddPermission) | lambda-003/004/005; Rhino 1 #17 | Y if P's Resource names the function or a wildcard matching it; function Role is visible | Fact `canControlResource(P, R)` where R's execution role is T. Edge P -> T. Needs resource-to-role map (Lambda Role, CodeBuild ServiceRole, SFN RoleArn, ECS task/exec role, instance profile role) and a per-resource ARN match (Fn::GetAtt / Ref resolution) |
| CodeBuild StartBuild with buildspec override / StartBuildBatch | codebuild:StartBuild, StartBuildBatch | codebuild-002/003 | Y (project ServiceRole) | same as above |
| Step Functions UpdateStateMachine (+StartExecution) | states:UpdateStateMachine | stepfunctions-002 | Y (RoleArn) | same; the update need not use PassRole when the role is unchanged |
| App Runner UpdateService, Glue UpdateDevEndpoint, CloudFormation UpdateStack (stack role), CodeDeploy CreateDeployment, ECS ExecuteCommand, EC2 ModifyInstanceAttribute (user data), launch-template version edits, SSM SendCommand/StartSession, EC2 Instance Connect SendSSHPublicKey, SageMaker presigned notebook URL / lifecycle config, Batch SubmitJob, Bedrock AgentCore sessions | action on the existing resource | pathfinding.cloud existing-passrole (22 paths); Stratus execution.ssm-*, lateral-movement.ec2-instance-connect, execution.sagemaker-update-lifecycle-config | Y for resource-to-role binding; P for instances (instance profile is in the template, but instance identity for SSM/EC2-Connect depends on tags or runtime IDs) | Same `canControlResource` fact with an action table per resource type. Instance-level actions need a rule for tag/ID conditions (Conditions are rejected today, so unsupported -> PG-IAM-003 stays) |
| Lambda layer poisoning | lambda:PublishLayerVersion + UpdateFunctionConfiguration | Rhino 2 #1 | Y (function Layers visible) | edge P -> function role through layer attachment; treat as class B variant |

Note: for B the graph shape is still P -> T in one hop; only the launch condition changes (control of a resource bound to T, instead of PassRole). The Lean core (four Booleans) can stay if `canPassRole && canLaunch && targetTrustsService` is replaced by `canControlBoundResource` computed in TypeScript. The trust fact is then unnecessary (the service already runs as T).

## 3. Class C: self-escalation, credentials, trust changes (IAM-only)
| Technique | Actions | Source | Template? | Model change |
|---|---|---|---|---|
| Policy version swap | iam:CreatePolicyVersion (iam-001), SetDefaultPolicyVersion | Rhino 1 #1-2; iam-001 | P: policy ARN scope visible; target policy must be attached to P or to a reachable principal | New "modifier" fact `canRewritePolicy(P, X)` -> P effectively holds anything X (or P) can get |
| Attach managed policy to user/group/role | AttachUserPolicy, AttachGroupPolicy, AttachRolePolicy (iam-008/010/009) | Rhino 1 #7-9 | Y for scope | `canGrantPermissions(P, Q)` |
| Inline policy put | PutUserPolicy, PutGroupPolicy, PutRolePolicy (iam-007/011/005) | Rhino 1 #10-12 | Y | same |
| Add user to group | iam:AddUserToGroup (iam-013) | Rhino 1 #13 | Y (group membership resources visible) | same, via group's policies |
| Rewrite trust | iam:UpdateAssumeRolePolicy (+sts:AssumeRole) (iam-012, iam-019..021) | Rhino 1 #14 | Y | new edge: P can add itself to T's trust, then assume (needs AssumeRole chains) |
| Credentials for a user | CreateAccessKey (iam-002/003/015/018), CreateLoginProfile (iam-004), UpdateLoginProfile (iam-006) | Rhino 1 #4-6; Stratus persistence.iam-create-user-login-profile, privilege-escalation.iam-update-user-login-profile | Y for users declared in the template; users outside the stack are N | edge P -> user U (user's policies become P's) |
| Assume role | sts:AssumeRole (sts-001) | pathfinding sts-001; PMapper sts_edges | Y when the trust policy names the template role (Principal ARN/Ref); same-account implicit trust via account root is a case to define | edge P -> T when P's identity policy allows it and T's trust names P (or account root) |
| Persistence variants (backdoor role/user, create admin) | CreateRole/CreateUser + Attach* | Stratus persistence.iam-* | Y for permission check | covered by `canGrantPermissions` plus CreateRole/CreateUser as new-principal creation (admin-equivalent) |

## 4. Class D: exposure through resource policies
| Technique | Actions | Source | Template? | Model change |
|---|---|---|---|---|
| Backdoor/open bucket policy | s3:PutBucketPolicy | Stratus exfiltration.s3-backdoor-bucket-policy; Cloudsplaining ResourceExposure | Y: AWS::S3::BucketPolicy statements with Principal and Condition visible | New resource-policy parser: a Principal "*" or foreign account on a protected bucket = finding. Today the protected bucket is only reached through roles |
| KMS key policy, SQS/SNS/Secrets policies, ECR repo policy | PutKeyPolicy etc. | Cloudsplaining ResourceExposure; Stratus exfiltration.* | Y for AWS::KMS::Key KeyPolicy etc. | Same: resource-policy principal analysis; the key controls decryption of protected data |
| Lambda resource policy, function URL (AuthType NONE) | lambda:AddPermission, CreateFunctionUrlConfig | lambda-005, lambda-006 (AddPermission) | Y (AWS::Lambda::Permission, FunctionUrl) | resource-policy edge: any principal can invoke a function whose role reaches the bucket |
| Sharing snapshots/AMIs | ec2:ModifySnapshotAttribute etc. | Stratus exfiltration.ec2-share-*, rds-share-snapshot | N (runtime action) | out of scope; permission-only check |

## 5. Class E: not visible at synth time
Instance metadata theft (Stratus credential-access.ec2-steal-instance-credentials, discovery.ec2-*), SSM/Secrets reads (credential-access.*), CloudTrail tampering (defense-evasion.*), console login without MFA, S3 ransomware, Bedrock invoke, Roles Anywhere trust anchors, STS GetFederationToken, SCP/permissions-boundary/session-policy effects, drift, accounts outside the stack, runtime tags/conditions. Fail closed where a Condition appears (already PG-IAM-003).
MITRE ATT&CK mapping (unverified, memory): T1098.001 additional cloud credentials -> access keys/login profile; T1098.003 additional cloud roles -> Attach*/Put*/AddUserToGroup/UpdateAssumeRolePolicy; T1078.004 valid cloud accounts -> AssumeRole/credential use; T1548.005 temporary elevated cloud access -> PassRole/AssumeRole style paths.

## Cloudsplaining risk categories (verified from constants.py)
PrivilegeEscalation, DataExfiltration (read-only actions without resource constraints), ResourceExposure (resource-policy / RAM changes), CredentialsExposure (APIs returning credentials), InfrastructureModification, ServiceWildcard, plus role flags: assumable by compute service, by cross-account principal, by any principal. Mapping: PrivilegeEscalation = A+B+C; ResourceExposure = D; "assumable by any principal" = trust `*` (ProofGate already treats it as assumable by every launch service; for AssumeRole chains it would be an edge from every principal).

## PMapper model (verified: module list graphing/*_edges.py; semantics partly from memory)
PMapper builds a directed graph. Nodes are IAM users and roles (plus groups for membership). Edge checkers per service (iam, sts, lambda, ec2, ssm, cloudformation, codebuild, sagemaker, autoscaling, cross_account) add an edge source -> destination when the source's policy lets it reach the destination's credentials (e.g. "can create access keys to authenticate as", "can access via sts:AssumeRole", "can use Lambda to create a new function ... then pass and access"). Each edge is a single hop evaluated with a policy simulator on the source's policies plus the destination's trust. A principal is "admin" when its own policy allows everything; privilege escalation is a graph search: a non-admin node that has a path (any length) to an admin node. Paths are therefore transitive: P -> R1 -> R2 ... Admin status propagates backwards along edges. (Search algorithm itself: memory, unverified.)

ProofGate today: one hop P -> T, with T required to reach the protected bucket. A pathfinding.cloud-style multi-hop is not represented.

## What changes with transitive chains and admin-equivalence
1. Transitive roles (sts:AssumeRole between template roles): build edges P -> T when P's policy allows AssumeRole on T (Resource match) and T's trust names P. Compute reachability (BFS/Warshall) over at most the template's roles. Then "P reaches bucket" = some role in reach(P) has S3 access to the bucket. New facts per P: `reachesBucket` as closure, not a single `targetCanAccess`. Edges from class A/B/C join the same graph. Cycles are fine; closure terminates.
2. Lean side: either (a) TypeScript computes the closure and passes Booleans (Lean still checks four facts; weakest, and PROOFS.md must say so), or (b) Lean gets a finite graph and a reachability theorem (`Reach` via a fuel-bounded or `List` closure). Option (b) changes the generator and the independent oracle; the TS evaluator and Lean must agree on every model (security.md). New tests on both sides plus PBT generator for graphs.
3. Admin-equivalent principals: treat P as admin if it can rewrite its own policy or another role's (CreatePolicyVersion on an attached policy, Put*/Attach* on self or on T, UpdateAssumeRolePolicy on T, AddUserToGroup into a group P is in, CreateAccessKey/LoginProfile for user U) or already allows `*:*`. Rule: any admin-equivalent P trivially reaches the protected bucket, so report PG-IAM-004 (or a new rule ID). This is a one-directional over-approximation (adds findings), consistent with the rules. Needs: resource matching of the IAM target ARN (role/user/policy/group), Ref/GetAtt resolution of those targets, handling of managed policies (checked today, one entry), and deny statements (ignored, conservative).
4. Cost/risk: more Statements become relevant (iam:* actions), so previously accepted templates may be rejected. This is allowed (more findings) but is a visible behaviour change; document in SUPPORTED_IAM.md and ASSUMPTIONS.md. Explain false positives (e.g. a CI role that legitimately updates policies).
5. Not modeled and must stay rejections or caveats: SCPs, permissions boundaries (a boundary can stop self-escalation; ignoring it only adds findings), cross-account roles, roles outside the template, users created at runtime.

## Suggested priority (by synth-time decidability and prevalence)
1. Class B (already approved): resource-to-role binding for Lambda, CodeBuild, Step Functions; then ECS/EC2/Glue update paths.
2. Class C subset with fully template-visible targets: Put/Attach policy on self or role, CreatePolicyVersion, UpdateAssumeRolePolicy, AssumeRole chains between template roles.
3. Class D: S3 bucket policy and KMS key policy principal checks on protected resources.
4. Everything else: document as not modeled.
