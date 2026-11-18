/**
 * 生成テスト用の決定的な擬似乱数です。
 * 同じseedとindexからは常に同じ列が得られ、失敗したCaseを単独で再生成できます。
 */

/** 乱数生成器が提供する操作です。 */
export interface Rng {
  /** [0, 1)の実数を返します。 */
  next(): number;
  /** min以上max以下の整数を返します。 */
  int(min: number, max: number): number;
  /** 確率pでtrueを返します。 */
  chance(p: number): boolean;
  /** 空でない配列から1要素を選びます。 */
  pick<T>(items: readonly T[]): T;
  /** 元の配列を変更せず、並び替えた配列を返します。 */
  shuffle<T>(items: readonly T[]): T[];
}

/** mulberry32: 32bit状態の小さな乱数生成器です。 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** (seed, index)から、Caseごとに独立した32bitのサブシードを作ります。 */
export function subSeed(seed: number, index: number): number {
  let h = (seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b) >>> 0;
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/** サブシードから乱数操作一式を作ります。 */
export function createRng(seed: number, index: number): Rng {
  const next = mulberry32(subSeed(seed, index));
  const rng: Rng = {
    next,
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    chance: (p) => next() < p,
    pick: (items) => {
      if (items.length === 0) throw new Error("pick: empty array");
      return items[Math.floor(next() * items.length)] as (typeof items)[number];
    },
    shuffle: (items) => {
      const copy = [...items];
      for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [copy[i], copy[j]] = [copy[j] as (typeof copy)[number], copy[i] as (typeof copy)[number]];
      }
      return copy;
    },
  };
  return rng;
}
