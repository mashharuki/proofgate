import {
  createFunction,
  DATA_ROLE_ARN,
  dataRole,
  developerRole,
  passRole,
  stackOf,
} from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は安全です。開発者ロールはデータロールを渡せて、Lambdaも作れますが、
 * データロールが読めるのは保護対象ではない別のバケットだけで、権限昇格経路の4条件のうち「保護対象への到達」が成り立ちません。
 */
export const rs01: Pattern = {
  id: "RS-01",
  title: "Literal roles, the data role reaches another bucket",
  description:
    "A developer role can pass the data role and create Lambda functions. The data role can read only a bucket that is not protected, so no escalation path reaches the protected bucket.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    dataRole(stack, ["arn:aws:s3:::another-bucket/*"]);
    developerRole(stack, [passRole([DATA_ROLE_ARN]), createFunction()]);
  },
};
