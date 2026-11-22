---
inclusion: manual
---

# Direction research: incident patterns, privilege-escalation catalogues, and the AWS Security Maturity Model

Written 2026-11-22 at the user's request. The decisions of section 6 were made by the user on 2026-11-22. Raw notes with every source URL are in `.kiro/specs/proofgate-direction-research/sources/` (`research-incidents.md`, `research-privesc.md`, `research-maturity.md`). They were collected with `web_fetch` and web search; items that could not be opened are marked unverified there. Source content is paraphrased.

## 1. Method (adapted from the Nyx Foundation SPECA write-up)

Source: [Nyx Foundation, SPECA](https://note.com/nyxfoundation/n/n782d4fb32344).

| SPECA step | ProofGate equivalent |
| --- | --- |
| Turn the specification into security properties, each with an ID and its source | Turn each incident or technique into a pattern with an ID, the IAM actions involved, and the source URL |
| Prioritize by impact; formalize the critical properties in Lean 4 | Choose patterns that reach protected data and are visible in a template; express each as a fact of the finite model that Lean checks |
| Make abstract properties concrete with a database of known defects | Use the catalogues (Rhino Security Labs, pathfinding.cloud, Stratus Red Team) to write the concrete action, resource, and trust conditions |
| Investigate the code; show reachability from an external entry point | Write a CDK Pattern per property, with the ground truth and the prediction committed before it runs |
| Reproduce; keep code analysis, in-process tests, and network reproduction apart | Keep three kinds of evidence apart: template-level tests, the real `cdk synth`, and AWS-side observation (`iam:SimulateCustomPolicy`) |

Taken from SPECA: prioritize before formalizing, keep a link from every item to its source, and keep a proved theorem separate from the check items derived from it.

## 2. What the sources say

- SentinelOne "Top 10 AWS Security Issues" (the page the user gave): HTTP 429 on every attempt, so its list was not read. Related pages name the usual customer-side misconfigurations (public S3, broad IAM, missing MFA, no encryption, no logging).
- Incidents most relevant to ProofGate:
  - Sysdig TRT, 2025-11-28: credentials in a public S3 bucket, then code injection into an existing Lambda function with a stronger role, then admin in under ten minutes ([Sysdig](https://www.sysdig.com/blog/ai-assisted-cloud-intrusion-achieves-admin-access-in-8-minutes), checked). A path without `iam:PassRole`.
  - Unit 42, 2024: leaked `.env` keys, then `iam:CreateRole` and `AttachRolePolicy`, then `lambda:CreateFunction`, then S3 exfiltration (self-escalation).
  - Capital One, 2019: SSRF to IMDSv1, then an over-privileged instance role read S3 (secondary sources).
  - Codefinger, 2025: S3 ransomware with SSE-C, using stolen keys that could write objects.
  - Cryptomining and SCARLETEEL: `iam:PassRole` with `ec2:RunInstances` or `ecs:RunTask`.
- Catalogues: Rhino Security Labs parts 1 and 2; Datadog [pathfinding.cloud](https://pathfinding.cloud/) (91 AWS paths: 47 new-passrole, 22 existing-passrole, 14 principal-access, 8 self-escalation; counted from its repository at commit `b3f449e`, Apache-2.0). PMapper models escalation as a graph with transitive edges; ProofGate checks one hop.
- AWS Security Maturity Model v2: ProofGate fits Phase 3 (least-privilege review, infrastructure as code, DevSecOps) and Phase 4 (IAM policy generation pipeline, data perimeters). Phase 1 and 2 items are account settings or checks of a single resource (IMDSv2, public access block, encryption, ports) already covered by cdk-nag and Checkov. ProofGate does not copy them.

## 3. Pattern classes

| Class | Meaning | Visible in a template | ProofGate |
| --- | --- | --- | --- |
| A | `iam:PassRole` plus a launch action | yes | covered (`PG-IAM-004`, 879 launch actions) |
| B | Change an existing resource that already runs as a strong role, no `PassRole` (Lambda `UpdateFunctionCode`, CodeBuild `StartBuild` with `buildspecOverride`, Step Functions `UpdateStateMachine`, SSM `SendCommand`, ...) | yes | not covered; spec `proofgate-implicit-role-paths` approved |
| C | Self-escalation: change policies, trust, or credentials (`PutRolePolicy`, `AttachRolePolicy`, `CreatePolicyVersion`, `UpdateAssumeRolePolicy`, `AddUserToGroup`, `CreateAccessKey`, `CreateLoginProfile`) | yes | not covered |
| C' | Role chains (`sts:AssumeRole` between template roles) | yes | not covered (one hop) |
| D | Exposure through resource policies (public function URL on a function whose role reaches the bucket, OIDC trust without `sub`, cross-account trust without `ExternalId`) | yes, many need `Condition` | not covered |
| E | Leaked keys, SSRF, IdP compromise, SCPs, drift | no | out of scope |

## 4. Directions, in the order approved by the user

1. B: paths without `iam:PassRole` (spec `proofgate-implicit-role-paths`).
2. C: self-escalation, treated as able to reach every protected bucket. **New rule ID `PG-IAM-005`** (user decision). Only adds findings; a CI role that edits policies on purpose needs a documented allowlist.
3. Data perimeter, positive form: "only the declared roles may reach this bucket". Lean proves a subset claim over a finite list. Phase 4 of the maturity model at synth time.
4. C': transitive role chains. With direction 3, Lean receives the finite graph and proves reachability (a stronger claim than four Booleans).
5. D: only the cross-resource part (for example a public function URL on a function whose role reaches the protected bucket). `Condition` parsing comes later.

Not planned: single-resource checks. The adoption guide recommends cdk-nag next to ProofGate.

## 5. Step 7 of `proofgate-brushup` (until the code freeze, 2026-11-29): measure, do not change rules

1. Incident Patterns, ground truth and prediction committed first: Sysdig 2025 (class B, expected miss), Unit 42 2024 (class C, expected miss), Capital One-like (class A, expected `PG-IAM-004`), cryptomining with `ecs:RunTask` (class A, expected `PG-IAM-004`), a role chain (expected miss), a public function URL on a bucket-reaching function (expected miss).
2. Coverage benchmark against the 91 pathfinding.cloud paths (data imported with attribution, Apache-2.0). Prediction by category written before the run. The result goes into `docs/REAL_STACKS.md`.
3. No rule change in Step 7 unless a trial shows a defect of an existing rule.

## 6. Decisions (user, 2026-11-22)

- The order of section 4 is approved.
- Step 7 as in section 5.
- After the brushup: B first, then C.
- Self-escalation gets a new rule ID (`PG-IAM-005`).
- The pathfinding.cloud data may be imported into the repository as test input.
- This analysis is kept in `.kiro/steering/` (this file, manual inclusion).
