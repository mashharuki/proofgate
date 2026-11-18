/**
 * Model-levelの3者比較（O2、TypeScript、Lean）を実行する本体です。
 * `evaluate`・`generateLean`・オラクルを引数にしているため、自己検査では意図的に壊した実装を
 * 差し込んで、ハーネスが欠陥を検出できることを確かめられます（design 11）。
 */
import type { ProofGateConfig, StackModel, Violation } from "@proofgate-cdk/model";
import {
  type Counterexample,
  explainedTags,
  isExplained,
  judgeCase,
  tsVerdict,
} from "./compare.js";
import { Coverage } from "./coverage.js";
import { type BatchCase, leanLaunchCount, runBatch, type Verdict } from "./lean-batch.js";
import { type Case, TAGS } from "./model-gen.js";
import { oracleVerdict } from "./oracle.js";
import { formatCounterexample } from "./report.js";
import { type Shrinkable, shrink } from "./shrink.js";

/** Lean絡みの縮小で、1ラウンドに調べる候補の最大数です。Leanのエラー報告の上限（約100件）より小さくします。 */
const MAX_LEAN_CANDIDATES_PER_ROUND = 60;

export interface AgreementDeps {
  readonly evaluate: (model: StackModel, config: ProofGateConfig) => Violation[];
  readonly generate: (model: StackModel, config: ProofGateConfig) => string;
  readonly oracle?: (model: StackModel, config: ProofGateConfig) => Verdict;
  readonly leanDirectory: string;
}

export interface AgreementOptions {
  readonly seed: number;
  /** Leanへ渡すCaseの上限です。境界Caseとconservative Caseは常に含めます。 */
  readonly leanCases: number;
  /** 種別ごとに、縮小して報告するCounterexampleの最大数です。0なら縮小しません。 */
  readonly maxReportsPerKind: number;
  /** falseならLeanを起動しません（評価器やオラクルだけを調べる自己検査用）。既定はtrueです。 */
  readonly useLean?: boolean;
}

export interface AgreementReport {
  readonly counterexamples: readonly Counterexample[];
  readonly countsByKind: Readonly<Record<string, number>>;
  /** 縮小して整形済みの報告です。 */
  readonly reports: readonly string[];
  readonly coverage: Coverage;
  readonly leanChecked: number;
  /** 全Caseの検査に使ったLean起動回数です（縮小時の起動は含みません）。 */
  readonly launches: number;
  /** タグごとに、説明可能なunsafeが1件も観測されなかったもの（タグの有効性違反）です。 */
  readonly vitalityMissing: readonly string[];
}

/** 境界Caseとconservative Caseを必ず含め、残りを先頭から上限まで選びます。 */
export function selectLeanCases(cases: readonly Case[], limit: number): Case[] {
  const mandatory = cases.filter((c) => c.category === "boundary" || c.category === "conservative");
  if (limit >= cases.length) return [...cases];
  const budget = Math.max(0, limit - mandatory.length);
  const others = cases.filter((c) => c.category === "unsafe" || c.category === "safe");
  const picked = new Set([...mandatory, ...others.slice(0, budget)]);
  return cases.filter((c) => picked.has(c));
}

const hasAll = (s: Shrinkable, paths: readonly string[]) => {
  const present = new Set(s.model.roles.flatMap((r) => r.statements.map((st) => st.sourcePath)));
  return paths.every((path) => present.has(path));
};

