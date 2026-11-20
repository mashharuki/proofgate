import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";

/** 正解は安全です（PassRoleもLambda制御もありません）。grantReadWriteが非リテラルなResourceを作ります。 */
export const rs06: Pattern = {
  id: "RS-06",
  title: "A role with bucket.grantReadWrite",
  description:
    "A role that Lambda can assume gets read and write access to a CDK-created bucket through grantReadWrite. The stack has no PassRole permission, so it is safe. The generated resources are built from CloudFormation functions.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const role = new Role(stack, "Worker", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    new Bucket(stack, "Data").grantReadWrite(role);
  },
};
