/**
 * 多数のCaseを1回のLeanプロセスで検査するバッチ実行器です（design 4.5）。
 *
 * - 各Caseについて、本物の`generateLean`の出力から経路リストを取り出し、
 *   `#eval`の判定行と、TypeScriptの判定を述べる`native_decide`の定理を並べます。
 * - 結果の判定は厳格です。マーカーがそろっていても、どのCaseにも対応付けられない
 *   Leanのエラーが1件でもあれば成功扱いにせず、インフラ障害として失敗させます。
 */
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { ProofGateConfig, StackModel } from "@proofgate/model";

export type Verdict = "unsafe" | "safe";

/** ハーネス側の欠陥です（`generateLean`の出力形式の変化など）。製品の欠陥とは区別します。 */
export class HarnessError extends Error {}

/** Lean実行基盤の障害です。Caseの判定（安全・危険・スキップ）として数えてはいけません。 */
export class InfrastructureError extends Error {}

export interface BatchCase {
  readonly id: number;
  readonly model: StackModel;
  readonly config: ProofGateConfig;
  /** TypeScriptの判定。定理はこの値を主張します。 */
  readonly ts: Verdict;
}

/** 1つのCaseが占める、バッチファイル内の行範囲（1始まり、両端を含む）です。 */
interface Range {
  readonly id: number;
  readonly start: number;
  readonly end: number;
}

export interface BatchSource {
  readonly source: string;
  readonly ranges: readonly Range[];
}

export interface BatchResult {
  /** マーカーから読み取ったLeanの判定です。 */
  readonly verdicts: ReadonlyMap<number, Verdict>;
  /** 自分の行範囲内にLeanエラー（定理の不成立を含む）があったCaseです。 */
  readonly failed: ReadonlySet<number>;
}

export interface RunOptions {
  /** Leanプロジェクトのディレクトリ（lakefile.tomlがある場所）。 */
  readonly leanDirectory: string;
  readonly timeoutMs?: number;
}

/** `generateLean`が出力する、期待どおりの形式です。1文字でも違えばHarnessErrorにします。 */
const SHAPE =
  /^import ProofGate\.Security\n\ndef generatedPaths : List ProofGate\.EscalationPath := \[([\s\S]*)\]\n\n#eval if ProofGate\.safe generatedPaths then "PROOFGATE_SAFE" else "PROOFGATE_UNSAFE"\n\ntheorem generatedStackIsSafe : ProofGate\.safe generatedPaths = true := by\n {2}native_decide\n$/;

/** Leanが報告を打ち切る件数の目安です。これ以上は、残りを通過とみなさず失敗にします。 */
const ERROR_CAP = 100;

/** バッチ1回あたりの上限Case数。超える場合は同じ大きさに分割します。 */
export const MAX_CASES_PER_LAUNCH = 4000;

let launches = 0;

/** このモジュールで起動したLeanプロセスの回数です。 */
export function leanLaunchCount(): number {
  return launches;
}

/** 検査対象の件数から、必要な起動回数を返します。 */
export function launchesFor(caseCount: number): number {
  return Math.max(1, Math.ceil(caseCount / MAX_CASES_PER_LAUNCH));
}

/** `generate`（本物の`generateLean`）の出力を束ね、行範囲つきのLeanソースを作ります。 */
export function buildBatchSource(
  cases: readonly BatchCase[],
  generate: (model: StackModel, config: ProofGateConfig) => string,
): BatchSource {
  const blocks: string[] = ["import ProofGate.Security"];
  const ranges: Range[] = [];
  // 次のブロックが始まる行番号（1始まり）。先頭のimport行が1行目です。
  let nextLine = 2;
  for (const batchCase of cases) {
    const output = generate(batchCase.model, batchCase.config);
    const match = SHAPE.exec(output);
    if (match === null) {
      throw new HarnessError(
        `generateLean output has an unexpected shape for case ${batchCase.id}. Update the harness or the generator deliberately.`,
      );
    }
    const list = match[1] ?? "";
    const block = [
      `def case_${batchCase.id} : List ProofGate.EscalationPath := [${list}]`,
      `#eval s!"PGCASE ${batchCase.id} {if ProofGate.safe case_${batchCase.id} then "SAFE" else "UNSAFE"}"`,
      `theorem thm_${batchCase.id} : ProofGate.safe case_${batchCase.id} = ${batchCase.ts === "safe"} := by native_decide`,
    ].join("\n");
    const height = block.split("\n").length;
    ranges.push({ id: batchCase.id, start: nextLine, end: nextLine + height - 1 });
    nextLine += height;
    blocks.push(block);
  }
  return { source: `${blocks.join("\n")}\n`, ranges };
}

