import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compileGlob, matchTokens } from "./support/glob.js";

// spec proofgate-brushup, data verification (2026-11-21). The matching rules of ProofGate came from the AWS
// documentation. This test compares them with decisions of the real IAM policy engine, observed with
// iam:SimulateCustomPolicy through the AWS MCP Server (`aws-observations.json`).
//
// Two readings are compared:
//  - the independent oracle (`glob.ts`, the rules of design 8.2), and
//  - the matcher of the evaluator in `packages/core` (a regular expression, case-insensitive, `*` and `?` over
//    any characters). `matches` is not exported, so its one-line definition is copied here; if the production
//    code changes, `core-matching.test.ts` and the generated tests still exercise the real one.
// Known deviations are listed explicitly, so that a change on either side makes this test fail and must be
// reviewed. A deviation of the evaluator may only be on the over-approximating side (it matches where AWS does not).
// ProofGateの規則を、IAMポリシーエンジンの実際の判定と比べます。食い違いは明示し、変化があればテストが落ちます。
type Row = [string, string, string, boolean];
const read = (file: string) =>
  JSON.parse(readFileSync(join(process.cwd(), file), "utf8")) as {
    resource?: Row[];
    action?: Row[];
  };
const first = read("tests/pbt/aws-observations.json");
const second = read("tests/pbt/aws-observations-2.json");
const observations = {
  resource: [...(first.resource ?? []), ...(second.resource ?? [])],
  action: first.action ?? [],
};

const oracleResource = (pattern: string, value: string) => matchTokens(compileGlob(pattern), value);
const oracleAction = (pattern: string, value: string) =>
  matchTokens(compileGlob(pattern.toLowerCase()), value.toLowerCase());
// Copy of `matches` in packages/core/src/index.ts.
const evaluatorMatches = (pattern: string, value: string): boolean => {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", ".*")
    .replaceAll("?", ".");
  return new RegExp(`^${escaped}$`, "i").test(value);
};

/**
 * Rows where the oracle differs from AWS. None since the oracle reads `*` and `?` as plain wildcards that also
 * stand for a colon (before this fix: R13, P11, and Q03, Q04, Q05, Q09, Q10, Q11, Q14 of the second file; one cause: a `*` crossed a colon
 * only at the end of a segment and a `?` never did).
 */
const ORACLE_DEVIATIONS: string[] = [];
/** Rows where the evaluator differs from AWS: all are the case-insensitive reading (AWS is case-sensitive), an over-approximation. */
const EVALUATOR_DEVIATIONS = ["P07", "R05", "R06", "R17"];

const ids = (rows: Row[], read: (pattern: string, value: string) => boolean) =>
  rows.filter(([, pattern, value, aws]) => read(pattern, value) !== aws).map(([id]) => id);

describe("matching rules against the real IAM engine", () => {
  it("has the observations that were taken", () => {
    expect(observations.resource).toHaveLength(45);
    expect(observations.action).toHaveLength(13);
  });
  it("the oracle agrees with AWS except on the listed rows", () => {
    expect(
      [
        ...ids(observations.resource, oracleResource),
        ...ids(observations.action, oracleAction),
      ].sort(),
    ).toEqual([...ORACLE_DEVIATIONS].sort());
  });
  it("the evaluator agrees with AWS except on the listed rows, and only by matching more", () => {
    const rows = [...observations.resource, ...observations.action];
    const found = ids(rows, evaluatorMatches);
    expect(found.sort()).toEqual([...EVALUATOR_DEVIATIONS].sort());
    for (const [id, pattern, value, aws] of rows) {
      if (found.includes(id)) {
        expect(aws, `${id} must be a row where AWS does not match`).toBe(false);
        expect(evaluatorMatches(pattern, value), `${id} the evaluator matches more than AWS`).toBe(
          true,
        );
      }
    }
  });
});
