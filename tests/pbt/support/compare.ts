/**
 * カテゴリごとの比較規則です（design 4.4）。
 *
 * - O1（Caseのlabel）とO2（独立オラクル）の不一致は、製品ではなくハーネスの欠陥です。
 * - unsafe: TypeScriptがsafeなら、見逃し（soundness違反）です。
 * - safe / boundary: TypeScriptはlabelと一致する必要があります。
 * - conservative: TypeScriptはsafe、または「説明できる」unsafeのどちらかです。
 * - Leanは、すべてのカテゴリでTypeScriptと一致する必要があります。
 *
 * 比較のたびに、どの規則に違反したかをCounterexampleとして返します。
 */
import type { Violation } from "@proofgate/model";
import { HarnessError, type Verdict } from "./lean-batch.js";
import type { Case, Category, Tag } from "./model-gen.js";

type MismatchKind = "soundness" | "false-alarm" | "unexplained-alarm" | "ts-lean";

export interface Counterexample {
  readonly kind: MismatchKind;
  readonly caseId: number;
  readonly category: Category;
  readonly verdicts: {
    readonly label: Verdict;
    readonly oracle: Verdict;
    readonly ts: Verdict;
    readonly lean: Verdict | undefined;
  };
  readonly detail: string;
}

/** TypeScript評価器の判定です。violationが1件でもあればunsafeです。 */
export function tsVerdict(violations: readonly Violation[]): Verdict {
  return violations.length > 0 ? "unsafe" : "safe";
}

/**
 * すべてのviolationが、タグ付きの形式で説明できるかを判定します。
 * 説明できるとは、violationのsourcePathsがwitnessのStatementを含むか、
 * violationの対象ロールがwitnessのロール（trust principalが`*`のロール）であることです。
 */
export function isExplained(c: Case, violations: readonly Violation[]): boolean {
  if (c.tags.length === 0 || violations.length === 0) return false;
  return violations.every(
    (v) =>
      c.witness.paths.some((path) => v.sourcePaths.includes(path)) ||
      c.witness.roles.includes(v.targetRoleLogicalId),
  );
}

/** conservative CaseでTypeScriptが説明可能なunsafeを返したとき、そのタグを返します。 */
export function explainedTags(c: Case, violations: readonly Violation[]): readonly Tag[] {
  return isExplained(c, violations) ? c.tags : [];
}

/** 1つのCaseを3者（O1、O2、TypeScript、Lean）で比較し、違反したルールを返します。 */
export function judgeCase(
  c: Case,
  oracle: Verdict,
  violations: readonly Violation[],
  lean: Verdict | undefined,
): Counterexample[] {
  if (c.label !== oracle) {
    throw new HarnessError(
      `HARNESS ERROR: O1 (label ${c.label}) differs from O2 (oracle ${oracle}) for case ${c.id}`,
    );
  }
  const ts = tsVerdict(violations);
  const make = (kind: MismatchKind, detail: string): Counterexample => ({
    kind,
    caseId: c.id,
    category: c.category,
    verdicts: { label: c.label, oracle, ts, lean },
    detail,
  });
  const found: Counterexample[] = [];
  if (c.category === "conservative") {
    if (ts === "unsafe" && !isExplained(c, violations)) {
      found.push(
        make(
          "unexplained-alarm",
          "TypeScript reported unsafe, but no violation is explained by a tagged form",
        ),
      );
    }
  } else if (ts !== c.label) {
    found.push(
      c.label === "unsafe"
        ? make("soundness", "an escalation path allowed under AWS semantics was missed")
        : make(
            "false-alarm",
            "TypeScript reported unsafe for a model that is safe under AWS semantics",
          ),
    );
  }
  if (lean !== undefined && lean !== ts) {
    found.push(make("ts-lean", `Lean says ${lean}, TypeScript says ${ts}`));
  }
  return found;
}
