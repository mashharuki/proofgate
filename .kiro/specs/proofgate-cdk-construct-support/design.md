# Design: proofgate-cdk-construct-support

Status: DRAFT, awaiting approval. `tasks.md` is intentionally not written yet. No code has been changed for this spec.

Requirements: [requirements.md](./requirements.md) (approved by the user, with the target Results of Requirement 1 confirmed; the answers to open questions 2 to 5 are still missing and are handled as assumptions in section 11).

## 1. Summary

Add a small resolver to `@proofgate-cdk/extractor` that reads the values that ordinary CDK code produces (`Ref`, `Fn::GetAtt`, `Fn::Join`, pseudo-parameters), one managed policy, and a condition in a trust policy. An unknown part of an `Allow` is read as **larger** than it can be, never smaller. Two small changes in `@proofgate-cdk/core` make roles and buckets whose names CloudFormation generates behave soundly. The Lean project, the `StackModel` type, the rule IDs, and the validator API do not change.

Work found while writing this design:

- **A defect of ProofGate 1.0.1 that is independent of this spec** (section 2.3): a role without `RoleName`, which is the CDK default, is not recognized as a `PassRole` target when the `Resource` is a wildcard ARN. It is a missed finding inside the modeled scope. The first task of this spec fixes it, because the new resolver needs the same behavior.
- Four rules are enough for the acceptance set (section 4). One more is listed and not planned.

## 2. Evidence

### 2.1 What the real templates contain (read-only survey, aws-cdk-lib 2.277.0)

| Value | Seen in | Form |
| --- | --- | --- |
| Managed policy | RS-05, RS-07, RS-09, RS-11 | one distinct value: `Fn::Join ["", ["arn:", {Ref: AWS::Partition}, ":iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"]]` |
| Resource | RS-05 to RS-08, RS-11 | `Fn::GetAtt [<bucket or function>, Arn]` and `Fn::Join ["", [GetAtt Arn, "/*"]]` (or `":*"`) |
| Resource | RS-10 | `Fn::Join` of `"arn:"`, `Ref AWS::Partition`, `":logs:"`, `Ref AWS::Region`, `":"`, `Ref AWS::AccountId`, a path, and `Ref <CodeBuild project>` |
| Trust condition | RS-07 | `ArnLike` on `aws:SourceArn`, built with `Fn::Join` |
| Idiom `exec.roleArn` in a `PassRole` | probe | `Fn::GetAtt [<role>, Arn]` where the role has **no** `RoleName` |
| Idiom `bucket.grantRead` on a bucket without `bucketName` | probe | `Fn::GetAtt [<bucket>, Arn]` where the bucket has **no** `BucketName` |

### 2.2 What AWS documents (read from the official documentation)

The AWS Documentation MCP server was not connected in this session, so I read the pages directly. Sources and what they say:

- `https://docs.aws.amazon.com/aws-managed-policy/latest/reference/AWSLambdaBasicExecutionRole.html`: the policy ARN is `arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole`, policy version v1 (default), created and last edited on 2015-04-09, and its only statement is `Allow` of `logs:CreateLogGroup`, `logs:CreateLogStream`, and `logs:PutLogEvents` on `Resource: "*"`. A managed policy can change in the future (AWS adds a new default version); this is a trust assumption (section 6).
- `https://docs.aws.amazon.com/AWSCloudFormation/latest/TemplateReference/aws-resource-iam-role.html`: for `AWS::IAM::Role`, `Ref` returns the role name and `Fn::GetAtt [role, Arn]` returns the ARN, with an example `arn:aws:iam::1234567890:role/MyRole-AJJHDSKSDF`. If no `RoleName` is given, CloudFormation generates a unique physical ID and uses it as the name. **The format of a generated name is not specified.** The example looks like `<logical id>-<suffix>`, but the page does not promise it, so the design does not rely on it.
- Not read in this session: the `Return values` of `AWS::S3::Bucket` (the page fetch for that phrase gave no match). For the bucket the design uses only what is already needed: `Ref` is the bucket name, and `GetAtt Arn` is `arn:<partition>:s3:::<name>`. Task 1 of the plan reads the page and records it before the rule is written.

### 2.3 A defect of 1.0.1: an unnamed role is not a PassRole target

In `packages/core`, `allowsPassRoleTarget` compares a `PassRole` resource with the target's logical ID and role name. For a role without a name, the code returns false for every ARN pattern. A direct test of `evaluate` (throwaway script, deleted):