export function runAgreement(
  cases: readonly Case[],
  deps: AgreementDeps,
  options: AgreementOptions,
): AgreementReport {
  const oracle = deps.oracle ?? oracleVerdict;
  const coverage = new Coverage();
  const counterexamples: Counterexample[] = [];
  const byId = new Map<number, Case>();
  const computed = new Map<number, { o2: Verdict; violations: Violation[]; ts: Verdict }>();

  for (const c of cases) {
    byId.set(c.id, c);
    coverage.add(`category:${c.category}`);
    for (const tag of c.tags) coverage.add(`tag:${tag}`);
    for (const form of c.forms) coverage.add(`form:${form}`);
    const o2 = oracle(c.model, c.config);
    const violations = deps.evaluate(c.model, c.config);
    computed.set(c.id, { o2, violations, ts: tsVerdict(violations) });
    for (const tag of explainedTags(c, violations)) coverage.add(`tag-explained:${tag}`);
  }

  // Leanの検査: 1回のバッチで、対象Case全件の判定を取得します。
  const useLean = options.useLean ?? true;
  const leanSet = useLean ? selectLeanCases(cases, options.leanCases) : [];
  for (const c of leanSet) coverage.add(`lean:category:${c.category}`);
  const batch: BatchCase[] = leanSet.map((c) => ({
    id: c.id,
    model: c.model,
    config: c.config,
    ts: (computed.get(c.id) as { ts: Verdict }).ts,
  }));
  const launchStart = leanLaunchCount();
  const leanResult = runBatch(batch, deps.generate, { leanDirectory: deps.leanDirectory });
  const launches = leanLaunchCount() - launchStart;

  for (const c of cases) {
    const { o2, violations, ts } = computed.get(c.id) as {
      o2: Verdict;
      violations: Violation[];
      ts: Verdict;
    };
    const lean = leanResult.verdicts.get(c.id);
    // O1とO2の不一致はHarnessErrorとして、そのまま例外にします（製品の欠陥と区別するため）。
    counterexamples.push(...judgeCase(c, o2, violations, lean));
    if (leanResult.failed.has(c.id)) {
      counterexamples.push({
        kind: "ts-lean",
        caseId: c.id,
        category: c.category,
        verdicts: { label: c.label, oracle: o2, ts, lean },
        detail: "Lean rejected the theorem that states the TypeScript verdict",
      });
    }
  }

  const countsByKind: Record<string, number> = {};
  for (const ce of counterexamples) countsByKind[ce.kind] = (countsByKind[ce.kind] ?? 0) + 1;

  // 種別ごとに、失敗の一覧へ等間隔に散らした数件を縮小し、確認済みの最小Caseを報告します。
  // 先頭の数件だけでは同じ原因ばかりになるため、異なる原因を拾いやすくします。
  const reports: string[] = [];
  const kinds = [...new Set(counterexamples.map((ce) => ce.kind))];
  for (const kind of kinds) {
    const ofKind = counterexamples.filter((ce) => ce.kind === kind);
    const wanted = Math.min(options.maxReportsPerKind, ofKind.length);
    for (let i = 0; i < wanted; i++) {
      const ce = ofKind[Math.floor((i * ofKind.length) / wanted)] as Counterexample;
      const original = byId.get(ce.caseId) as Case;
      const reduced = reduce(original, ce, deps, oracle, useLean);
      reports.push(formatCounterexample("model", options.seed, ce, reduced));
    }
  }

  const vitalityMissing = TAGS.filter((tag) => coverage.get(`tag-explained:${tag}`) === 0);
  return {
    counterexamples,
    countsByKind,
    reports,
    coverage,
    leanChecked: leanSet.length,
    launches,
    vitalityMissing,
  };
}

/** 元の不一致が残るかを、O2とTypeScriptだけで判定します（Lean絡みでない種別用）。 */
function stillFails(
  kind: Counterexample["kind"],
  original: Case,
  s: Shrinkable,
  deps: AgreementDeps,
  oracle: NonNullable<AgreementDeps["oracle"]>,
): boolean {
  const o2 = oracle(s.model, s.config);
  const violations = deps.evaluate(s.model, s.config);
  const ts = tsVerdict(violations);
  if (kind === "soundness") return o2 === "unsafe" && ts === "safe";
  if (kind === "false-alarm") return o2 === "safe" && ts === "unsafe";
  if (kind === "unexplained-alarm") {
    const probe: Case = { ...original, model: s.model, config: s.config };
    return (
      o2 === "safe" &&
      ts === "unsafe" &&
      hasAll(s, original.witness.paths) &&
      !isExplained(probe, violations)
    );
  }
  return false;
}

function leanDisagrees(candidates: readonly Shrinkable[], deps: AgreementDeps): boolean[] {
  const batch: BatchCase[] = candidates.map((s, id) => ({
    id,
    model: s.model,
    config: s.config,
    ts: tsVerdict(deps.evaluate(s.model, s.config)),
  }));
  const result = runBatch(batch, deps.generate, { leanDirectory: deps.leanDirectory });
  return batch.map((b) => result.failed.has(b.id) || result.verdicts.get(b.id) !== b.ts);
}

function reduce(
  original: Case,
  ce: Counterexample,
  deps: AgreementDeps,
  oracle: NonNullable<AgreementDeps["oracle"]>,
  useLean: boolean,
) {
  const start: Shrinkable = { model: original.model, config: original.config };
  if (ce.kind === "ts-lean") {
    return shrink(start, {
      maxRounds: 8,
      // 1ラウンドを1回のLean起動に収めるため、先頭の候補だけを調べます。系統的な不一致では全候補が失敗し、
      // 100件のエラー上限（打ち切りの疑い）に達してしまうためです。貪欲法は先頭の成功を採るので影響は小さいです。
      check: (candidates) => {
        const head = leanDisagrees(candidates.slice(0, MAX_LEAN_CANDIDATES_PER_ROUND), deps);
        return candidates.map((_, index) => head[index] ?? false);
      },
      confirm: (candidate) => leanDisagrees([candidate], deps)[0] === true,
    });
  }
  return shrink(start, {
    maxRounds: 200,
    check: (candidates) =>
      candidates.map((candidate) => stillFails(ce.kind, original, candidate, deps, oracle)),
    // 最終確認: O2とTypeScriptで不一致が残り、Leanも同じ候補で実行して結果を得られること。
    confirm: (candidate) => {
      if (!stillFails(ce.kind, original, candidate, deps, oracle)) return false;
      if (useLean) leanDisagrees([candidate], deps);
      return true;
    },
  });
}
