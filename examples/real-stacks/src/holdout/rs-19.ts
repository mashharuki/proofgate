import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Key } from "aws-cdk-lib/aws-kms";
import { stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/** 正解は安全です。ロールが鍵を使えるだけで、PassRoleもLambda作成もなく、S3も使いません。 */
export const rs19: Pattern = {
  id: "RS-19",
  title: "A KMS key with grantEncryptDecrypt to a role",
  description:
    "A role that Lambda can assume may encrypt and decrypt with a CDK-created key. The role has no S3 access and nobody can pass a role, so the stack is safe.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const role = new Role(stack, "Worker", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    new Key(stack, "Data").grantEncryptDecrypt(role);
  },
};