| Target role | PassRole `Resource` | Result of `evaluate` |
| --- | --- | --- |
| named `MyStack-Data-ABC` | `arn:aws:iam::*:role/MyStack-*` | detected |
| **no name** | `arn:aws:iam::*:role/MyStack-*` | **not detected** |
| **no name** | `arn:aws:iam::*:role/*` | **not detected** |
| no name | `*` | detected (matches the logical ID) |
| no name | a literal ARN of another role | not detected (correct) |

Under AWS semantics a pattern such as `role/*` matches the generated name, so the unnamed rows are missed findings inside the modeled scope. CDK roles have no name unless one is given, so this is the common case. The generated tests of the earlier spec did not see it because **the generator gave every role a name, and the independent oracle returns `false` for an unnamed target as well** (`oracle.ts`, `passRoleResourceMatches`). Both sides had the same blind spot. I found it by asking what the new resolver would have to produce for `role.roleArn`, not by a test.

The fix only adds findings (a rejection-side change). It is the first task, and it needs the oracle to change as well (section 8).

## 3. The rule for an unknown value

A resolved value is used in only one place: the `Resource` of an `Allow` statement, and the trust principal of a role. In both, a larger value can only add findings. The extractor therefore follows this rule:

1. A part of a value that is known is used exactly.
2. A part that is unknown but certainly exists at deployment (an account id, a region, the generated name of a resource) is read as a **wildcard segment** (`*`), except for the two special cases of section 5.
3. A part that cannot be classified (a parameter, `Fn::ImportValue`, `Fn::If`, a `GetAtt` to something that is not in the template, an attribute that is not understood on a resource type that the extractor knows) is **unsupported** (`PG-IAM-003`), as today.

A wildcard in an `Allow` resource can turn a safe template into one with a finding (a false alarm). It cannot hide a path. Where a wildcard would be too coarse to be useful (section 5), the design uses a more exact opaque name and says what it costs.

`Deny` statements stay ignored by the evaluator, so nothing in this design changes how they are read.

## 4. The rules

| Rule | What is read | Direction of the approximation | Patterns made readable (sample) |
| --- | --- | --- | --- |
| R0 | An unnamed role as the target of `iam:PassRole` (the defect of 2.3) | adds findings | none directly; it is the base for R1 |
| R1 | `Fn::Join`, `Ref` to a pseudo-parameter, `Ref` and `Fn::GetAtt` to a resource of the same template, in a `Resource` | a wildcard for unknown parts | RS-05, RS-06, RS-07, RS-08, RS-10, RS-11 |
| R2 | The managed policy `AWSLambdaBasicExecutionRole`, written as a literal ARN or as the `Fn::Join` of the sample | exact (its statement is added to the role) | RS-05, RS-07, RS-09, RS-11 |
| R3 | A `Condition` on an `Allow` statement of a trust policy | ignoring it only widens who can assume the role | RS-07 |
| R4 | (not planned) a `Condition` on a permission statement; `Fn::Sub` | ignoring a condition on an `Allow` only widens it; `Fn::Sub` would need R1 | none in the sample |

Why these Patterns need these rules (from the survey):

| Pattern | Needs | Target Result |
| --- | --- | --- |
| RS-05 | R1, R2 | accepted |
| RS-06 | R1 | accepted |
| RS-07 | R1, R2, R3 | accepted |
| RS-08 | R1 | accepted |
| RS-09 | R2 | accepted |
| RS-10 | R1 | `PG-IAM-004` (the project role passes any role and creates functions; the literal data role reads the protected bucket) |
| RS-11 | R1, R2 | `PG-IAM-004` (the path was hidden only by the unrelated `grantRead` Lambda) |

All eight target changes of Requirement 1 are reachable with R0 to R3. R4 stays out of scope until a Pattern needs it (YAGNI).

### 4.1 R1 in detail

The resolver turns one CloudFormation value into one string, or reports unsupported.

