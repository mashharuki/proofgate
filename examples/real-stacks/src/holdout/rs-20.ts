import { Role, ServicePrincipal } from "aws-cdk-lib/aws-iam";
import { Bucket } from "aws-cdk-lib/aws-s3";
import { PROTECTED_BUCKET_ARN } from "../config.js";
import { createFunction, developerRole, passRole, stackOf } from "../helpers.js";
import type { Pattern } from "../pattern.js";
/**
 * 正解は危険です。デプロイ用ロールが、実行ロールをroleArn（名前なしのロールへの参照）で渡せ、
 * Lambdaを作成でき、実行ロールは、固定の名前を持つ保護対象バケットを読めます（4条件がそろいます）。
 */
export const rs20: Pattern = {
  id: "RS-20",
  title: "A deploy role passes an unnamed execution role that reads the protected bucket",
  description:
    "A deploy role can pass the execution role through role.roleArn and can create Lambda functions. The execution role has no fixed name, trusts Lambda, and reads a bucket with the fixed name of the protected bucket, so all four conditions hold.",
  groundTruth: "unsafe",
  inScope: true,
  build(app) {
    const stack = stackOf(app);
    const bucket = new Bucket(stack, "Protected", {
      bucketName: PROTECTED_BUCKET_ARN.slice("arn:aws:s3:::".length),
    });
    const execution = new Role(stack, "Execution", {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });
    bucket.grantRead(execution);
    developerRole(stack, [passRole([execution.roleArn]), createFunction()]);
  },
};
