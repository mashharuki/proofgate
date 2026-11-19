import type { Pattern } from "./pattern.js";

/** Patternの一覧です（IDの昇順）。各Patternのファイルをここへ登録します。 */
const catalog: readonly Pattern[] = [];

/**
 * 名前でPatternを選びます。未指定や未知の名前は、既定値へ逃がさずエラーにします。
 * 打ち間違いのまま別のスタックを検査してしまうことを防ぐためです。
 */
export function selectPattern(id: unknown, patterns: readonly Pattern[] = catalog): Pattern {
  const valid = patterns.map((pattern) => pattern.id).join(", ") || "(none)";
  if (typeof id !== "string" || id.length === 0) {
    throw new Error(`The context value "pattern" is required. Valid ids: ${valid}`);
  }
  const found = patterns.find((pattern) => pattern.id === id);
  if (found === undefined) {
    throw new Error(`Unknown pattern "${id}". Valid ids: ${valid}`);
  }
  return found;
}
