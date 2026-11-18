/**
 * 生成Caseの網羅状況を数えます。必須の項目が0件なら、比較の前に失敗させます。
 * ジェネレータの退行で、気づかないうちに検査範囲が狭まることを防ぐためです。
 */
export class Coverage {
  private readonly counts = new Map<string, number>();

  /** keyの件数を1増やします。 */
  public add(key: string): void {
    this.counts.set(key, (this.counts.get(key) ?? 0) + 1);
  }

  /** keyの件数を返します。未観測なら0です。 */
  public get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  /** 観測したkeyを辞書順で返します。 */
  public keys(): string[] {
    return [...this.counts.keys()].sort();
  }

  /** 必須keyのうち、1件も観測されなかったものを返します。 */
  public missing(required: readonly string[]): string[] {
    return required.filter((key) => this.get(key) === 0);
  }

  /** 実行ログ用の要約を返します（seedや件数をCIログで確認できるようにします）。 */
  public summary(): string {
    return this.keys()
      .map((key) => `${key}=${this.get(key)}`)
      .join("\n");
  }
}

/** 必須keyが欠けていれば、欠けたkeyを列挙して例外にします。 */
export function assertCoverage(coverage: Coverage, required: readonly string[]): void {
  const missing = coverage.missing(required);
  if (missing.length > 0) {
    throw new Error(`Coverage counters are zero for: ${missing.join(", ")}`);
  }
}
