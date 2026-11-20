import { escalationPath, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は危険です。開発者ロールがデータロールをLambdaへ渡せ、Lambdaを作成でき、
 * データロールはLambdaが引き受けられて、保護対象バケットの全オブジェクトを読めます（4条件がそろいます）。
 */
export const rs02: Pattern = {
  id: "RS-02",
  title: "Literal roles, a complete escalation path",
  description:
    "A developer role can pass the data role and create Lambda functions. The data role trusts Lambda and can read every object of the protected bucket, so all four conditions hold.",
  groundTruth: "unsafe",
  inScope: true,
  build(app) {
    escalationPath(stackOf(app));
  },
};
