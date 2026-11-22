import type { App } from "aws-cdk-lib";

/** ProofGateが持つモデルの範囲から外れる理由です（inScopeがfalseのPatternだけが持ちます）。 */
type Boundary = "cross-template" | "acknowledged";

/**
 * 実際のCDKコードに近い1つのスタック構成（Pattern）です。
 * 正解（groundTruth）はAWSの意味論に基づき、レビューで決めた値で、ProofGateの結果とは独立です。
 */
export interface Pattern {
  readonly id: `RS-${string}`;
  readonly title: string;
  /** 英語で2〜3文の説明です。 */
  readonly description: string;
  readonly groundTruth: "safe" | "unsafe";
  /** falseなら、権限昇格経路がモデルの範囲の外にあります（スタックをまたぐ、または作者が抑止している）。 */
  readonly inScope: boolean;
  readonly boundary?: Boundary;
  /**
   * ProofGateの設定へ足す項目です（スタックを作った後に計算します）。保護対象バケットは変えられません。
   * Extra fields of the ProofGate configuration, computed after the stacks are built. The protected bucket cannot be replaced.
   */
  readonly configFor?: (app: App) => { readonly allowedPolicyWriters?: readonly string[] };
  /** appへ1つ以上のスタックを追加します。RS-13のように複数のスタックを作る場合があります。 */
  readonly build: (app: App) => void;
}
