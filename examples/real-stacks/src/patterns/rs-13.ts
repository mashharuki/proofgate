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
 * 正解は危険ですが、経路が2つのテンプレートにまたがるため、モデルの範囲外です。
 * ProofGateはテンプレートごとに検査し、開発者ロールとデータロールを同時には見ません。
 */
export const rs13: Pattern = {
  id: "RS-13",
  title: "The escalation path crosses two stacks",
  description:
    "A developer role in one stack can pass the data role by its literal ARN and create Lambda functions. The data role, which trusts Lambda and reads the protected bucket, is in another stack. ProofGate checks each template on its own.",
  groundTruth: "unsafe",
  inScope: false,
  boundary: "cross-template",
  build(app) {
    developerRole(stackOf(app, "DeveloperStack"), [passRole([DATA_ROLE_ARN]), createFunction()]);
    dataRole(stackOf(app, "DataStack"), [ALL_PROTECTED_OBJECTS]);
  },
};
