import {
  ALL_PROTECTED_OBJECTS,
  createFunction,
  DATA_ROLE_ARN,
  dataRole,
  developerRole,
  passRole,
  stackOf,
} from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は危険です（RS-02と同じ経路）。ただし権限を`addToPolicy`ではなく、Roleの`inlinePolicies`で渡します。
 * テンプレートでは`AWS::IAM::Role`の`Policies`として表れ、抽出器の別の経路（ロール内のインラインポリシー）を通ります。
 * （`addToPolicy`が作るのも`AWS::IAM::Policy`なので、`iam.Policy`を別に作る書き方は、RS-02とテンプレートの形が同じになります。）
 */
export const rs04: Pattern = {
  id: "RS-04",
  title: "The same path, written as role-level inline policies",
  description:
    "The same escalation path as RS-02, but the permissions are passed as inlinePolicies of the roles. In the template they are the Policies property of the AWS::IAM::Role resources instead of separate AWS::IAM::Policy resources.",
  groundTruth: "unsafe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    dataRole(stack, [ALL_PROTECTED_OBJECTS], "inline");
    developerRole(stack, [passRole([DATA_ROLE_ARN]), createFunction()], "inline");
  },
};
