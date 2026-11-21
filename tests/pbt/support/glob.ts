/**
 * オラクル専用の独立したglob実装です。本番の`matches`は使わず、型以外は何もimportしません。
 *
 * 規則: `*`は任意長（0文字以上）、`?`は任意の1文字を表します。コロンも普通の文字として扱い、
 * ARNの区切りという特別な扱いはしません。
 * 根拠は、IAMポリシーエンジンの実際の判定です（iam:SimulateCustomPolicy, 2026-11-21, `aws-observations*.json`）。
 * `arn:aws:s3:*b/k`は`arn:aws:s3:::b/k`に一致し、`arn:aws:s3:?:b/k`も一致します。
 * 以前は、セグメント末尾の`*`だけがコロンを越え、`?`は越えない、と読んでいました（Decision 8.2）。それはAWSの動作と違いました。
 * Rule: `*` is any run of characters, `?` is any single character, and a colon is an ordinary character.
 * Basis: decisions of the real IAM engine (see `aws-observations*.json`). The earlier rule (only a segment-final
 * `*` crosses a colon, a `?` never does) did not match AWS.
 */
/** パターンを構成するトークンです。 */
export type Token =
  | { readonly kind: "lit"; readonly char: string }
  | { readonly kind: "one" }
  | { readonly kind: "star" };
/** パターン文字列をトークン列へ変換します。 */
export function compileGlob(pattern: string): Token[] {
  return [...pattern].map((char) =>
    char === "?" ? { kind: "one" } : char === "*" ? { kind: "star" } : { kind: "lit", char },
  );
}
/** ワイルドカードを含まない、完全に固定した文字列のトークン列です。 */
export function literalTokens(text: string): Token[] {
  return [...text].map((char) => ({ kind: "lit", char }));
}
/** 任意の文字列を表す末尾の`*`です。 */
export const ANY_SUFFIX: Token = { kind: "star" };
/** 1文字がトークンに受理されるかの判定です。ワイルドカードは、コロンを含むどの文字も受理します。 */
function accepts(token: Token, char: string): boolean {
  return token.kind !== "lit" || token.char === char;
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
      result = go(i + 1, j) || (j < value.length && go(i, j + 1));
    } else if (j < value.length && accepts(token, value.charAt(j))) {
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
  // ワイルドカードは、どの文字も受理するため、共有できる文字が必ずあります。
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
