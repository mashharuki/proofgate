# Evidence for the action table (task 1.1)
Read on 2026-11-22 with `web_fetch` (the AWS MCP Server was not connected). Only what the page says is recorded. An action is added to `packages/core/src/implicit-actions.ts` only with a row here.

| Action | Page | What it says (paraphrased) | Decision |
| --- | --- | --- | --- |
| `lambda:UpdateFunctionCode` | https://docs.aws.amazon.com/lambda/latest/api/API_UpdateFunctionCode.html | The operation replaces the code of an existing function: the package is given as `ZipFile`, `S3Bucket` and `S3Key`, or `ImageUri`. The response carries the function's execution role (`Role`). The page does not say in one sentence that the new code runs as that role; that is how Lambda works (the execution role is the identity of the function code, Lambda developer guide). Code signing, if enabled, restricts the package to a trusted publisher; ProofGate cannot see it. | add |
| `lambda:UpdateFunctionConfiguration` | read 2026-11-20 and 2026-11-21, see `docs/ASSUMPTIONS.md` | Can change `Role`, `Layers` (also from other accounts) and `ImageConfig` (container command). Layers and the image command run code in the function. Without `iam:PassRole` the role cannot be changed to a role the caller cannot pass, but layers and `ImageConfig` still run as the existing role. | add |
| `codebuild:StartBuild` | https://docs.aws.amazon.com/codebuild/latest/APIReference/API_StartBuild.html (read 2026-11-22 before) | `buildspecOverride` replaces the build commands for this build; the caller can set it. The build runs with the project's service role. | add |
| `codebuild:StartBuildBatch` | https://docs.aws.amazon.com/codebuild/latest/APIReference/API_StartBuildBatch.html | `buildspecOverride` is a parameter of this operation with the same meaning ("overrides, for this build only, the latest one already defined in the build project"). The request also has `buildBatchConfigOverride.serviceRole` and `serviceRoleOverride`: changing the role needs `iam:PassRole`, so that part is the PassRole path. | add |
| `states:UpdateStateMachine` | https://docs.aws.amazon.com/step-functions/latest/apireference/API_UpdateStateMachine.html | Updates `definition`, `roleArn`, logging, or encryption of an existing state machine; at least one of `definition` or `roleArn` is required, so a `definition`-only update is valid. New `StartExecution` calls within a few seconds use the updated definition and `roleArn`. Running executions keep the old one. | add |

## What the pages do not settle
- Whether something runs the new code (an invoke, a trigger, `StartExecution`, a schedule). The table does not require it: a documented over-approximation.
- Conditions (for example a condition key on `buildspecOverride`). A `Condition` on a statement is rejected today (`PG-IAM-003`), so it is never ignored silently.
- CloudFormation stack roles: documentation only (decision 3 of the requirements).

## Role properties in the CloudFormation resource types
`AWS::Lambda::Function` `Role` (required), `AWS::CodeBuild::Project` `ServiceRole` (required), `AWS::StepFunctions::StateMachine` `RoleArn` (the ARN of the role, required unless the definition is given in a way that the service role is set elsewhere). To be re-checked on the resource pages in Step 2 (task 3.1) before the extractor reads them.

## Step 2: statements whose Resource changed with the resolver narrowing (task 3.3)
Checked on 2026-11-22 over every template of the 62 Patterns (63 templates), extractor of `main` against the new one. 14 statements changed, no template changed its unsupported findings, and the differential check against `main` (3038 inputs) lost no finding and added none.
- RS-59, the developer role: `["*"]` became the ARN pattern of project B only (the purpose of the change).
- 13 statements that CDK adds to the role of a CodeBuild project (RS-34, RS-56, RS-57, RS-59): the log-group resource `arn:...:log-group:/aws/codebuild/*` became `.../aws/codebuild/_generated_<LogicalId>` and the report-group resource `report-group/*-*` became `report-group/_generated_<LogicalId>-*`. These statements allow `logs:` and `codebuild:` report actions, which no existing rule reads.