| Value | Resolved to | Why it is sound |
| --- | --- | --- |
| a string | itself, unless it contains a policy variable (rejected as today) | exact |
| `Fn::Join [sep, parts]` | the parts resolved and joined with `sep`; one unsupported part makes the whole value unsupported | exact when all parts are exact; otherwise only larger |
| `Ref AWS::Partition`, `AWS::Region`, `AWS::AccountId`, `AWS::URLSuffix` | `*` | a wildcard is larger than the one real value |
| `Ref AWS::StackName`, `AWS::StackId`, `AWS::NoValue`, other pseudo-parameters | unsupported | not needed by the sample; `NoValue` removes an element |
| `Ref` to an `AWS::S3::Bucket` of the template | the bucket name (section 5) | exact or opaque |
| `Ref` to an `AWS::IAM::Role` of the template | the role name (section 5) | exact or opaque |
| `Ref` to another resource of the template | `*` | larger |
| `Fn::GetAtt [bucket, Arn]` | `arn:*:s3:::` + the bucket name | the partition is `*` |
| `Fn::GetAtt [role, Arn]` | `arn:*:iam::*:role/` + the role name | |
| `Fn::GetAtt [other resource, any attribute]` | `*` | larger |
| `Fn::GetAtt [bucket or role, another attribute]` | unsupported | the extractor knows these types and would otherwise guess |
| `Ref` or `GetAtt` to a name that is not in the template | unsupported | cannot be classified |
| any other function, a parameter | unsupported | as today |

A `Resource` that is an array resolves every element. An element that resolves to a string with a wildcard replaces nothing else; it is a normal pattern for the matcher.

Where the resolved `Resource` is read: statements in an inline role policy and in an `AWS::IAM::Policy` (the places that `parseStatements` reads today). The `Action` list stays literal-only: CDK writes actions as literals, and an `Action` that is an intrinsic is rare and stays unsupported.

### 4.2 R2 in detail

A table in the extractor, `MANAGED_POLICIES`, holds the full ARN suffix and the statements of each policy that has been checked against the AWS documentation: `service-role/AWSLambdaBasicExecutionRole` with the statement of 2.2. A `ManagedPolicyArns` entry is recognized if it is a string `arn:aws:iam::aws:policy/<name>` or a `Fn::Join` that resolves (with the partition read as `*`) to `arn:*:iam::aws:policy/<name>`; the name must be in the table. The policy's statements are appended to the role, with a `sourcePath` that points at the `ManagedPolicyArns` entry. Any other managed policy stays `PG-IAM-003`, with the unchanged reason string.

The table has one entry in this spec. More entries (for example `AWSLambdaVPCAccessExecutionRole`) need the same check against the AWS documentation first.

### 4.3 R3 in detail

In a trust policy, an `Allow` statement with a `Condition` is read as if the condition were absent (the extractor sets the Lambda trust from the principal as before). The condition can only narrow who can assume the role, so ignoring it is larger. A `Deny` statement is ignored as today. `NotPrincipal` and a `Condition` that is **not** an object stay unsupported. The old reason string `Condition is not supported in trust policies` stays in the code for the unsupported variants, so existing tests still pass.

## 5. Generated names (opaque names)

Two kinds of resource are named by CloudFormation when the template gives no name: an IAM role (`RoleName`) and an S3 bucket (`BucketName`). Their names are unknown at synthesis and unspecified by AWS (2.2). A wildcard would be sound but too coarse here, and the coarse reading gives a **false alarm in the most common safe CDK layout**: a deploy role that may pass the Lambda execution role, where the execution role reads its own generated bucket. Reading that bucket as `*` would intersect the protected bucket and report a path that does not exist.

So these two kinds get an **opaque name**:

- The extractor gives an unnamed resource the name `_generated_<LogicalId>` when it resolves `Ref` or `Fn::GetAtt` to it. The underscore makes the name impossible as an S3 bucket name and unlikely as a role name that a person writes.
- **Roles** (R0): the evaluator treats a role without `roleName` as having the opaque name `_generated_<logicalId>`. A `PassRole` resource matches it if (a) the pattern matches that name, which is what an exact reference gives, or (b) the role-name part of the pattern contains `*` or `?`, because such a pattern could match the real generated name. A pattern that is a plain literal does not match, which is correct: a literal name cannot be the generated one.
- **Buckets** (R1): a resource pattern whose bucket part is an opaque name intersects the protected bucket only if the protected bucket's name part contains `*` or `?`; in that case the opaque part is read as `*`. For a literal protected ARN there is no intersection.
- A named resource (`RoleName` or `BucketName` is a literal, or resolves to a string) uses its real name.

What this costs and where it can be wrong:

- The rule "a pattern with a wildcard may match a generated name" is conservative. It can report a path for a wildcard pattern that would not match the real name (a false alarm). It cannot miss one.
- A person who wrote a literal ARN that happens to be equal to `_generated_<LogicalId>` would be matched. This is an over-approximation too.
- The evaluator change touches the production matcher. It adds findings for roles that 1.0.1 misses, so the differential check of Requirement 5.5 must report these new findings separately from findings that disappear (none may).

