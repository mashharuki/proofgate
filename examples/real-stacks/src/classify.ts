/**
 * 実測した結果（Result）を、正解（ground truth）と照らして6つの分類に分けます（design 5.2）。
 * ランナーと、表の整合性テストの両方が、この同じ関数を使います。
 */

/** ProofGateを有効にして合成したときの結果の取りうる値です。 */
export const RESULTS = [
  "accepted",
  "PG-IAM-003",
  "PG-IAM-004",
  "PG-IAM-005",
  "PG-IAM-003+PG-IAM-004",
  "PG-IAM-003+PG-IAM-005",
  "PG-IAM-004+PG-IAM-005",
  "PG-IAM-003+PG-IAM-004+PG-IAM-005",
] as const;

/** 分類の名前です。 */
export const CLASSES = [
  "correct detection",
  "correct acceptance",
  "rejected as unsupported",
  "false negative",
  "false positive",
  "outside the documented boundary",
] as const;
export type Class = (typeof CLASSES)[number];

/** どの分類にも当てはまらない組み合わせです。誤った名前で記録しないよう、例外にします。 */
export class ClassificationError extends Error {}

export interface ClassifyInput {
  readonly groundTruth: string;
  readonly inScope: boolean;
  readonly result: string;
}

export function classify({ groundTruth, inScope, result }: ClassifyInput): Class {
  if (groundTruth !== "safe" && groundTruth !== "unsafe") {
    throw new ClassificationError(`Unknown ground truth: ${String(groundTruth)}`);
  }
  if (!(RESULTS as readonly string[]).includes(result)) {
    throw new ClassificationError(`Unknown result: ${String(result)}`);
  }
  const detected = result.includes("PG-IAM-004") || result.includes("PG-IAM-005");
  const unsupportedOnly = result === "PG-IAM-003";
  const accepted = result === "accepted";

  if (groundTruth === "safe") {
    if (accepted) return "correct acceptance";
    if (detected) return "false positive";
    return "rejected as unsupported";
  }
  // ここから先は、正解が危険なPatternです。
  if (inScope) {
    if (detected) return "correct detection";
    if (unsupportedOnly) return "rejected as unsupported";
    return "false negative";
  }
  // 範囲外の危険なPatternは、受理されたときだけ「文書化した境界の外」です。それ以外は想定外の組み合わせです。
  if (accepted) return "outside the documented boundary";
  throw new ClassificationError(
    `An unsafe Pattern outside the modeled scope was not accepted (result: ${result}); it fits no class.`,
  );
}
