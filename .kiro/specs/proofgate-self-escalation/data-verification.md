# Evidence for the action table (task 1.1, first part)
Read on 2026-11-22 with `web_fetch` (the AWS MCP Server was not connected). Only what the page says is recorded. An action is added to `packages/core/src/policy-write-actions.ts` only with a row here. The rest of task 1.1 (the resource type of each action in the Service Authorization Reference) is still to do in Step 1 of the tasks.

| Action | Page | What it says (paraphrased) | Decision |
| --- | --- | --- | --- |
| `iam:PutRolePolicy` | https://docs.aws.amazon.com/IAM/latest/APIReference/API_PutRolePolicy.html | Adds or updates an inline policy document embedded in the specified role, which is used as part of the role's access (permissions) policy. The only required request fields are `PolicyDocument`, `PolicyName`, and `RoleName`. The page does not say who may call it on which role; the effect for a self-grant (a role writing a policy to itself) is how IAM works and is also the example of pathfinding.cloud `iam-005`. Service-linked roles cannot be modified (`UnmodifiableEntity`), which a template cannot contain as a role of its own. | add (self-grant) |
| `iam:AttachRolePolicy` | https://docs.aws.amazon.com/IAM/latest/APIReference/API_AttachRolePolicy.html | Attaches the specified managed policy to the specified role; it becomes part of the role's permission policy. The caller names the policy by ARN (`PolicyArn`), so an AWS managed policy such as `AdministratorAccess` is always available. Service role policies can only be attached to the service-linked role of that service. | add (self-grant) |
| `iam:UpdateAssumeRolePolicy` | https://docs.aws.amazon.com/IAM/latest/APIReference/API_UpdateAssumeRolePolicy.html | Updates the policy that grants an IAM entity permission to assume a role (the trust policy). The new document can name any principal. The page does not say that the caller can then assume the role; that is how same-account trust works and is the content of pathfinding.cloud `iam-012`. | add (take-over) |
| `iam:CreateRole` | https://docs.aws.amazon.com/IAM/latest/APIReference/API_CreateRole.html | Creates a new role. `AssumeRolePolicyDocument` (the trust policy) is a required field of the request, so the creator chooses who can assume the new role. | add (creation grant, with a policy-writing action) |

## Decisions of requirement 2.3 (every other action that writes a permission to a role)
| Action | Decision | Reason |
| --- | --- | --- |
| `iam:PutRolePermissionsBoundary`, `iam:DeleteRolePermissionsBoundary` | out | Setting a boundary only restricts. Deleting one removes a limit, which matters only if a boundary exists; ProofGate does not model boundaries (documented). |
| `iam:DeleteRolePolicy`, `iam:DetachRolePolicy` | out | They remove permissions. Removing a permission of another role does not give the caller access. (Removing a Deny is not modeled: Deny statements are ignored.) |
| `iam:CreatePolicyVersion`, `iam:SetDefaultPolicyVersion` | out | They change a customer managed policy; `AWS::IAM::ManagedPolicy` is rejected as unsupported today (requirements, out of scope). |
| `iam:PutUserPolicy`, `iam:AttachUserPolicy`, `iam:PutGroupPolicy`, `iam:AttachGroupPolicy`, `iam:AddUserToGroup`, `iam:CreateAccessKey`, `iam:CreateLoginProfile`, `iam:UpdateLoginProfile` | out | They act on users and groups, which the extractor rejects as unsupported today. |
| `iam:CreatePolicy`, `iam:CreateInstanceProfile`, `iam:AddRoleToInstanceProfile` | out | They create objects that give no permission by themselves. (`iam:AddRoleToInstanceProfile` is already a launch action of the PassRole rule.) |

## What the pages do not settle
- That a self-grant takes effect at once (IAM changes are eventually consistent). Irrelevant for a synth-time gate.
- The resource type of each action (a role ARN) in the Service Authorization Reference. To confirm in task 1.1 before the oracle is written; if `iam:CreateRole` is authorized on the ARN of the new role, the creation grant matches on that ARN.
- Conditions on the statement (for example `iam:PermissionsBoundary`, which CI roles use to limit these actions). A `Condition` is rejected with `PG-IAM-003` today, so it is never ignored silently.