## 6. Trust assumptions to document

| Assumption | Where |
| --- | --- |
| The statements of the managed policies in the table are those of the AWS documentation, as checked on the date written in the table | `docs/ASSUMPTIONS.md` |
| CloudFormation returns the documented value for `Ref` and `Fn::GetAtt Arn` of buckets and roles | `docs/ASSUMPTIONS.md` |
| A `Condition` in a trust policy only narrows who can assume the role | `docs/ASSUMPTIONS.md` |
| An unknown part of an `Allow` can be read as a wildcard without hiding a path | `docs/ASSUMPTIONS.md` |

## 7. Architecture and changes

```
packages/extractor/src/
  index.ts            unchanged public API; uses the resolver in parseStatements and in the role loop
  resolve.ts          NEW  value resolver (section 4.1)
  managed-policies.ts NEW  the table (section 4.2)
packages/core/src/index.ts   unnamed role as a target and opaque bucket names (section 5)
packages/model              unchanged
packages/cdk-plugin         unchanged
packages/cdk-plugin/lean    unchanged
```

- The resolver needs the map of the template's resources, which `extractStack` already has.
- `StatementModel` keeps strings only. The model that reaches `evaluate` and `generateLean` has the same type as today (Requirement 4).
- The existing `reason` strings are unchanged. New reasons are added for the new unsupported cases, for example `Fn::GetAtt attribute is not supported for AWS::S3::Bucket`.
- A new finding says where the value was found, as the existing ones do.

## 8. Tests

1. **Red first, rule by rule** (Requirement 5.1): for R0, R3, R2, R1, in this order, write the tests, show them failing on the unchanged code, then implement.
2. **Evaluator (R0 and opaque buckets).** The table of 2.3 becomes a unit test. The **independent oracle must change for the same reason** (it must treat an unnamed role by the same rule), and its change is written and reviewed on its own, before the evaluator is fixed, so that the oracle is not simply copied from the code. New boundary Cases in the generator use unnamed roles and unnamed buckets in the `unsafe`, `safe`, and `conservative` categories (a pattern that only an opaque rule makes unsafe is a new tag, `GENERATED_NAME`, in the conservative category: AWS-valid reading says "unknown", the evaluator says "may match").
3. **Extractor-level generated tests.** The fragment generator gets the new forms (joins of literals, pseudo-parameters, in-template references with and without names, one managed policy, a trust condition), with an expected model computed by an independent function. The poison list gets the variations that must stay unsupported (a parameter, `ImportValue`, an unknown attribute, an unknown managed policy, `Fn::Sub`). The rule "partial models are never returned" stays.
4. **Self-check mutants**: an extractor that resolves a `GetAtt` to the empty string, one that drops a resolved resource, one that reads an unknown part as nothing, and an evaluator that ignores the opaque rule. Each must be detected.
5. **Differential** (Requirement 5.5): the 1.0.1 and the new extractor and evaluator over the 14 Patterns, the regression cases, and the generated fragments. No finding of 1.0.1 may disappear. The list of inputs that move from `PG-IAM-003` to accepted is printed, with the rule that made them readable.
6. **The acceptance set** is the runner of the earlier spec. Its expected table changes one reviewed row at a time, and the table test keeps checking the rules.

## 9. The hold-out Patterns (proposal for Requirement 6)

Proposed list, to be approved. Ground truth and predicted Result are written and committed before any implementation, in `holdout-predictions.json`, which is never edited afterwards. They are chosen from common constructs that are not in RS-05 to RS-14, and **not** from what R0 to R3 can read.

| ID | Stack | Ground truth |
| --- | --- | --- |
| RS-15 | API Gateway `RestApi` with a Lambda integration | safe |
| RS-16 | SQS queue, `grantSendMessages` to a Lambda function | safe |
| RS-17 | DynamoDB table, `grantReadWriteData` to a Lambda function | safe |
| RS-18 | Lambda function with an S3 event source (bucket notifications create custom-resource roles and policies) | safe |
| RS-19 | KMS key, `grantEncryptDecrypt` to a role | safe |
| RS-20 | A deploy role that may `iam:PassRole` the **execution role of a Lambda function by `role.roleArn`**, can create functions, and the execution role reads `bucket/*` of a bucket with the **fixed name** of the protected bucket | unsafe |
| RS-21 | As RS-20, but the execution role reads only a bucket **without** a name (generated) | safe |
| RS-22 | A deploy role that passes a role imported with `Role.fromRoleArn` (a literal ARN), and creates functions | unsafe, outside the modeled scope (the imported role is not in the template) |

