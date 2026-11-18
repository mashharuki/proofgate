/**
 * 失敗の報告書式です（design 6.1）。再現に必要な情報（seed、index、貼り付け可能なJSON、再生コマンド）を
 * 必ず含め、ハーネスの欠陥は製品の欠陥と別の見出しにします。
 */
import type { Counterexample } from "./compare.js";
import type { Shrinkable, ShrinkResult } from "./shrink.js";

/** 1つのCaseだけを再生するコマンドです。 */
export function replayCommand(layer: "model" | "extractor", seed: number, caseId: number): string {
  const file =
    layer === "model" ? "tests/pbt/model-agreement.test.ts" : "tests/pbt/extractor.test.ts";
  return `PROOFGATE_PBT_SEED=${seed} PROOFGATE_PBT_ONLY=${caseId} pnpm vitest run ${file}`;
}

/** 製品の欠陥を疑うCounterexampleの報告です。縮小結果があれば、縮小後のCaseを載せます。 */
export function formatCounterexample(
  layer: "model" | "extractor",
  seed: number,
  counterexample: Counterexample,
  reduced?: ShrinkResult & { readonly result: Shrinkable },
): string {
  const { verdicts } = counterexample;
  const lines = [
    `COUNTEREXAMPLE (${layer}-level) ${counterexample.kind}`,
    `seed=${seed} case=${counterexample.caseId} category=${counterexample.category}`,
    `verdicts: label=${verdicts.label} oracle=${verdicts.oracle} ts=${verdicts.ts} lean=${verdicts.lean ?? "not checked"}`,
    `detail: ${counterexample.detail}`,
    `replay: ${replayCommand(layer, seed, counterexample.caseId)}`,
  ];
  if (reduced !== undefined) {
    lines.push(
      reduced.confirmed
        ? `reduced from size ${reduced.sizeBefore} to ${reduced.sizeAfter} (confirmed by oracle, TypeScript, and Lean):`
        : `reduction could not be confirmed; showing the original (size ${reduced.sizeBefore}):`,
      JSON.stringify(reduced.result),
    );
  }
  return lines.join("\n");
}

/** ハーネス自身の欠陥の報告です。製品の欠陥と取り違えないよう、見出しを分けます。 */
export function formatHarnessError(
  seed: number,
  caseId: number | undefined,
  message: string,
): string {
  const where = caseId === undefined ? "" : ` case=${caseId}`;
  return `HARNESS ERROR (not a product defect) seed=${seed}${where}\n${message}`;
}
