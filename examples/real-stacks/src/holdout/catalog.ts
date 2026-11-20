import type { Pattern } from "../pattern.js";
import { rs15 } from "./rs-15.js";
import { rs16 } from "./rs-16.js";
import { rs17 } from "./rs-17.js";
import { rs18 } from "./rs-18.js";
import { rs19 } from "./rs-19.js";
import { rs20 } from "./rs-20.js";
import { rs21 } from "./rs-21.js";
import { rs22 } from "./rs-22.js";
/**
 * ホールドアウトのPatternの一覧です（spec proofgate-cdk-construct-support、Requirement 6）。
 * ルールの設計に使わず、実装の後に1回だけ実行して、一般化を確かめます。通常の一覧（catalog.ts）には入れません。
 * Hold-out Patterns: not used to design rules; run once after the implementation.
 */
export const holdoutCatalog: readonly Pattern[] = [rs15, rs16, rs17, rs18, rs19, rs20, rs21, rs22];