RS-20 and RS-21 are included because the reasoning of sections 2.3 and 5 says they are the two layouts that decide whether the opaque names are right (RS-20 must be detected, RS-21 must not be reported). They were derived from that reasoning, not from the results. This is stated in the report.

## 10. Plan, order, and time

| Step | Content | Size | Can be dropped alone |
| --- | --- | --- | --- |
| 0 | Hold-out Patterns and predictions, committed | small | no |
| 1 | R0: unnamed roles as PassRole targets, oracle first | medium | no (it fixes a defect) |
| 2 | R3: trust condition | small | yes |
| 3 | R2: managed policy table | small | yes |
| 4 | R1: the resolver, with the opaque bucket rule | large | yes, but then RS-05, 06, 08, 10 stay rejected |
| 5 | Differential, acceptance set, hold-out run | medium | no |
| 6 | Documents | small | no |

I estimate four working sessions for steps 0 to 5, without counting waits. The estimate has no measured basis; the earlier spec took more sessions than I first thought. The last day for code changes in Requirement 7.3 (proposed: 2026-11-29) is the check on it. If step 4 is not finished by then, the steps 0 to 3 can still be merged on their own (they do not depend on step 4), and the result is reported honestly.

## 11. Open decisions and assumptions

The user approved the requirements with the target Results of Requirement 1. These were not answered and are handled as follows until the user says otherwise:

| ID | Question | Assumption used in this design |
| --- | --- | --- |
| D1 | Over-approximation is acceptable (more findings than 1.0.1 can appear) | Yes, as in section 3 |
| D2 | Last day for code changes | 2026-11-29 |
| D3 | The hold-out list | The proposal of section 9 |
| D4 | Push the `realstacks/*` branches and open a pull request first | Not done; this spec's branches are stacked on them. The user decides |
| D5 | The defect of 2.3 | Fix it as step 1 of this spec, with the oracle changed first. Because 1.0.1 has not been published, there is no released version with the defect |

## 12. Correctness properties

| ID | Property | Requirements |
| --- | --- | --- |
| P1 | No finding that 1.0.1 reports disappears on the corpus (the 14 Patterns, regression cases, generated fragments) | 5.5 |
| P2 | Every input that moves from `PG-IAM-003` to accepted is listed with its rule | 5.5 |
| P3 | A value that is not covered by a rule gives `PG-IAM-003` at the right location, and no model | 3.1 |
| P4 | For a template with the new forms, the extractor returns exactly the independently computed model | 5.2 |
| P5 | An unknown part of an `Allow` is never read as smaller: for every generated fragment, replacing a resolved part by `*` does not remove a finding | 2.2 |
| P6 | An unnamed role is a `PassRole` target for `*`, `role/*`, and a wildcard-prefix pattern, and is not a target for a literal ARN of another role | 2.3 |
| P7 | An opaque bucket name intersects the protected bucket only if the protected name has a wildcard | 5 (design) |
| P8 | The acceptance set gives the target Results of Requirement 1 or a listed, approved difference | 1.1 |
| P9 | The hold-out Patterns are run once after the implementation, and all Results are reported | 6.3 |
| P10 | The Lean project, the model type, rule IDs, and validator API are unchanged | 4.1, 3.5 |
| P11 | Existing tests and assertions are unchanged and pass | 9.3 |
| P12 | Every mutant of section 8 is detected | 5.4 |

These give evidence from a sample. They do not show that ProofGate is sound on every template.

## 13. Traceability

| Requirement | Design section |
| --- | --- |
| 1 Target Results | 4, 8.6, 12 (P8) |
| 2 Soundness rule | 3, 4, 5, 6 |
| 3 Fail-closed floor | 3, 4.1, 4.2, 12 (P3) |
| 4 TypeScript and Lean | 7, 12 (P10) |
| 5 Tests | 8, 12 |
| 6 Hold-out set | 9, 12 (P9) |
| 7 Time and scope | 10, 11 |
| 8 Documents | 6 |
| 9 Existing behavior and release | 7, 12 (P11) |
| 10 Kiro work record | 14 |

## 14. Kiro work record plan

Each session adds a row to `.kiro/steering/kiroween.md`. The record includes the defect of 2.3 and how it was found, the fact that the AWS Documentation MCP server was not connected and the pages were read directly, the results of the hold-out run (including every Pattern that is still rejected), and the point at which the time-box was decided.
