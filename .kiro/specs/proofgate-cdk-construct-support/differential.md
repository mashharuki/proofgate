# Differential result (Task 9.1)

Command: `node scripts/differential.mjs --old <worktree of 5aae200 (1.0.1) with packages built> --support <tests/pbt/support compiled with tsc>`, run on 2026-11-19. Output as printed:

```text
# Differential: 1.0.1 (/tmp/pg-101) against the current code, 3034 inputs

## P1: findings of 1.0.1 that disappeared (must be 0): 0

## P2: PG-IAM-003 -> readable (real stacks and regressions): 7
- RS-05 RealStack.template.json: PG-IAM-003 -> accepted by R1+R2
- RS-06 RealStack.template.json: PG-IAM-003 -> accepted by R1
- RS-07 RealStack.template.json: PG-IAM-003 -> accepted by R1+R2+R3
- RS-08 RealStack.template.json: PG-IAM-003 -> accepted by R1
- RS-09 RealStack.template.json: PG-IAM-003 -> accepted by R2
- RS-10 RealStack.template.json: PG-IAM-003 -> PG-IAM-004 by R1
- RS-11 RealStack.template.json: PG-IAM-003 -> PG-IAM-004 by R1+R2

## P2: PG-IAM-003 -> readable (generated fragments, counted by rule): 7
- R1+R2: 77
- R1+R2+R3: 195
- R2+R3: 59
- R3: 45
- R1+R3: 66
- R1: 29
- R2: 14

## New findings by transition (allowed: they only add findings): 2
- PG-IAM-003 -> PG-IAM-004: 143
- accepted -> PG-IAM-004: 4

## New findings outside the generated fragments: 6
- RS-10 RealStack.template.json: PG-IAM-003 -> PG-IAM-004, new BuildRoleB7C66CB2->DataRole4FF39EB0@arn:aws:s3:::proofgate-protected-data
- RS-11 RealStack.template.json: PG-IAM-003 -> PG-IAM-004, new DeveloperRole58EC5A58->DataRole4FF39EB0@arn:aws:s3:::proofgate-protected-data
- regression r0-1-unnamed-prefix-star: accepted -> PG-IAM-004, new Dev->Data@arn:aws:s3:::protected-bucket
- regression r0-2-unnamed-role-star: accepted -> PG-IAM-004, new Dev->Data@arn:aws:s3:::protected-bucket
- regression r0-3-unnamed-question: accepted -> PG-IAM-004, new Dev->Data@arn:aws:s3:::protected-bucket
- regression r0-4-unnamed-opaque-exact: accepted -> PG-IAM-004, new Dev->Data@arn:aws:s3:::protected-bucket
```
