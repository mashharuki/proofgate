import type { Pattern } from "./pattern.js";
import { rs01 } from "./patterns/rs-01.js";
import { rs02 } from "./patterns/rs-02.js";
import { rs03 } from "./patterns/rs-03.js";
import { rs04 } from "./patterns/rs-04.js";
import { rs05 } from "./patterns/rs-05.js";
import { rs06 } from "./patterns/rs-06.js";
import { rs07 } from "./patterns/rs-07.js";
import { rs08 } from "./patterns/rs-08.js";
import { rs09 } from "./patterns/rs-09.js";
import { rs10 } from "./patterns/rs-10.js";
import { rs11 } from "./patterns/rs-11.js";
import { rs12 } from "./patterns/rs-12.js";
import { rs13 } from "./patterns/rs-13.js";
import { rs14 } from "./patterns/rs-14.js";

/** Patternの一覧です（IDの昇順）。各Patternのファイルをここへ登録します。 */
const catalog: readonly Pattern[] = [
  rs01,
  rs02,
  rs03,
  rs04,
  rs05,
  rs06,
  rs07,
  rs08,
  rs09,
  rs10,
  rs11,
  rs12,
  rs13,
  rs14,
];

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