const ERROR_LINE = /^(.*?):(\d+):\d+: error/;

/** ソースをLeanで検査し、厳格に分類します。 */
export function runBatchSource(batch: BatchSource, options: RunOptions): BatchResult {
  if (!existsSync(join(options.leanDirectory, ".lake"))) {
    throw new InfrastructureError(
      `Lean project is not built (no .lake in ${options.leanDirectory}). Run pnpm lean:build first.`,
    );
  }
  const directory = mkdtempSync(join(tmpdir(), "proofgate-pbt-"));
  const file = join(directory, "Batch.lean");
  try {
    writeFileSync(file, batch.source, "utf8");
    launches += 1;
    const result = spawnSync("lake", ["env", "lean", resolve(file)], {
      cwd: options.leanDirectory,
      encoding: "utf8",
      timeout: options.timeoutMs ?? 300_000,
      maxBuffer: 256 * 1024 * 1024,
    });
    if (result.error !== undefined || result.signal !== null) {
      throw new InfrastructureError(
        `Lean did not run to completion: ${result.error?.message ?? `signal ${result.signal}`}`,
      );
    }
    return classify(batch, `${result.stdout}\n${result.stderr}`, result.status);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function classify(batch: BatchSource, output: string, status: number | null): BatchResult {
  const verdicts = new Map<number, Verdict>();
  for (const match of output.matchAll(/PGCASE (\d+) (SAFE|UNSAFE)/g)) {
    verdicts.set(Number(match[1]), match[2] === "SAFE" ? "safe" : "unsafe");
  }
  const failed = new Set<number>();
  const unmapped: string[] = [];
  let errorCount = 0;
  for (const line of output.split("\n")) {
    const parsed = ERROR_LINE.exec(line);
    if (parsed !== null) {
      errorCount += 1;
      const lineNumber = Number(parsed[2]);
      const range = batch.ranges.find((r) => lineNumber >= r.start && lineNumber <= r.end);
      if (range === undefined) unmapped.push(line);
      else failed.add(range.id);
    } else if (/^\s*error\b/i.test(line)) {
      // 位置情報のないエラー（Lakeの失敗など）も、対応付けられないエラーとして扱います。
      unmapped.push(line);
    }
  }
  if (unmapped.length > 0) {
    throw new InfrastructureError(
      `Lean reported ${unmapped.length} error(s) that map to no case: ${unmapped[0]?.slice(0, 200)}`,
    );
  }
  if (errorCount >= ERROR_CAP) {
    throw new InfrastructureError(
      `Lean reported ${errorCount} errors; the list may be truncated, so the remaining cases are not assumed to pass. First failing cases: ${[...failed].slice(0, 5).join(", ")}`,
    );
  }
  if (status !== 0 && errorCount === 0) {
    throw new InfrastructureError(
      `Lean exited with status ${String(status)} and no parsable error`,
    );
  }
  for (const range of batch.ranges) {
    // 失敗したCaseは、定義自体が通らず判定行が出ないことがあります。それ以外は必ず必要です。
    if (!verdicts.has(range.id) && !failed.has(range.id)) {
      throw new InfrastructureError(`Lean produced no verdict marker for case ${range.id}`);
    }
  }
  return { verdicts, failed };
}

/** 件数に応じて必要な回数だけLeanを起動し、結果をまとめます。0件なら起動しません。 */
export function runBatch(
  cases: readonly BatchCase[],
  generate: (model: StackModel, config: ProofGateConfig) => string,
  options: RunOptions,
): BatchResult {
  const verdicts = new Map<number, Verdict>();
  const failed = new Set<number>();
  if (cases.length === 0) return { verdicts, failed };
  const chunkCount = launchesFor(cases.length);
  const size = Math.ceil(cases.length / chunkCount);
  for (let index = 0; index < chunkCount; index++) {
    const chunk = cases.slice(index * size, (index + 1) * size);
    const result = runBatchSource(buildBatchSource(chunk, generate), options);
    for (const [id, verdict] of result.verdicts) verdicts.set(id, verdict);
    for (const id of result.failed) failed.add(id);
  }
  return { verdicts, failed };
}
