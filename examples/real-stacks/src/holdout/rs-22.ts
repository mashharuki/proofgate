import { Role } from "aws-cdk-lib/aws-iam";
import { createFunction, developerRole, passRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/**
 * 正解は危険ですが、渡されるロールはこのテンプレートの外にあるため、モデルの範囲外です
 * （取り込んだロールが保護対象バケットを読める、と仮定します）。
 */
export const rs22: Pattern = {
  id: "RS-22",
  title: "A deploy role passes an imported role",
  description:
    "A deploy role can pass a role that the stack imports by its ARN and can create Lambda functions. The imported role is defined elsewhere (it trusts Lambda and reads the protected bucket there), so the template alone does not show the path.",
  groundTruth: "unsafe",
  inScope: false,
  boundary: "cross-template",
  build(app) {
    const stack = stackOf(app);
    const imported = Role.fromRoleArn(
      stack,
      "Imported",
      "arn:aws:iam::123456789012:role/imported-execution",
    );
    developerRole(stack, [passRole([imported.roleArn]), createFunction()]);
  },
};
