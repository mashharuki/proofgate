import { PolicyStatement } from "aws-cdk-lib/aws-iam";
import { PROTECTED_BUCKET_ARN } from "../config.js";
import { dataRole, developerRole, passRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は危険です。1.0で修正した3つの形をすべて使います。
 * (1) データロールの許可は保護対象バケットの一部（reports/*）だけ。
 * (2) PassRoleのResourceのロール名が`?`を含む。
 * (3) Lambdaの制御が、設定更新とコード更新の2つのStatementに分かれている。
 */
export const rs03: Pattern = {
  id: "RS-03",
  title: "A prefix grant, a ? wildcard, and split Lambda statements",
  description:
    "The data role can read only a prefix of the protected bucket. The PassRole resource uses a ? in the role name, and Lambda control is split into an update-configuration and an update-code statement. Each form was missed before version 1.0.",
  groundTruth: "unsafe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    dataRole(stack, [`${PROTECTED_BUCKET_ARN}/reports/*`]);
    developerRole(stack, [
      passRole(["arn:aws:iam::123456789012:role/data-rol?"]),
      new PolicyStatement({ actions: ["lambda:UpdateFunctionConfiguration"], resources: ["*"] }),
      new PolicyStatement({ actions: ["lambda:UpdateFunctionCode"], resources: ["*"] }),
    ]);
  },
};
