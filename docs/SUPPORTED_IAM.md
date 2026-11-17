# Supported IAM subset

The first vertical slice supports:

- `AWS::IAM::Role`;
- literal role trust policies, including service principals used to establish Lambda assumability;
- inline policies in `Role.Properties.Policies`;
- `AWS::IAM::Policy` attached to local roles through `{ "Ref": "LogicalId" }`;
- literal `Allow` and `Deny` effects;
- literal string or string-array `Action` and `Resource` values;
- `*` glob matching in action and resource strings;
- `iam:PassRole`, Lambda create or configuration-plus-code update actions, and S3 object read/write/delete actions.

ProofGate reports `PG-IAM-003` and fails closed for:

- `NotAction`, `NotResource`, or `Condition`;
- `NotPrincipal`, `Condition`, or non-literal values in role trust policies;
- non-literal actions, resources, role names, or policy attachments;
- non-default IAM role paths;
- `AWS::IAM::ManagedPolicy` and role `ManagedPolicyArns`;
- malformed policy documents;
- a template with no roles or no supported statements.
- a ProofGate configuration with no protected bucket ARN.

IAM resource types other than `AWS::IAM::Role` and `AWS::IAM::Policy` are rejected in this first model. Trust-policy explicit denies and conditions are not evaluated; conditions are rejected rather than ignored.
