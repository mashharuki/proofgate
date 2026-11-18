/**
 * Extractor-levelの実行本体です。`extractStack`相当の関数を引数にしているため、
 * 自己検査では意図的に壊した実装を差し込めます。Leanも本番の評価器も使いません（Requirement 4.7）。
 */
import type { ExtractionResult } from "@proofgate/model";
import { Coverage } from "./coverage.js";
import { replayCommand } from "./report.js";
import { shrinkWith } from "./shrink.js";
import { build, check, type TemplateSpec, templateReductions } from "./template-gen.js";

export interface ExtractorReport {
  readonly failures: number;
  readonly countsByKind: Readonly<Record<string, number>>;
  /** 縮小して整形した報告です。 */
  readonly reports: readonly string[];
  readonly coverage: Coverage;
}

const kindOf = (failure: string) => failure.split(":")[0] ?? failure;

/** 仕様の大きさの目安です（ロール、ポリシー、Statement、attached、noiseの数の合計）。 */
function sizeOf(spec: TemplateSpec): number {
  const { recipe } = spec;
  return (
    recipe.roles.length +
    recipe.roles.reduce((n, r) => n + r.policies.length + r.policies.flat().length, 0) +
    recipe.attached.length +
    recipe.attached.reduce((n, a) => n + a.statements.length, 0) +
    recipe.noise
  );
}

export function runExtractorCases(
  specs: readonly TemplateSpec[],
  extract: (template: unknown) => ExtractionResult,
  options: { readonly seed: number; readonly maxReportsPerKind: number },
): ExtractorReport {
  const coverage = new Coverage();
  const failed: { spec: TemplateSpec; failure: string }[] = [];
  for (const spec of specs) {
    coverage.add(`kind:${spec.kind}`);
    for (const shape of spec.shapes) coverage.add(`shape:${shape}`);
    const failure = check(spec, extract);
    if (failure !== undefined) failed.push({ spec, failure });
  }
  const countsByKind: Record<string, number> = {};
  for (const { failure } of failed) {
    countsByKind[kindOf(failure)] = (countsByKind[kindOf(failure)] ?? 0) + 1;
  }
  const reports: string[] = [];
  for (const kind of Object.keys(countsByKind)) {
    const ofKind = failed.filter((f) => kindOf(f.failure) === kind);
    const wanted = Math.min(options.maxReportsPerKind, ofKind.length);
    for (let i = 0; i < wanted; i++) {
      const { spec, failure } = ofKind[
        Math.floor((i * ofKind.length) / wanted)
      ] as (typeof failed)[number];
      // 同じ種類の失敗が残る候補だけを採用します。毒の位置は縮小時に添字を直します。
      const stillFails = (candidate: TemplateSpec) => {
        const next = check(candidate, extract);
        return next !== undefined && kindOf(next) === kind;
      };
      const reduced = shrinkWith(spec, {
        maxRounds: 200,
        reductions: templateReductions,
        sizeOf,
        check: (candidates) => candidates.map(stillFails),
        confirm: stillFails,
      });
      reports.push(
        [
          `COUNTEREXAMPLE (extractor-level) ${kind}`,
          `seed=${options.seed} case=${spec.id} fragment=${spec.kind}`,
          `detail: ${failure.slice(0, 600)}`,
          `replay: ${replayCommand("extractor", options.seed, spec.id)}`,
          reduced.confirmed
            ? `reduced from size ${reduced.sizeBefore} to ${reduced.sizeAfter} (failure confirmed again):`
            : `reduction could not be confirmed; showing the original (size ${reduced.sizeBefore}):`,
          JSON.stringify(build(reduced.result).template),
        ].join("\n"),
      );
    }
  }
  return { failures: failed.length, countsByKind, reports, coverage };
}
