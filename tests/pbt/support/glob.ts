/**
 * オラクル専用の独立したglob実装です。本番の`matches`は使わず、型以外は何もimportしません。
 *
 * AWSドキュメントの記述に基づく規則:
 * - `*`は任意長、`?`は任意の1文字を表す。
 * - ARNでは、セグメント末尾の`*`はコロンを越えて広がれる。それ以外の`*`と`?`は
 *   同じセグメント内にとどまる（Decision 8.2: `*` and colon boundaries）。
 */

/** パターンを構成するトークンです。 */
export type Token =
  | { readonly kind: "lit"; readonly char: string }
  | { readonly kind: "one"; readonly noColon: boolean }
  | { readonly kind: "star"; readonly noColon: boolean };

export interface CompileOptions {
  /** trueならARN向けにコロン境界の規則を適用します。Action名ではfalseにします。 */
  readonly colonAware: boolean;
}

/** パターン文字列をトークン列へ変換します。 */
export function compileGlob(pattern: string, options: CompileOptions): Token[] {
  const tokens: Token[] = [];
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charAt(i);
    if (char === "?") {
      tokens.push({ kind: "one", noColon: options.colonAware });
    } else if (char === "*") {
      const next = pattern.charAt(i + 1);
      // セグメント末尾（次がコロンまたはパターン末尾）の`*`だけがコロンを越えられます。
      const atSegmentEnd = i + 1 >= pattern.length || next === ":";
      tokens.push({ kind: "star", noColon: options.colonAware && !atSegmentEnd });
    } else {
      tokens.push({ kind: "lit", char });
    }
  }
  return tokens;
}

/** ワイルドカードを含まない、完全に固定した文字列のトークン列です。 */
export function literalTokens(text: string): Token[] {
  return [...text].map((char) => ({ kind: "lit", char }));
}

/** 任意の文字列を表す末尾の`*`です（セグメント末尾なのでコロンも越えます）。 */
export const ANY_SUFFIX: Token = { kind: "star", noColon: false };

/** トークンが表す文字クラスのうち、コロンを含めるかどうかの判定です。 */
function wildcardAllows(token: Token, char: string): boolean {
  if (token.kind === "lit") return token.char === char;
  return !token.noColon || char !== ":";
}

/** パターンがvalue全体に一致するかを判定します（メモ化した再帰）。 */
export function matchTokens(tokens: readonly Token[], value: string): boolean {
  const memo = new Map<number, boolean>();
  const width = value.length + 1;
  const go = (i: number, j: number): boolean => {
    const key = i * width + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    let result = false;
    const token = tokens[i];
    if (token === undefined) {
      result = j === value.length;
    } else if (token.kind === "star") {
      result = go(i + 1, j);
      if (!result && j < value.length && wildcardAllows(token, value.charAt(j))) {
        result = go(i, j + 1);
      }
    } else if (j < value.length && wildcardAllows(token, value.charAt(j))) {
      result = go(i + 1, j + 1);
    }
    memo.set(key, result);
    return result;
  };
  return go(0, 0);
}

/** 2つのトークンが同時に受理できる文字が存在するかを判定します。 */
function compatible(a: Token, b: Token): boolean {
  if (a.kind === "lit" && b.kind === "lit") return a.char === b.char;
  if (a.kind === "lit") return wildcardAllows(b, a.char);
  if (b.kind === "lit") return wildcardAllows(a, b.char);
  // ワイルドカード同士は、コロン以外の文字を必ず共有します。
  return true;
}

/**
 * 2つのパターンが表す文字列集合の共通部分が空でないかを判定します。
 * 片方をもう片方へ当てはめるだけの一方向の照合ではなく、集合の交差を調べます（D1）。
 */
export function intersects(a: readonly Token[], b: readonly Token[]): boolean {
  const memo = new Map<number, boolean>();
  const width = b.length + 1;
  const go = (i: number, j: number): boolean => {
    const key = i * width + j;
    const cached = memo.get(key);
    if (cached !== undefined) return cached;
    memo.set(key, false); // 循環の安全弁。再入した状態は新しい情報を持ちません。
    const left = a[i];
    const right = b[j];
    let result = false;
    if (left === undefined && right === undefined) {
      result = true;
    } else {
      if (left?.kind === "star") result = go(i + 1, j);
      if (!result && right?.kind === "star") result = go(i, j + 1);
      // 両方が`*`のときの同時消費は、どちらかの`*`を飛ばす分岐と等価なので省きます。
      const bothStars = left?.kind === "star" && right?.kind === "star";
      if (!result && left !== undefined && right !== undefined && !bothStars) {
        if (compatible(left, right)) {
          result = go(left.kind === "star" ? i : i + 1, right.kind === "star" ? j : j + 1);
        }
      }
    }
    memo.set(key, result);
    return result;
  };
  return go(0, 0);
}
