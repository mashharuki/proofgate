/**
 * 生成テストの設定です。環境変数から読み取り、不正な値は既定値へ置き換えず失敗させます。
 */

/** リポジトリに固定する既定seedです。CIでは常にこの値を使い、実行を決定的にします。 */
export const DEFAULT_SEED = 0x50524f46;
/** Model-levelの既定Case数です。 */
export const DEFAULT_CASES = 2000;
/** Leanへ渡す既定のCase数です。CI実測後に確定します（design 9.2）。 */
const DEFAULT_LEAN_CASES = 2000;
/** Extractor-levelの既定Case数です。 */
const DEFAULT_EXTRACTOR_CASES = 1000;

export interface PbtConfig {
  readonly seed: number;
  readonly cases: number;
  /** Leanへ渡すCase数。casesを超える場合はcasesに切り詰めます。 */
  readonly leanCases: number;
  readonly extractorCases: number;
  /** 指定すると、そのindexのCaseだけを再生します。 */
  readonly only: number | undefined;
}

type Env = Readonly<Record<string, string | undefined>>;

function readInteger(env: Env, name: string, fallback: number, minimum: number): number {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  if (!/^\d+$/.test(raw)) {
    throw new Error(`${name} must be a non-negative integer, got "${raw}"`);
  }
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${name} must be an integer of at least ${minimum}, got "${raw}"`);
  }
  return value;
}

/** 環境変数から設定を読み取ります。 */
export function readConfig(env: Env = process.env): PbtConfig {
  const cases = readInteger(env, "PROOFGATE_PBT_CASES", DEFAULT_CASES, 1);
  const leanCases = readInteger(env, "PROOFGATE_PBT_LEAN_CASES", DEFAULT_LEAN_CASES, 0);
  const onlyRaw = env.PROOFGATE_PBT_ONLY;
  return {
    seed: readInteger(env, "PROOFGATE_PBT_SEED", DEFAULT_SEED, 0) >>> 0,
    cases,
    leanCases: Math.min(leanCases, cases),
    extractorCases: readInteger(env, "PROOFGATE_PBT_EXTRACTOR_CASES", DEFAULT_EXTRACTOR_CASES, 1),
    only:
      onlyRaw === undefined || onlyRaw === ""
        ? undefined
        : readInteger(env, "PROOFGATE_PBT_ONLY", 0, 0),
  };
}
