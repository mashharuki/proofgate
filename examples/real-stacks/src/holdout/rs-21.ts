import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { createFunction, developerRole, passRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/**
 * 正解は安全です。RS-20と同じ形ですが、実行ロールが読むバケットに名前がなく（CloudFormationが名前を付けます）、
 * 保護対象バケットではありません。
 */
export const rs21: Pattern = {
  id: "RS-21",
  title: "A deploy role passes an unnamed execution role that reads another bucket",
  description:
    "The layout of RS-20, but the execution role reads a bucket that has no name in the template, so CloudFormation generates a name. That bucket is not the protected bucket, so no path to the protected bucket exists.",
  groundTruth: "safe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const bucket = new Bucket(stack, "Data");
    const execution = new Role(stack, "Execution", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    bucket.grantRead(execution);
    developerRole(stack, [passRole([execution.roleArn]), createFunction()]);
  },
};
