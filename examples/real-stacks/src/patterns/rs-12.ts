import { PolicyStatement, Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { PROTECTED_BUCKET_ARN } from "../config.js";
import { stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/**
 * 正解は安全です（PassRoleもLambda制御もありません）。Resourceに、実行時に展開されるIAMポリシー変数を使います。
 * 1.0では、変数を評価せずに未対応として拒否します。
 */
export const rs12: Pattern = {
  id: "RS-12",
  title: "A policy variable in a resource",
  description:
    "A role can read the objects under a per-user prefix of the protected bucket, written with an IAM policy variable (the aws:username variable). Nobody can pass a role, so the stack is safe. ProofGate 1.0 does not evaluate policy variables.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const role = new Role(stack, "Reader", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    role.addToPolicy(
      new PolicyStatement({
        actions: ["s3:GetObject"],
        resources: [`${PROTECTED_BUCKET_ARN}/\${aws:username}/*`],
      }),
    );
  },
};
